/**
 * Data model for the DataPod Water Quality Report, ported from the Python
 * prototype (`template_report/models.py`) that was verified against the
 * DataPod Water Quality Report template and the "Water Quality Metrics --
 * Source of Truth" doc before this port existed.
 *
 * Scope note carried over from the prototype: this module assumes sensor
 * data has ALREADY been queried and aggregated -- `buildReportInput.ts` is
 * the only place that talks to `QuerySensorData`. Nothing here touches the
 * device API or credentials; it only works with structured numbers handed
 * to it, so it stays testable without a live device.
 */

/**
 * "N/A" is for a parameter with no baseline at all -- distinct from "Normal", which means
 * "compared to a real baseline and found within it". This is any of the five numeric parameters
 * on a device whose registry thresholds are absent or fail validation
 * (`operatorThresholds.ts`) -- there is no reference-table fallback for any of them.
 *
 * "Qualitative" is for a parameter that is not judged against a numeric range at all
 * (turbidity -- see ParameterScale below). It is deliberately NOT the same as "N/A":
 * temperature has no range *yet* and gets one as soon as an operator sets a usable
 * threshold, whereas turbidity's value is not on a calibrated scale in the first place,
 * so a numeric verdict would be meaningless rather than merely unavailable. A
 * "Qualitative" row carries a ClarityBand instead, and never contributes an excursion
 * or exceedance to `overallStatus`.
 */
export type Flag = "Normal" | "Elevated" | "Low" | "Exceedance" | "N/A" | "Qualitative";

/**
 * Qualitative water-clarity bands for turbidity. The three cut points are operator-authoritative
 * -- supplied by the operator on 2026-09-10 (docs/timeline.md decision log),
 * replacing this project's own provisional 250 / 600 / 1005 edges. That is the opposite of
 * provisional: these are no longer a guess this project made in the absence of operator data,
 * they are the operator's own bands. The full derivation, both-units edge values, and the
 * half-open `[min, next)` convention live in referenceRanges.ts next to `TURBIDITY_BAND_EDGES`
 * and `clarityBandFor` -- read that docstring before touching a number here.
 */
export type ClarityBand = "Clear" | "Moderate" | "Turbid";

/**
 * How a parameter's values may legitimately be judged.
 *
 * - `"numeric"` (the default when absent): the value is a calibrated measurement, so comparing it
 *   against `baselineMin`/`baselineMax` produces a real verdict.
 * - `"relative-index"`: the value is monotonic but uncalibrated, and no operator range exists for
 *   it. Relative statements ("rose", "higher than last week") stay valid; in/out-of-range
 *   statements do not. Turbidity is the only parameter on this scale today.
 */
export type ParameterScale = "numeric" | "relative-index";
/**
 * "Not assessed" is distinct from "Normal": "Normal" means every numeric parameter was compared
 * against a real baseline and stayed inside it. A pod with no usable registry threshold for any
 * numeric parameter (no `thresholds` object, or every pair rejected by `operatorThresholds.ts`)
 * has nothing to compare -- printing "Normal" on its cover is a silent all-clear over a report
 * that checked nothing. `overallStatus` returns this only where it would otherwise have said
 * "Normal"; an Exceedance, a qualifying High event, an Elevated/Low flag, or any event (including
 * a turbidity-driven one, since turbidity has no baseline to be "not assessed" about) still wins.
 */
export type ReportStatus = "Normal" | "Watch" | "Action Required" | "Not assessed";
export type WaterBodyType = "Freshwater" | "Brackish" | "Estuarine" | "Marine";
/**
 * `diel`, `tidal` and `trend` are assigned from the series by `patterns.ts`; the other values
 * are only ever set by hand-built inputs (tests, the offline prototype data).
 */
export type Pattern = "diel" | "tidal" | "trend" | "event-driven" | "flat" | "irregular" | "unknown";

