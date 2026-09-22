/**
 * Turns a ReportInput into the prose sections of the template (Summary, Parameter Analysis,
 * Event Detection interpretation lines, Recommendations). Ported from the Python prototype's
 * `narrative.py`.
 *
 * Deliberately no LLM call: per the team's zero-AI-calls decision for report generation (Slack,
 * confirmed with Michael), this is the only narrative path -- there is no LLM-prompt fallback
 * here, unlike the Python prototype, which kept one as a documented-but-unused option. If that
 * decision changes, port `build_narrative_prompt` from `template_report/narrative.py` at that
 * point rather than resurrecting it speculatively now.
 */

import type {
  ParameterStats, ReportInput, ReportStatus, WQEvent,
} from "./types";
import {
  flagFor, heldSteady, isRelativeIndex, outOfRangeShare, statValue, withUnit,
} from "./types";
import { clarityBandFor, isOffScaleTurbidity, TURBIDITY_SCALE_CAVEAT } from "./referenceRanges";
import { entriesFor, entryText, waterClassFor } from "../catalogue/select";
import type { Finding, UsableGuidance } from "../catalogue/select";
import type { CatalogueEntry, RecommendationSlot, WaterClass } from "../catalogue/types";

/**
 * Section 4's wording for one event. The event itself (`events.ts`) says what was detected; this
 * says what the report may claim about it, which is only what the guidance catalogue approves.
 */
export interface EventNarrative {
  /** The event type when an approved explanation names it, otherwise a neutral heading. */
  heading: string;
  /** False when no approved explanation matched, so no cause (or confidence in one) is shown. */
  causeNamed: boolean;
  interpretation: string;
  followUp: string;
}

export interface NarrativeSections {
  /** Rendered as a bulleted list, not a paragraph. */
  summaryBullets: string[];
  /** label -> text; parameters that held steady are omitted. */
  parameterAnalysis: Map<string, string>;
  recommendationsOperational: string;
  recommendationsInvestigative: string;
  recommendationsStakeholder: string;
  /** One per `report.events` entry, in the same order. */
  events: EventNarrative[];
  /** The catalogue version and every entry id this report used, for the audit trail. */
  catalogueVersion: string;
  guidanceIds: string[];
}

/** The heading for an event whose cause the catalogue does not let the report name. */
export const UNEXPLAINED_HEADING = "Threshold crossing";

/** A recommendation slot with no approved entry for this report's findings. */
export const NO_APPROVED_STEP = "No approved recommendation covers these findings yet.";

const UNEXPLAINED_INTERPRETATION = "Readings crossed this pod's configured thresholds. No approved "
  + "explanation covers this pattern, so the report does not name a cause.";

const byKind = (entries: CatalogueEntry[], kind: CatalogueEntry["kind"]): CatalogueEntry[] => (
  entries.filter((e) => e.kind === kind)
);

/**
 * The finding an event is selected under. An event with no approved explanation is treated as
 * `Inconclusive` for every other entry too: recommending, say, bacteria testing next to a heading
 * that names no cause would state the unapproved cause by implication.
 */
const eventFinding = (
  event: WQEvent,
  water: WaterClass,
  guidance: UsableGuidance,
): { finding: Finding; causeNamed: boolean } => {
  const finding: Finding = {
    trigger: event.type,
    water,
    confidence: event.confidence,
    severity: event.severity,
  };
  const causeNamed = event.type !== "Inconclusive"
    && byKind(entriesFor(guidance.entries, finding), "explanation").length > 0;
  return {
    finding: causeNamed ? finding : { ...finding, trigger: "Inconclusive" },
    causeNamed,
  };
};

const eventNarrative = (
  event: WQEvent,
  matched: CatalogueEntry[],
  causeNamed: boolean,
  guidance: UsableGuidance,
): EventNarrative => {
  const hours = (event.windowEndMs - event.windowStartMs) / 3_600_000;
  const duration = event.persistent
    ? "Readings stayed outside the configured thresholds for most of the period, which points at "
      + "thresholds that do not fit this site at least as strongly as at a single incident."
    : `The change lasted ${hours.toFixed(1)} hours.`;
  const explanations = byKind(matched, "explanation")
    .map((e) => `${entryText(e, guidance)} ${e.limitations}`);
  const limitations = byKind(matched, "limitation").map((e) => entryText(e, guidance));
  const interpretation = [
    ...(causeNamed ? explanations : [UNEXPLAINED_INTERPRETATION]),
    ...limitations,
    duration,
  ].join(" ");
  const steps = byKind(matched, "next-step").map((e) => e.title);
  return {
    heading: causeNamed ? event.type : UNEXPLAINED_HEADING,
    causeNamed,
    interpretation,
    followUp: steps.length > 0 ? `${steps.join("; ")} (see Recommendations).` : NO_APPROVED_STEP,
  };
};

