/**
 * Rule-based event-candidate detector for Section 4 (Event Detection). Ported from the Python
 * prototype's `events.py`, logic and thresholds unchanged.
 *
 * Threshold-crossing detection only runs for parameters carrying a raw `series`; the algal-bloom
 * check needs a `dissolved_oxygen` series tagged "diel" specifically.
 *
 * Classification follows the "Pollution Event Signature Matrix" (source-of-truth doc section 4)
 * instead of an invented heuristic -- each rule below matches that document's "Primary Signature"
 * description for Sewage, Hypoxia, Thermal discharge, Acidic input, Saltwater intrusion,
 * Stormwater, and Industrial/chemical discharge. Two honest limits carried over from the doc
 * itself: (1) six parameters still under-determine some calls -- the doc's own matrix has several
 * events sharing overlapping signatures (Industrial is explicitly a catch-all "abrupt step-change
 * ... with no diel or tidal explanation"), and (2) confirming Saltwater intrusion or Stormwater
 * properly needs tidal-stage/rainfall context this pipeline doesn't have, so those stay capped at
 * moderate confidence even on a clean pattern match. Low confidence always degrades to
 * "Inconclusive" rather than asserting a specific cause. Anything this flags should go through
 * the Investigative recommendation (grab sample / source tracing) before being treated as a
 * real finding.
 */

import type {
  ParameterStats, ReportInput, WQEvent, EventType, Severity,
} from "./types";
import {
  CONFIDENCE_FLOOR, isRelativeIndex, statValue, withUnit,
} from "./types";

const MIN_EVENT_DURATION_MS = 60 * 60_000; // 1 hour
/** Re-exported under its original name: the constant moved to types.ts, which `overallStatus`
 * needs it in too (importing events.ts from there would be a cycle). */
export const CONFIDENCE_FLOOR_FOR_CLASSIFICATION = CONFIDENCE_FLOOR;

/**
 * A window covering at least this share of the reporting period is reported as a persistent
 * offset rather than as a discrete event.
 *
 * Not a detection change -- the window is still found, classified and printed. What changes is
 * the wording, because "the excursion lasted 720.0 hours" over a 30-day report is not an event
 * anyone can investigate; it is the whole period sitting off-range, which on the Algalita Pod
 * meant a pH mean of 7.00 against a seawater baseline of 7.8-8.3. The likelier cause is a
 * baseline that does not fit the site, and the report has to say so rather than describe a
 * month-long pollution incident.
 */
const PERSISTENT_WINDOW_SHARE = 0.8;

type Window = [number, number]; // [startMs, endMs]

/**
 * Threshold-crossing windows for the generic classifier below. Skips parameters tagged "diel"
 * or "tidal": the source-of-truth doc is explicit that ruling out the water body's normal rhythm
 * comes BEFORE calling something an event ("a smooth, repeating daily oscillation is biology,
 * not pollution ... the test for a real event is a step-change or sustained excursion that BREAKS
 * the expected diel/tidal rhythm"). A parameter already tagged diel/tidal is, by definition,
 * doing its expected periodic thing -- without this skip, a strong-but-normal diel swing crosses
 * baseline twice a day, every day, and this detector spams one near-duplicate "Inconclusive"
 * event per crossing instead of recognizing a single ongoing pattern.
 *
 * Real known gap, carried over unchanged: a genuine step-change that happens to interrupt a diel
 * rhythm (e.g. a discharge arriving on top of the normal cycle) won't be caught by this generic
 * detector either -- only `detectAlgalBloom` below looks inside a diel-tagged series at all, and
 * only for the DO/pH amplification pattern.
 */