export type EventType =
  | "Sewage"
  | "Algal bloom"
  | "Stormwater"
  | "Industrial"
  | "Thermal"
  | "Saltwater intrusion"
  | "Acidic input"
  | "Hypoxia"
  | "Inconclusive";

export type Severity = "Low" | "Moderate" | "High";
export type CalibrationResult = "Pass" | "Review";
export type DriftResult = "None" | "Present";

export interface SiteMetadata {
  siteName: string;
  startDate: string; // ISO date, e.g. "2026-08-01"
  endDate: string;
  /**
   * The device's newest reading as a full timestamp; the period ends on it. Not printed: it lets
   * `generate_report` say how long the pod has been silent since `endDate`.
   */
  lastReadingAt?: string;
  reportDate: string;
  /** Newest in-window GPS fix. Absent when no reading in the window carried one (see
   * buildReportInput.ts) -- never defaulted to 0,0. */
  latitude?: number;
  longitude?: number;
  /** The API's own `best_location` label for that fix, e.g. "Seal Beach CA". */
  locationName?: string;
  waterBodyType: WaterBodyType;
  /**
   * Where `waterBodyType` came from. Printed alongside it, because the choice selects the entire
   * baseline table (`referenceRanges.ts`) and therefore every flag in Section 2 -- a reader who
   * disagrees with the classification needs to know whether to fix the device registry or the
   * deployment's WATER_TYPE. `"default"` means the registry did not say and the deployment
   * setting was used.
   */
  waterBodyTypeSource?: "device" | "default";
  /** Best-effort; no clean "client" field exists on DeviceSummary today -- see
   * buildReportInput.ts. */
  clientName: string;
}

/**
 * The reporting period exactly as the PDF prints it. `generate_report` hands the model this
 * string to quote, so the answer and the document cannot disagree about the dates: a model
 * asked to restate an ISO range has been seen to change the year.
 */
export const reportPeriod = (site: Pick<SiteMetadata, "startDate" | "endDate">): string => (
  `${site.startDate} to ${site.endDate}`
);

export const coordinatesStr = (site: SiteMetadata): string => {
  if (site.latitude === undefined || site.longitude === undefined) {
    // Wording no longer blames the registry: coordinates come off the readings, so an absent
    // value means no reading in the window carried a GPS fix.
    return site.locationName ?? "No GPS fix in the reporting period";
  }
  const ns = site.latitude >= 0 ? "N" : "S";
  const ew = site.longitude >= 0 ? "E" : "W";
  const fix = `${Math.abs(site.latitude).toFixed(4)}° ${ns}, ${Math.abs(site.longitude).toFixed(4)}° ${ew}`;
  return site.locationName ? `${fix}  (${site.locationName})` : fix;
};

export interface ParameterBaseline {
  /** Matches QuerySensorData's wire metric names (dissolved_oxygen, orp, ph, conductivity,
   * temperature, turbidity). */
  key: string;
  label: string; // exact template row label, e.g. "Dissolved Oxygen (mg/L)"
  unit: string;
  baselineMin: number;
  baselineMax: number;
  /**
   * How far outside baseline (as a fraction of the baseline width) counts as a full
   * Exceedance rather than a mild Elevated/Low. Not specified by any source document --
   * stays a configurable placeholder, same caveat as the Python prototype carried.
   */
  exceedanceMargin: number;
  /** True whenever this row has a real range to be compared against — from either source below.
   * False leaves the row at Flag "N/A" with no numbers printed. */
  hasFixedBaseline: boolean;
  /**
   * Where the numbers in `baselineMin`/`baselineMax` came from. Printed alongside them so a
   * reader knows this is a configured alert limit and, since it is this device's own registry
   * row, whose to go correct.
   *
   * - `"operator-threshold"` — this specific device's threshold pair from the backend's device
   *   registry (`minTemperature`/`maxTemperature`, `minPH`/`maxPH`, etc.), typed in by whoever
   *   deployed the pod and validated by `operatorThresholds.ts` before it is trusted. This is now
   *   the only source any numeric parameter's baseline can have — the "Water Quality Metrics —
   *   Source of Truth" document's reference-table ranges were vetoed in full by the project
   *   supervisor (2026-09-13, see docs/timeline.md) and no longer feed a baseline at all. There
   *   is no fallback: a parameter with no usable registry threshold has no baseline, exactly as
   *   temperature already behaved before the veto.
   *
   * Absent when `hasFixedBaseline` is false; there is no source for a baseline that does not
   * exist.
   */
  baselineSource?: BaselineSource;
  /**
   * One sentence about where this row's baseline came from, or about why it has none. Printed
   * in the parameter analysis so a reader is told which registry field to go fix rather than
   * just that a number is absent (`operatorThresholds.ts` writes the "why not" wording).
   */
  baselineNote?: string;
  /**
   * Defaults to `"numeric"` when absent, which is what every parameter but turbidity is. A
   * `"relative-index"` parameter must never produce a numeric excursion or exceedance claim --
   * `flagFor` short-circuits to "Qualitative" before any range arithmetic runs.
   */
  scale?: ParameterScale;
}

