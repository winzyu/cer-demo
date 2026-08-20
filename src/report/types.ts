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

/** "N/A" is for a parameter with no fixed baseline (temperature -- see referenceRanges.ts) --
 * distinct from "Normal", which means "compared to a real baseline and found within it". */
export type Flag = "Normal" | "Elevated" | "Low" | "Exceedance" | "N/A";
export type ReportStatus = "Normal" | "Watch" | "Action Required";
export type WaterBodyType = "Freshwater" | "Brackish" | "Estuarine" | "Marine";
export type Pattern = "diel" | "tidal" | "event-driven" | "flat" | "irregular" | "unknown";

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
  reportDate: string;
  /** Best-effort; the device registry does not guarantee these are set (see
   * buildReportInput.ts). */
  latitude?: number;
  longitude?: number;
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

export const coordinatesStr = (site: SiteMetadata): string => {
  if (site.latitude === undefined || site.longitude === undefined) {
    return "Not available from device registry";
  }
  const ns = site.latitude >= 0 ? "N" : "S";
  const ew = site.longitude >= 0 ? "E" : "W";
  return `${Math.abs(site.latitude).toFixed(4)}° ${ns}, ${Math.abs(site.longitude).toFixed(4)}° ${ew}`;
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
  /** Present only for parameters compared against a real range table; absent for temperature
   * (see referenceRanges.ts). */
  hasFixedBaseline: boolean;
}

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

/** probeAccuracy is injected rather than imported to keep this module free of the
 * reference-data import cycle. */
export const flagFor = (
  p: Pick<ParameterStats, "min" | "max" | "baseline">,
  probeAccuracy: (key: string, reading: number) => number,
): Flag => {
  const b = p.baseline;
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

export const overallStatus = (
  report: ReportInput,
  probeAccuracy: (key: string, reading: number) => number,
): ReportStatus => {
  const flagOf = (p: ParameterStats): Flag => flagFor(p, probeAccuracy);
  if (report.parameters.some((p) => flagOf(p) === "Exceedance")) {
    return "Action Required";
  }
  if (report.events.some((e) => e.severity === "High")) {
    return "Action Required";
  }
  if (report.parameters.some((p) => ["Elevated", "Low"].includes(flagOf(p)))) {
    return "Watch";
  }
  if (report.events.some((e) => ["Low", "Moderate"].includes(e.severity))) {
    return "Watch";
  }
  return "Normal";
};