const outsideBaselineWindows = (p: ParameterStats): Window[] => {
  if (
    !p.series || p.series.length === 0
    || p.pattern === "diel" || p.pattern === "tidal"
    // Temperature has no fixed baseline (see referenceRanges.ts) -- there is nothing to
    // threshold-cross against. The Python prototype never had a code path where this ran
    // without a baseline; this guard makes that assumption explicit rather than computing
    // against an undefined range.
    //
    // Turbidity is excluded by the same guard, and that is deliberate: a relative-index
    // parameter must never *originate* an event window, because "crossed a threshold" is the
    // one claim its uncalibrated scale cannot support. It still participates fully in
    // classifying a window some other parameter opened -- see `movementsIn` below, which reads
    // its relative movement rather than a range crossing. The sewage and stormwater signatures
    // therefore keep working.
    || !p.baseline.hasFixedBaseline
  ) {
    return [];
  }
  const b = p.baseline;
  const sorted = [...p.series].sort((a, b2) => a[0] - b2[0]);

  // A stateful sequential scan (running "start"/"prevT" across the sorted series) -- reduce
  // over forEach/for-of so the running state has one obvious home, rather than three outer lets.
  const { windows, start, prevT } = sorted.reduce<{
    windows: Window[]; start: number | null; prevT: number | null;
  }>((acc, [t, v]) => {
    const outside = v < b.baselineMin || v > b.baselineMax;
    let { start: accStart } = acc;
    if (outside && accStart === null) {
      accStart = t;
    }
    if (!outside && accStart !== null) {
      if (acc.prevT !== null && acc.prevT - accStart >= MIN_EVENT_DURATION_MS) {
        acc.windows.push([accStart, acc.prevT]);
      }
      accStart = null;
    }
    return { windows: acc.windows, start: accStart, prevT: t };
  }, { windows: [], start: null, prevT: null });

  if (start !== null && prevT !== null && prevT - start >= MIN_EVENT_DURATION_MS) {
    windows.push([start, prevT]);
  }
  return windows;
};

type Movement = "up" | "down";

interface ClassifyResult {
  type: EventType;
  confidence: number;
  rationale: string;
}

/**
 * moved: {param_key: 'up'|'down'}. Rules are checked most-specific-first and matched against the
 * source-of-truth doc's Pollution Event Signature Matrix (section 4). The rationale names the
 * alternative each pattern was checked against and why it was preferred or rejected, per the
 * template's instruction to justify a classification "and not an alternative" -- not just assert
 * one.
 */