export type BaselineSource = "operator-threshold";

/** True for a parameter whose value is monotonic but uncalibrated -- turbidity today. */
export const isRelativeIndex = (b: Pick<ParameterBaseline, "scale">): boolean => (
  b.scale === "relative-index"
);

export interface ParameterStats {
  baseline: ParameterBaseline;
  min: number;
  max: number;
  mean: number;
  median: number;
  pattern: Pattern;
  /** Optional raw (epoch ms, value) series, used for pattern detection and excursion timestamps. */
  series?: Array<[number, number]>;
  excursionNote?: string;
}

export interface WQEvent {
  type: EventType;
  windowStartMs: number;
  windowEndMs: number;
  severity: Severity;
  parameterMovements: string;
  interpretation: string;
  followUp: string;
  /** 0-1; low confidence should lean toward "Inconclusive". */
  confidence: number;
  /**
   * The signature an `Inconclusive` event matched before the confidence floor downgraded it.
   * The heading never names it; a catalogue explanation approved at this confidence
   * (`minConfidence` below the floor) may still describe it, hedged (`narrative.ts`).
   */
  signature?: EventType;
  /**
   * The window covers most of the reporting period (`events.ts` PERSISTENT_WINDOW_SHARE), so it
   * reads as an offset from the configured thresholds rather than a discrete event.
   */
  persistent?: boolean;
}

/**
 * Every status here is **optional**, and an absent one renders as "Not assessed".
 *
 * That distinction is the point of the type. Drift, biofouling, and cross-sensor agreement have
 * no detector in this pipeline, and printing "Drift: None" for a check that never ran is a
 * fabricated clean bill of health -- the same class of claim as reporting a probe rail as a
 * measurement. A check that did not run says so.
 */
export interface DataQualityCheck {
  completenessPct: number;
  completenessNotes: string;
  calibrationStatus?: CalibrationResult;
  calibrationNotes: string;
  driftStatus?: DriftResult;
  driftNotes: string;
  biofoulingStatus?: DriftResult;
  biofoulingNotes: string;
  sensorAgreementStatus?: CalibrationResult;
  sensorAgreementNotes: string;
}

export interface ReportInput {
  site: SiteMetadata;
  parameters: ParameterStats[];
  events: WQEvent[];
  dataQuality?: DataQualityCheck;
}

/**
 * A value with its unit, or the bare value when the parameter has none.
 *
 * pH and the turbidity index have `unit: ""`, and every call site used to interpolate it
 * unconditionally -- producing "8.90  against the 7.8-8.3  site baseline" in Section 3 and a
 * trailing space on every event movement clause. Cosmetic in isolation, but these strings go
 * into a customer deliverable.
 */
export const withUnit = (value: string, unit: string): string => (unit ? `${value} ${unit}` : value);

