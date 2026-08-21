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

import type { ParameterStats, ReportInput, ReportStatus } from "./types";
import { flagFor, heldSteady, isRelativeIndex } from "./types";
import { clarityBandFor, TURBIDITY_SCALE_CAVEAT } from "./referenceRanges";

export interface NarrativeSections {
  /** Rendered as a bulleted list, not a paragraph. */
  summaryBullets: string[];
  /** label -> text; parameters that held steady are omitted. */
  parameterAnalysis: Map<string, string>;
  recommendationsOperational: string;
  recommendationsInvestigative: string;
  recommendationsStakeholder: string;
}

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
 * actually is. It deliberately makes no in/out-of-range claim -- there is no range.
 */
const relativeIndexAnalysisLine = (p: ParameterStats): string => {
  const band = clarityBandFor(p.mean);
  const minBand = clarityBandFor(p.min);
  const maxBand = clarityBandFor(p.max);
  const spread = minBand === maxBand
    ? ""
    : ` The period spanned ${minBand.toLowerCase()} to ${maxBand.toLowerCase()} conditions.`;
  return `Water clarity read as ${band} for the period (relative index mean `
    + `${p.mean.toFixed(1)}, range ${p.min.toFixed(1)}-${p.max.toFixed(1)}), `
    + `${trendWord(p)}.${spread} ${TURBIDITY_SCALE_CAVEAT}`;
};

const paramAnalysisLine = (
  p: ParameterStats,
  probeAccuracy: (key: string, reading: number) => number,
): string => {
  const b = p.baseline;
  const flag = flagFor(p, probeAccuracy);
  const phrase = patternPhrase[p.pattern];

  let text: string;
  if (flag === "Qualitative") {
    text = relativeIndexAnalysisLine(p);
  } else if (flag === "N/A") {
    text = `${sentenceCase(phrase)}. No fixed baseline exists for this parameter (climate/`
      + "season-dependent per the source-of-truth doc) -- reported for reference only, not "
      + "flagged against a range.";
  } else if (flag === "Normal") {
    text = `${sentenceCase(phrase)}, remaining within the ${b.baselineMin}-${b.baselineMax} ${b.unit} site baseline.`;
  } else {
    const above = (flag === "Elevated" || flag === "Exceedance") && p.max > b.baselineMax;
    const direction = above ? "above" : "below";
    const extreme = above ? p.max : p.min;
    const edge = above ? b.baselineMax : b.baselineMin;
    const width = b.baselineMax - b.baselineMin;
    const magnitude = magnitudeWord(extreme, edge, width);
    const article = "aeiou".includes(flag.toLowerCase()[0]) ? "an" : "a";
    text = `${sentenceCase(phrase)}; moved ${magnitude} ${direction} baseline, recording ${article} `
      + `${flag.toLowerCase()} reading of ${extreme.toFixed(2)} ${b.unit} against the `
      + `${b.baselineMin}-${b.baselineMax} ${b.unit} baseline.`;
    const excursionTime = firstExcursionTimestamp(p);
    if (excursionTime) {
      text += ` First left baseline at ${excursionTime}.`;
    }
  }
  if (p.excursionNote) {
    text += ` ${p.excursionNote}`;
  }
  return text;
};

export const deterministicNarrative = (
  report: ReportInput,
  probeAccuracy: (key: string, reading: number) => number,
  status: ReportStatus,
): NarrativeSections => {
  // "N/A" is excluded alongside "Normal": it means the parameter has no fixed baseline to be
  // outside of (temperature -- see referenceRanges.ts), not that it moved. Listing it under
  // "moved outside the site baseline" claimed an excursion against a range the report itself
  // prints as "Not established".
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
    .map((p) => `${p.baseline.label}: ${clarityBandFor(p.mean)} (relative index mean `
      + `${p.mean.toFixed(1)}, ${trendWord(p)}) — provisional, uncalibrated scale with no `
      + "operator range; reported as a band, not judged against one.");

  let summaryBullets: string[];
  if (report.events.length === 0 && status === "Normal") {
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

  let operational: string;
  let investigative: string;
  let stakeholder: string;
  if (nonNormal.length > 0 || report.events.length > 0) {
    operational = "Recalibrate and inspect sensors on flagged parameters at next service window.";
    investigative = `Collect grab samples to confirm flagged readings${
      report.events.length > 0 ? " and corroborate event classification." : "."}`;
    stakeholder = `Notify client${
      report.events.some((e) => e.severity === "High") ? " and relevant authority given event severity." : "."}`;
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
  };
};