const classify = (moved: Partial<Record<string, Movement>>): ClassifyResult => {
  const do_ = moved.dissolved_oxygen;
  const { orp } = moved;
  const cond = moved.conductivity;
  const { ph } = moved;
  const turb = moved.turbidity;
  const temp = moved.temperature;
  const movedCount = Object.keys(moved).length;

  // Sewage: "DO crash + ORP crash + EC rise + turbidity rise, not tied to time of day."
  if (do_ === "down" && orp === "down" && turb === "up") {
    if (cond === "up") {
      return {
        type: "Sewage",
        confidence: 0.7,
        rationale:
          "Dissolved oxygen and ORP fell together while conductivity and turbidity both rose "
          + "-- all four match the source-of-truth matrix's sewage/sanitary-discharge signature. "
          + "This is preferred over plain hypoxia because hypoxia alone would not be expected to "
          + "also lift conductivity and turbidity.",
      };
    }
    return {
      type: "Sewage",
      confidence: 0.5,
      rationale:
        "Dissolved oxygen and ORP fell together with a simultaneous turbidity rise, matching "
        + "most of the sewage/sanitary-discharge signature -- conductivity did not clear "
        + "baseline here, which is the one piece of the matrix signature missing, so this stays "
        + "a partial match rather than a confident one.",
    };
  }

  // Hypoxia / fish-kill: "DO and ORP both bottoming out together" with no EC or turbidity
  // movement -- what distinguishes it from sewage.
  if (do_ === "down" && orp === "down" && turb !== "up" && cond !== "up") {
    return {
      type: "Hypoxia",
      confidence: 0.6,
      rationale:
        "Dissolved oxygen and ORP fell together while conductivity and turbidity stayed within "
        + "baseline, matching the matrix's hypoxia/fish-kill signature specifically because "
        + "nothing else moved -- a sewage or organic-loading event would be expected to also "
        + "lift turbidity and/or conductivity, and neither did here.",
    };
  }

  // Thermal discharge: "Temperature rise with proportional DO decline; other chemistry flat."
  if (temp === "up" && do_ === "down" && orp === undefined && cond === undefined && ph === undefined && turb === undefined) {
    return {
      type: "Thermal",
      confidence: 0.6,
      rationale:
        "Temperature rose with a corresponding dissolved-oxygen decline (warmer water holds "
        + "less oxygen) while ORP, conductivity, pH, and turbidity all stayed flat -- matches "
        + "the matrix's thermal-discharge signature, which is specifically a temperature/DO pair "
        + "with no other chemistry moving. A broader event (industrial, sewage) would be "
        + "expected to move at least one of those other parameters too.",
    };
  }
  if (temp === "up" && movedCount === 1) {
    return {
      type: "Thermal",
      confidence: 0.4,
      rationale:
        "Temperature moved alone with no correlated shift in any other parameter. This is "
        + "consistent with a localized thermal input, but the matrix's full thermal signature "
        + "also expects a proportional DO decline, which is not present here -- treat as a "
        + "partial match.",
    };
  }

  // Acidic input (acid mine drainage / spill): "pH crash paired with EC rise (dissolved
  // metals/sulfate)."
  if (ph === "down" && cond === "up") {
    return {
      type: "Acidic input",
      confidence: 0.55,
      rationale:
        "pH fell while conductivity rose together, matching the matrix's acidic-input signature "
        + "(dissolved metals/sulfate raise conductivity as pH crashes) -- preferred over a "
        + "purely biological pH dip, which would not be expected to move conductivity at the "
        + "same time.",
    };
  }

  // Saltwater intrusion: "EC rise correlated with tidal phase, drought, or sea-level conditions"
  // -- isolated EC movement, everything else flat. Capped below the sewage/hypoxia ceiling
  // because confirming the tidal/drought correlation needs context this pipeline doesn't have.
  if (cond === "up" && do_ === undefined && orp === undefined && ph === undefined && turb === undefined) {
    return {
      type: "Saltwater intrusion",
      confidence: 0.45,
      rationale:
        "Conductivity rose in isolation with no accompanying DO, ORP, pH, or turbidity shift -- "
        + "matches the matrix's saltwater-intrusion signature better than industrial discharge, "
        + "which would typically carry a pH or ORP signature alongside the conductivity change. "
        + "Confidence is capped because confirming intrusion (vs. a discharge that happens to "
        + "look isolated) needs tidal-phase or drought context not available here.",
    };
  }

  // Stormwater / urban runoff: "Sharp turbidity spike coincident with rainfall; EC shifts (drops
  // in marine, may spike in fresh from road salt)." Turbidity is the dominant, defining signal;
  // EC direction is allowed either way per the matrix (fresh vs. marine differ).
  if (turb === "up" && cond !== undefined) {
    return {
      type: "Stormwater",
      confidence: 0.5,
      rationale:
        "Turbidity rose alongside a conductivity shift, matching the matrix's stormwater/runoff "
        + "signature (EC drops in marine water, can spike in freshwater from road salt, so "
        + "either direction fits). Preferred over sewage because dissolved oxygen and ORP did "
        + "not crash here. Confidence is capped without a rainfall record to confirm timing, "
        + "which the matrix lists as the confirming signal.",
    };
  }
  if (turb === "up") {
    return {
      type: "Stormwater",
      confidence: 0.4,
      rationale:
        "Turbidity rose on its own, consistent with runoff or resuspension, but the matrix's "
        + "stormwater signature also expects a conductivity shift alongside it, which is not "
        + "present -- treat as a partial match pending a rainfall-record check.",
    };
  }

  // Industrial / chemical discharge: the matrix's own signature is a catch-all -- "abrupt
  // step-changes in EC and/or pH and/or ORP with no diel or tidal explanation" -- so this only
  // fires after every more specific pattern above has been ruled out, and confidence stays low.
  if (cond === "up" || ph !== undefined || orp !== undefined) {
    return {
      type: "Industrial",
      confidence: 0.3,
      rationale:
        "Conductivity, pH, and/or ORP moved without matching any of the more specific "
        + "signatures (sewage, hypoxia, acidic input, saltwater intrusion) checked first -- the "
        + "matrix describes industrial/chemical discharge as exactly this kind of step-change "
        + "without a cleaner alternative explanation, but that makes it a fallback "
        + "classification, not a confident one.",
    };
  }

  return {
    type: "Inconclusive",
    confidence: 0.2,
    rationale:
      "The combination of parameter movements did not match any of the signatures in the "
      + "source-of-truth Pollution Event Signature Matrix closely enough to support a specific "
      + "classification.",
  };
};