/**
 * Below this, a classification is too weak to assert -- `events.ts` downgrades the event's type
 * to "Inconclusive", and `overallStatus` refuses to let it escalate the report past "Watch".
 *
 * It lives here rather than in events.ts because both of those consumers need it and types.ts is
 * the module events.ts already imports; the reverse direction would be a cycle.
 */
export const CONFIDENCE_FLOOR = 0.5;

/**
 * Two decimals below 1,000, none above.
 *
 * Conductivity runs in the tens of thousands and pH in single digits. Two decimals on both
 * overflowed the Parameter Data column ("68425.00" wrapped mid-number) and implied a precision
 * seawater conductivity does not have. The threshold is about column width and honest
 * significant figures -- nothing here is metric-aware.
 */
export const statValue = (v: number): string => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2));

/**
 * Share of the reporting period a parameter spent outside its baseline, 0-1, or `null` when the
 * question does not apply (no series, or no range to be outside of).
 *
 * Reported alongside the flag because a flag alone answers only "did this ever leave the range",
 * and min/max make one bad reading in 1,382 look identical to a month-long offset. Resolution is
 * the series bucket, not the reading: `buildReportInput` hands over bucket means, so this is
 * "share of buckets whose mean sat outside baseline" and must be labelled as approximate rather
 * than presented as exact time out of range.
 */
export const outOfRangeShare = (p: ParameterStats): number | null => {
  const b = p.baseline;
  if (isRelativeIndex(b) || !b.hasFixedBaseline || !p.series || p.series.length === 0) {
    return null;
  }
  const outside = p.series.filter(([, v]) => v < b.baselineMin || v > b.baselineMax).length;
  return outside / p.series.length;
};

/** probeAccuracy is injected rather than imported to keep this module free of the
 * reference-data import cycle. */
export const flagFor = (
  p: Pick<ParameterStats, "min" | "max" | "baseline">,
  probeAccuracy: (key: string, reading: number) => number,
): Flag => {
  const b = p.baseline;
  // Checked before anything else, and before `hasFixedBaseline`: a relative index has no
  // calibrated scale, so every comparison below (baseline edges, exceedance margin, probe noise
  // floor) would be arithmetic on a number that does not mean what the units say it means.
  // The caller renders a ClarityBand for this row instead -- see referenceRanges.clarityBandFor.
  if (isRelativeIndex(b)) {
    return "Qualitative";
  }
  if (!b.hasFixedBaseline) {
    return "N/A";
  }
  const width = b.baselineMax - b.baselineMin;
  const exceedanceMargin = width * b.exceedanceMargin;

  // Noise floor: don't flag an excursion the probe's own accuracy can't actually
  // distinguish from baseline (e.g. the DO probe is +/-0.05 mg/L -- a reading 0.02 mg/L
  // past the edge is noise, not a real reading change). Falls back to 0 where no probe
  // spec is on file (turbidity).
  const hiAccuracy = probeAccuracy(b.key, p.max);
  const loAccuracy = probeAccuracy(b.key, p.min);

  const exceedanceHi = b.baselineMax + Math.max(exceedanceMargin, hiAccuracy);
  const exceedanceLo = b.baselineMin - Math.max(exceedanceMargin, loAccuracy);
  if (p.max > exceedanceHi || p.min < exceedanceLo) {
    return "Exceedance";
  }
  if (p.max > b.baselineMax + hiAccuracy) {
    return "Elevated";
  }
  if (p.min < b.baselineMin - loAccuracy) {
    return "Low";
  }
  return "Normal";
};

export const heldSteady = (
  p: ParameterStats,
  flag: Flag,
): boolean => flag === "Normal" && (p.pattern === "flat" || p.pattern === "unknown");

/**
 * Which rung of `assessStatus`'s ladder set the status. `"normal"` is the only rung with no
 * cause to name.
 */
