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
import { flagFor, heldSteady } from "./types";

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

const paramAnalysisLine = (
  p: ParameterStats,
  probeAccuracy: (key: string, reading: number) => number,
): string => {
  const b = p.baseline;
  const flag = flagFor(p, probeAccuracy);
  const phrase = patternPhrase[p.pattern];

  let text: string;
  if (flag === "N/A") {
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
  const nonNormal = report.parameters.filter((p) => flagFor(p, probeAccuracy) !== "Normal");

  let summaryBullets: string[];
  if (report.events.length === 0 && status === "Normal") {
    summaryBullets = [
      `Overall status: ${status} — no action required at this time.`,
      `All parameters held within the site baseline for the ${report.site.startDate} to `
        + `${report.site.endDate} reporting period.`,
      "No pollution event signatures were identified; diel and tidal rhythms tracked the site "
        + "baseline throughout.",
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