const fmtTs = (ms: number): string => new Date(ms).toISOString();

/**
 * Algal bloom / eutrophication doesn't fit the threshold-crossing model the rest of this file
 * uses. The matrix's signature is an amplified IN-PHASE daily DO+pH oscillation --
 * supersaturation at midday, a crash pre-dawn -- which can happen within a single day even while
 * DO's overall min/max for the report period looks unremarkable. Needs a DO series tagged
 * "diel"; pH confirming the same swing raises confidence but isn't required.
 *
 * Known overlap, carried over unchanged: a day this flags may ALSO show up via the threshold
 * detector above (e.g. the pre-dawn crash alone could get classified as Hypoxia if ORP also
 * dips then). That's a real limitation of running two separate detection passes rather than one
 * unified one.
 */
const detectAlgalBloom = (report: ReportInput): WQEvent | null => {
  const byKey = new Map(report.parameters.map((p) => [p.baseline.key, p]));
  const do_ = byKey.get("dissolved_oxygen");
  if (!do_ || !do_.series || do_.series.length === 0 || do_.pattern !== "diel") {
    return null;
  }

  const b = do_.baseline;
  const byDay = do_.series.reduce<Map<string, Array<[number, number]>>>((map, [t, v]) => {
    const dayKey = new Date(t).toISOString().slice(0, 10);
    const points = map.get(dayKey) ?? [];
    points.push([t, v]);
    map.set(dayKey, points);
    return map;
  }, new Map());

  // Two passes (summarize each day, then find the first one that qualifies) instead of a
  // for-of loop with an early return in the middle of the scan.
  const bloomDay = [...byDay.keys()].sort()
    .map((day) => {
      const points = byDay.get(day)!;
      const vals = points.map(([, v]) => v);
      return {
        points, maxV: Math.max(...vals), minV: Math.min(...vals),
      };
    })
    .find(({ maxV, minV }) => maxV > b.baselineMax && minV < b.baselineMin);

  if (!bloomDay) {
    return null;
  }

  const { points, maxV, minV } = bloomDay;
  const dayStart = Math.min(...points.map(([t]) => t));
  const dayEnd = Math.max(...points.map(([t]) => t));
  const ph = byKey.get("ph");
  const phConfirms = Boolean(ph && ph.pattern === "diel" && ph.max > ph.baseline.baselineMax);
  const confidence = phConfirms ? 0.6 : 0.45;
  return {
    type: "Algal bloom",
    windowStartMs: dayStart,
    windowEndMs: dayEnd,
    severity: "Moderate",
    parameterMovements:
      `Dissolved oxygen swung from ${minV.toFixed(2)} to `
      + `${withUnit(maxV.toFixed(2), b.unit)} within a single day (baseline `
      + `${withUnit(`${b.baselineMin}-${b.baselineMax}`, b.unit)})${
        phConfirms ? "; pH showed a matching in-phase swing" : ""}`,
    interpretation:
      "Dissolved oxygen supersaturated at one point in the day and crashed below baseline "
      + "at another point within the same 24 hours, matching the source-of-truth matrix's "
      + `algal-bloom/eutrophication signature: large in-phase daily DO${
        phConfirms ? " and pH" : ""
      } oscillations, with the pre-dawn DO minimum as the danger window. This is a `
      + "daily-cycle pattern rather than a sustained baseline excursion, so it can appear "
      + `even when DO's overall min/max for the period looks unremarkable in isolation.${
        phConfirms
          ? ""
          : " pH did not show a matching swing here, which is the matrix's second "
          + "confirming signal, so confidence stays moderate rather than high."}`,
    followUp: "Grab sample",
    confidence,
  };
};