/** Next steps for a slot, deduplicated, in catalogue order, or the no-approved-step line. */
const slotText = (
  slot: RecommendationSlot,
  matched: CatalogueEntry[],
  guidance: UsableGuidance,
): string => {
  const steps = guidance.entries.filter((e) => e.slot === slot && matched.includes(e));
  return steps.length > 0 ? steps.map((e) => entryText(e, guidance)).join(" ") : NO_APPROVED_STEP;
};

const patternPhrase: Record<ParameterStats["pattern"], string> = {
  diel: "followed a clear diel rhythm",
  tidal: "tracked the tidal cycle",
  "event-driven": "was flat outside a discrete excursion window",
  flat: "held steady",
  irregular: "showed irregular, non-periodic variation",
  unknown: "showed no clearly classified pattern",
};

/** Uppercases only the first character, leaving the rest untouched -- unlike a naive
 * capitalize(), which would also lowercase interior text such as "ORP" or "mg/L". */
const sentenceCase = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Finds when a parameter first left baseline, from raw series if present. */
const firstExcursionTimestamp = (p: ParameterStats): string | null => {
  if (!p.series || p.series.length === 0) {
    return null;
  }
  const b = p.baseline;
  const sorted = [...p.series].sort((a, b2) => a[0] - b2[0]);
  const excursion = sorted.find(([, v]) => v < b.baselineMin || v > b.baselineMax);
  return excursion ? new Date(excursion[0]).toISOString().slice(0, 16).replace("T", " ") : null;
};

/** How far past the baseline edge, relative to the baseline's own width. */
const magnitudeWord = (extreme: number, edge: number, width: number): string => {
  if (width <= 0) {
    return "";
  }
  const overshoot = Math.abs(extreme - edge) / width;
  if (overshoot < 0.05) return "marginally";
  if (overshoot < 0.2) return "slightly";
  if (overshoot < 0.5) return "notably";
  return "sharply";
};

/**
 * Direction of travel across the reporting period, from the parameter's own series.
 *
 * This is the piece of a relative index that stays legitimate when the absolute value does not:
 * the conversion behind turbidity is monotonic, so "it rose" is a real observation even though
 * "it was 1,006 NTU" is not a calibrated one. Compares the first half of the series against the
 * second half rather than endpoint-to-endpoint, so one noisy bucket at either end cannot invent
 * a trend.
 *
 * The deadband is a fraction of the period mean, because a relative index has no natural units
 * to set an absolute one in. A period that never moves (including an all-zero one, which is a
 * real reading for turbidity) reports "held steady" rather than a direction.
 */
const TREND_DEADBAND_FRACTION = 0.1;

const trendWord = (p: ParameterStats): string => {
  if (!p.series || p.series.length < 2) {
    return "no trend available for the period";
  }
  const sorted = [...p.series].sort((a, b) => a[0] - b[0]);
  const mid = Math.floor(sorted.length / 2);
  const meanOf = (points: Array<[number, number]>): number => (
    points.reduce((sum, [, v]) => sum + v, 0) / points.length
  );
  const first = meanOf(sorted.slice(0, mid));
  const second = meanOf(sorted.slice(mid));
  const deadband = Math.abs(p.mean) * TREND_DEADBAND_FRACTION;
  const delta = second - first;
  if (Math.abs(delta) <= deadband) {
    return "held steady across the period";
  }
  return delta > 0 ? "rising across the period" : "falling across the period";
};

/**
 * The analysis line for a parameter on an uncalibrated relative scale (turbidity).
 *
 * Says three things and no more than three: which band the period sits in, the supporting
 * numbers so a reader can compare this report against the next one, and what the number
 * actually is. It deliberately makes no in/out-of-range claim -- there is no range. When the
 * period mean is off-scale (see `isOffScaleTurbidity`), it adds a fourth, conditional sentence:
 * the reading is at or beyond the top of the conversion's own scale, which points at the sensor
 * or its wiring at least as readily as it points at turbid water.
 */
const relativeIndexAnalysisLine = (p: ParameterStats): string => {
  const band = clarityBandFor(p.mean);
  const minBand = clarityBandFor(p.min);
  const maxBand = clarityBandFor(p.max);
  const spread = minBand === maxBand
    ? ""
    : ` The period spanned ${minBand.toLowerCase()} to ${maxBand.toLowerCase()} conditions.`;
  const offScale = isOffScaleTurbidity(p.mean)
    ? " This reading is at or beyond the top of the conversion's scale, which indicates a "
      + "sensor or wiring problem as readily as it indicates turbid water -- worth checking "
      + "against turbVolt directly."
    : "";
  return `Water clarity read as ${band} for the period (relative index mean `
    + `${p.mean.toFixed(1)}, range ${p.min.toFixed(1)}-${p.max.toFixed(1)}), `
    + `${trendWord(p)}.${spread} ${TURBIDITY_SCALE_CAVEAT}${offScale}`;
};