export type StatusRule =
  | "exceedance"
  | "high-confidence-high-event"
  | "excursion"
  | "event"
  | "no-baseline"
  | "normal";

export interface StatusAssessment {
  status: ReportStatus;
  rule: StatusRule;
  /**
   * The parameters behind the rule, by `ParameterBaseline.key`: the ones flagged at that rung's
   * level for `"exceedance"` and `"excursion"`, and empty for the event rules and the rest.
   */
  parameters: string[];
}

/**
 * The report's status together with the reason for it. The status alone reached the model through
 * `generate_report`, and an Exceedance-driven "Action Required" with no events read as a
 * contradiction the model then papered over ("Action Required ... no abnormal conditions were
 * reported", `docs/migration/CONVERSATION_QA_2026-09-24.md` finding 3). Computing the reason on
 * the same ladder as the status, rather than beside it, keeps the two from ever disagreeing.
 *
 * Note which flags are and are not consulted: "N/A" and "Qualitative" match none of the branches
 * below, on purpose. A parameter with no range (temperature) and a parameter on an uncalibrated
 * scale (turbidity) cannot raise or lower the report's status, because neither can be shown to
 * have left a range. Turbidity still reaches the status indirectly and legitimately, through
 * events.ts, which reads its *relative movement* rather than a range crossing.
 *
 * One more branch sits below the escalation ladder: a device with no usable baseline for any
 * numeric parameter returns "Not assessed" rather than falling through to "Normal" -- see
 * ReportStatus's docstring for why a silent all-clear there is the wrong default.
 */
export const assessStatus = (
  report: ReportInput,
  probeAccuracy: (key: string, reading: number) => number,
): StatusAssessment => {
  const flagOf = (p: ParameterStats): Flag => flagFor(p, probeAccuracy);
  const flagged = (flags: Flag[]): string[] => report.parameters
    .filter((p) => flags.includes(flagOf(p)))
    .map((p) => p.baseline.key);

  const exceeded = flagged(["Exceedance"]);
  if (exceeded.length > 0) {
    return { status: "Action Required", rule: "exceedance", parameters: exceeded };
  }
  // Severity alone used to escalate here, and severity is computed from duration alone. A
  // 30%-confidence window that events.ts had already downgraded to "Inconclusive" therefore put
  // "Action Required" on the cover and made narrative.ts recommend notifying an authority -- the
  // report telling someone to escalate on evidence the same report calls too weak to name. An
  // event below the floor can still reach "Watch" below; it just cannot demand action.
  if (report.events.some((e) => e.severity === "High" && e.confidence >= CONFIDENCE_FLOOR)) {
    return { status: "Action Required", rule: "high-confidence-high-event", parameters: [] };
  }
  const excursions = flagged(["Elevated", "Low"]);
  if (excursions.length > 0) {
    return { status: "Watch", rule: "excursion", parameters: excursions };
  }
  if (report.events.length > 0) {
    return { status: "Watch", rule: "event", parameters: [] };
  }
  // Every escalation above wins first. Only what would otherwise be a silent "Normal" gets
  // downgraded here: if not one non-relative-index parameter has a real baseline, nothing was
  // actually compared, and "Normal" would claim a clean bill of health this report never checked
  // for. Turbidity is excluded via isRelativeIndex because it never has a baseline to begin with
  // -- its absence must not, by itself, produce "Not assessed" on a device where every numeric
  // metric is fine.
  const anyNumericBaseline = report.parameters.some(
    (p) => !isRelativeIndex(p.baseline) && p.baseline.hasFixedBaseline,
  );
  if (!anyNumericBaseline) {
    return { status: "Not assessed", rule: "no-baseline", parameters: [] };
  }
  return { status: "Normal", rule: "normal", parameters: [] };
};

/** The status alone, for the PDF and every caller that does not need the reason. */
export const overallStatus = (
  report: ReportInput,
  probeAccuracy: (key: string, reading: number) => number,
): ReportStatus => assessStatus(report, probeAccuracy).status;