/**
 * How far a relative-index parameter's windowed average must sit from its own period average
 * before it counts as having moved, as a fraction of that period average.
 *
 * A relative index has no operator range and no calibrated units, so there is no absolute
 * threshold to set this in -- the parameter's own period average is the only reference point it
 * has. 0.25 is a deadband, not a finding: it is set wide enough that ordinary bucket-to-bucket
 * wobble does not register as a movement, and it is as PROVISIONAL as the conversion behind the
 * index itself (see referenceRanges.ts TURBIDITY_BAND_EDGES).
 *
 * A period whose average is 0 -- every reading at or above the clear-water reference voltage,
 * which is real and does happen -- gives a deadband of 0, so any non-zero window average reads
 * as "up". That is the correct call: rising from nothing to something is a genuine rise.
 */
const RELATIVE_MOVEMENT_FRACTION = 0.25;

/** Movement direction for every parameter that moved during `window`, plus the human-readable
 * clause describing each.
 *
 * Two different tests, because the two kinds of parameter support two different claims:
 *
 * - **Numeric** parameters move when the windowed average clears their baseline. That is an
 *   absolute statement about a calibrated measurement, and it is what the signature matrix's
 *   thresholds assume.
 * - **Relative-index** parameters (turbidity) move when the windowed average departs from the
 *   parameter's own period average. The index is monotonic even though it is not calibrated, so
 *   "rose during this window" is a real observation while "exceeded 25 NTU" is not. This is what
 *   keeps the matrix's sewage ("turbidity rise") and stormwater ("sharp turbidity spike")
 *   signatures working after turbidity stopped having a numeric baseline: `classify` only ever
 *   reads the direction, never the magnitude.
 */
const movementsIn = (
  parameters: ParameterStats[],
  [wStart, wEnd]: Window,
): { moved: Partial<Record<string, Movement>>; movementDesc: string[] } => parameters
  .filter((p) => p.series && p.series.length > 0
    && (p.baseline.hasFixedBaseline || isRelativeIndex(p.baseline)))
  .reduce<{ moved: Partial<Record<string, Movement>>; movementDesc: string[] }>((acc, p) => {
    const windowVals = p.series!.filter(([t]) => t >= wStart && t <= wEnd).map(([, v]) => v);
    if (windowVals.length === 0) {
      return acc;
    }
    const b = p.baseline;
    const avg = windowVals.reduce((s, v) => s + v, 0) / windowVals.length;

    if (isRelativeIndex(b)) {
      const deadband = Math.abs(p.mean) * RELATIVE_MOVEMENT_FRACTION;
      const delta = avg - p.mean;
      if (Math.abs(delta) <= deadband) {
        return acc;
      }
      const direction: Movement = delta > 0 ? "up" : "down";
      const extreme = direction === "up" ? Math.max(...windowVals) : Math.min(...windowVals);
      acc.moved[b.key] = direction;
      // No unit is printed and no baseline is named: the wording says what actually happened --
      // a relative move against the period's own average.
      acc.movementDesc.push(
        `${b.label} ${direction === "up" ? "rose" : "fell"} to a relative index of `
        + `${extreme.toFixed(2)}, against a period average of ${p.mean.toFixed(2)}`,
      );
      return acc;
    }

    // Both numbers, and what each one is. `windowVals` are series bucket means, so the peak here
    // is smaller than Section 2's Min/Max, which are exact per-bucket extremes over the whole
    // period -- printing the bucket-mean peak alone put "rose to 11.91 mg/L" in Section 4 next to
    // a table saying 23.32 mg/L, with nothing in the document explaining the difference.
    if (avg > b.baselineMax) {
      acc.moved[b.key] = "up";
      acc.movementDesc.push(
        `${b.label} rose to ${withUnit(statValue(Math.max(...windowVals)), b.unit)} on bucket `
        + `averages (period max ${withUnit(statValue(p.max), b.unit)})`,
      );
    } else if (avg < b.baselineMin) {
      acc.moved[b.key] = "down";
      acc.movementDesc.push(
        `${b.label} fell to ${withUnit(statValue(Math.min(...windowVals)), b.unit)} on bucket `
        + `averages (period min ${withUnit(statValue(p.min), b.unit)})`,
      );
    }
    return acc;
  }, { moved: {}, movementDesc: [] });