const paramAnalysisLine = (
  p: ParameterStats,
  probeAccuracy: (key: string, reading: number) => number,
): string => {
  const b = p.baseline;
  const flag = flagFor(p, probeAccuracy);
  const phrase = patternPhrase[p.pattern];

  // "site baseline" for a reviewed reference range; "operator-set threshold for this device" for
  // one read off the device registry. The two carry different authority and the sentence has to
  // say which it used -- same rule the header applies to the water body type.
  const baselineTerm = b.baselineSource === "operator-threshold"
    ? "operator-set threshold for this device"
    : "site baseline";

  let text: string;
  if (flag === "Qualitative") {
    text = relativeIndexAnalysisLine(p);
  } else if (flag === "N/A") {
    text = `${sentenceCase(phrase)}. No baseline is established for this parameter -- reported `
      + "for reference only, not flagged against a range.";
  } else if (flag === "Normal") {
    text = `${sentenceCase(phrase)}, remaining within the `
      + `${withUnit(`${b.baselineMin}-${b.baselineMax}`, b.unit)} ${baselineTerm}.`;
  } else {
    const width = b.baselineMax - b.baselineMin;
    // BOTH directions, not the one the flag happened to be derived from. This used to pick a
    // single side -- so dissolved oxygen printed its 23.32 mg/L peak and never mentioned the
    // 1.72 mg/L minimum in the same period, which is the near-hypoxic number a reader would
    // actually act on. A parameter that left the range at both ends says so at both ends.
    const excursions = [
      p.max > b.baselineMax
        ? `${magnitudeWord(p.max, b.baselineMax, width)} above it to `
          + `${withUnit(statValue(p.max), b.unit)}`
        : null,
      p.min < b.baselineMin
        ? `${magnitudeWord(p.min, b.baselineMin, width)} below it to `
          + `${withUnit(statValue(p.min), b.unit)}`
        : null,
    ].filter((clause): clause is string => clause !== null);
    const article = "aeiou".includes(flag.toLowerCase()[0]) ? "an" : "a";
    text = `${sentenceCase(phrase)}; against the `
      + `${withUnit(`${b.baselineMin}-${b.baselineMax}`, b.unit)} ${baselineTerm} it moved `
      + `${excursions.join(" and ")}, recorded as ${article} ${flag.toLowerCase()}.`;
    // How much of the period, not just whether it ever happened: min/max alone make one bad
    // reading in 1,382 read exactly like a month-long offset.
    const share = outOfRangeShare(p);
    if (share !== null) {
      text += ` Outside baseline in ${(share * 100).toFixed(0)}% of the period's series buckets.`;
    }
    const excursionTime = firstExcursionTimestamp(p);
    if (excursionTime) {
      text += ` First left baseline at ${excursionTime}.`;
    }
  }
  // Provenance travels with the numbers, and the "why not" travels with their absence -- see
  // ParameterBaseline.baselineNote.
  if (b.baselineNote) {
    text += ` ${b.baselineNote}`;
  }
  if (p.excursionNote) {
    text += ` ${p.excursionNote}`;
  }
  return text;
};

/**
 * `guidance` is the catalogue content this deployment may show (`src/catalogue/index.ts`).
 * Possible causes and every recommendation for a flagged period come only from it; the routine
 * and "not assessed" lines below are about monitoring and configuration, not about the water.
 */