/** Builds one classified WQEvent for a merged candidate window, or null if nothing inside it
 * actually cleared any parameter's baseline (a merged window can outlive the excursion that
 * produced it once other parameters' windows are folded in). */
const eventForWindow = (
  parameters: ParameterStats[],
  window: Window,
  periodMs: number,
): WQEvent | null => {
  const [wStart, wEnd] = window;
  const { moved, movementDesc } = movementsIn(parameters, window);
  if (Object.keys(moved).length === 0) {
    return null;
  }

  const classified = classify(moved);
  const { confidence } = classified;
  let { type: eventType, rationale } = classified;
  if (confidence < CONFIDENCE_FLOOR_FOR_CLASSIFICATION && eventType !== "Inconclusive") {
    rationale += ` Confidence (${Math.round(confidence * 100)}%) falls short of the floor for `
      + `asserting '${eventType}' outright, so the classification below is downgraded to `
      + "Inconclusive pending confirmation.";
    eventType = "Inconclusive";
  }

  const durationHrs = (wEnd - wStart) / 3_600_000;
  const persistent = periodMs > 0 && (wEnd - wStart) / periodMs >= PERSISTENT_WINDOW_SHARE;
  const severity: Severity = (() => {
    // A persistent offset is capped: duration is what pushes an event to High, and a window
    // covering the whole report is long by definition -- it would otherwise be the most severe
    // finding in every report where the baseline simply does not fit the site.
    if (persistent) return "Moderate";
    if (durationHrs > 12) return "High";
    if (durationHrs > 3) return "Moderate";
    return "Low";
  })();
  const departureClause = (() => {
    if (persistent) {
      return "a sustained offset spanning the whole reporting period rather than a discrete "
        + "event -- readings that never return to baseline point at a baseline that does not fit "
        + "this site (check the water body type and the operator thresholds in the header) at "
        + "least as strongly as they point at a month-long incident";
    }
    return durationHrs > 1
      ? "a step departure from the baseline rather than normal variation"
      : "a brief excursion, borderline against normal variation";
  })();

  return {
    type: eventType,
    windowStartMs: wStart,
    windowEndMs: wEnd,
    severity,
    parameterMovements: movementDesc.length > 0 ? movementDesc.join("; ") : "movement not captured",
    interpretation:
      `${rationale} The excursion lasted ${durationHrs.toFixed(1)} hours, read here as `
      + `${departureClause}. Classification confidence: ${Math.round(confidence * 100)}%.${
        confidence < CONFIDENCE_FLOOR
          ? " Below the confidence floor for a named cause, so this event does not on its own "
            + "raise the report to Action Required."
          : ""}${
        confidence < 0.6 ? " Treat as tentative pending grab-sample confirmation." : ""}`,
    followUp: confidence < 0.6 ? "Grab sample" : "Notify stakeholder",
    confidence,
  };
};

export const detectEvents = (report: ReportInput): WQEvent[] => {
  const candidateWindows = report.parameters.flatMap((p) => outsideBaselineWindows(p));
  const algalBloom = detectAlgalBloom(report);

  if (candidateWindows.length === 0) {
    return algalBloom ? [algalBloom] : [];
  }

  // Merge overlapping windows across parameters into combined candidates.
  const merged = [...candidateWindows]
    .sort((a, b) => a[0] - b[0])
    .reduce<Window[]>((acc, [start, end]) => {
      const last = acc[acc.length - 1];
      if (last && start <= last[1]) {
        last[1] = Math.max(last[1], end);
      } else {
        acc.push([start, end]);
      }
      return acc;
    }, []);

  // The reporting period as the series actually covers it -- the site's start/end dates are
  // day-resolution strings, and this only has to be good enough to tell "most of the report"
  // from "an afternoon".
  const allTimes = report.parameters.flatMap((p) => (p.series ?? []).map(([t]) => t));
  const periodMs = allTimes.length > 0 ? Math.max(...allTimes) - Math.min(...allTimes) : 0;

  const events = merged
    .map((window) => eventForWindow(report.parameters, window, periodMs))
    .filter((e): e is WQEvent => e !== null);

  return algalBloom ? [...events, algalBloom] : events;
};

export { fmtTs as formatEventTimestamp };