export const deterministicNarrative = (
  report: ReportInput,
  probeAccuracy: (key: string, reading: number) => number,
  status: ReportStatus,
  guidance: UsableGuidance,
): NarrativeSections => {
  // "N/A" is excluded alongside "Normal": it means the parameter has no baseline to be outside
  // of (temperature on a device with no usable registry threshold -- see operatorThresholds.ts),
  // not that it moved. Listing it under "moved outside the site baseline" claimed an excursion
  // against a range the report itself prints as "Not established".
  //
  // "Qualitative" is excluded for the stronger version of the same reason: turbidity is on an
  // uncalibrated relative scale with no operator range at all, so it can never be "outside the
  // site baseline". It gets its own bullet below instead of being folded into an excursion list.
  const nonNormal = report.parameters
    .filter((p) => !["Normal", "N/A", "Qualitative"].includes(flagFor(p, probeAccuracy)));

  // Turbidity always gets a summary line, whatever the band -- it is a deliberately reported
  // metric, and silence would read as "not measured" rather than "measured and clear".
  const clarityBullets = report.parameters
    .filter((p) => isRelativeIndex(p.baseline))
    .map((p) => {
      const offScale = isOffScaleTurbidity(p.mean)
        ? " Off-scale: check against turbVolt directly."
        : "";
      return `${p.baseline.label}: ${clarityBandFor(p.mean)} (relative index mean `
        + `${p.mean.toFixed(1)}, ${trendWord(p)}) — operator-authoritative bands over an `
        + "uncalibrated scale with no operator range; reported as a band, not judged "
        + `against one.${offScale}`;
    });

  let summaryBullets: string[];
  if (status === "Not assessed") {
    // overallStatus only returns this when no non-relative-index parameter has a fixed baseline
    // and no event fired -- say so plainly rather than let the reader mistake this for "Normal"
    // with nothing to report. Turbidity's clarity bullets still print: it was measured, even
    // though it never had a baseline to be "not assessed" about.
    summaryBullets = [
      `Overall status: ${status} — no numeric parameter could be compared against a baseline `
        + "this period, because this device has no usable registry thresholds.",
      `This is not a clean result; it means nothing was checked for the ${report.site.startDate} `
        + `to ${report.site.endDate} reporting period. See each parameter's note in Section 3 for `
        + "which registry field is missing or invalid.",
      ...clarityBullets,
      "Recommendation: set operator minimum/maximum thresholds for this device in the registry "
        + "so future reports can compare readings against a baseline.",
    ];
  } else if (report.events.length === 0 && status === "Normal") {
    summaryBullets = [
      `Overall status: ${status} — no action required at this time.`,
      `Every parameter with a site baseline held within it for the ${report.site.startDate} to `
        + `${report.site.endDate} reporting period.`,
      "No pollution event signatures were identified; diel and tidal rhythms tracked the site "
        + "baseline throughout.",
      ...clarityBullets,
      "Recommendation: continue routine monitoring.",
    ];
  } else {
    const flagged = nonNormal.length > 0 ? nonNormal.map((p) => p.baseline.label).join(", ") : "no parameters";
    const eventClause = report.events.length > 0
      ? `${report.events.length} candidate event(s) were identified`
      : "no discrete pollution events were identified, though readings moved outside baseline";
    summaryBullets = [
      `Overall status: ${status}.`,
      `${sentenceCase(flagged)} moved outside the site baseline for the ${report.site.startDate} `
        + `to ${report.site.endDate} reporting period.`,
      `${sentenceCase(eventClause)}.`,
      ...clarityBullets,
      "Recommendation: see Recommendations below for the operational, investigative, and "
        + "stakeholder follow-up.",
    ];
  }

  const parameterAnalysis = new Map<string, string>();
  report.parameters
    .filter((p) => !heldSteady(p, flagFor(p, probeAccuracy)))
    .forEach((p) => parameterAnalysis.set(p.baseline.label, paramAnalysisLine(p, probeAccuracy)));

  const water = waterClassFor(report.site.waterBodyType);
  const selections = report.events.map((event) => {
    const { finding, causeNamed } = eventFinding(event, water, guidance);
    return { event, causeNamed, matched: entriesFor(guidance.entries, finding) };
  });
  const events = selections.map(({ event, causeNamed, matched }) => (
    eventNarrative(event, matched, causeNamed, guidance)
  ));

  let operational: string;
  let investigative: string;
  let stakeholder: string;
  let used: CatalogueEntry[] = [];
  if (status === "Not assessed") {
    operational = "Set operator minimum/maximum thresholds for this device in the registry; "
      + "no baseline is currently established for any numeric parameter.";
    investigative = "None required this period -- there is no baseline to confirm a reading "
      + "against.";
    stakeholder = "Notify client that this device has no usable registry thresholds, so no "
      + "parameter could be compared against a baseline this period.";
  } else if (nonNormal.length > 0 || report.events.length > 0) {
    const crossing = nonNormal.length > 0
      ? entriesFor(guidance.entries, { trigger: "threshold-crossing", water })
      : [];
    used = [...crossing, ...selections.flatMap(({ matched }) => matched)];
    operational = slotText("operational", used, guidance);
    investigative = slotText("investigative", used, guidance);
    stakeholder = slotText("stakeholder", used, guidance);
  } else {
    operational = "No action needed; maintain routine calibration schedule.";
    investigative = "None required this period.";
    stakeholder = "Routine report distribution to client only.";
  }

  return {
    summaryBullets,
    parameterAnalysis,
    recommendationsOperational: operational,
    recommendationsInvestigative: investigative,
    recommendationsStakeholder: stakeholder,
    events,
    catalogueVersion: guidance.version,
    // Catalogue order, so the same findings always record the same list.
    guidanceIds: guidance.entries.filter((e) => used.includes(e)).map((e) => e.id),
  };
};
