/**
 * `get_turbidity_info` -- a static, no-parameter tool that hands the model the interpretation
 * rules for turbidity, rather than a reading. Every number in the result is derived from
 * `src/report/referenceRanges.ts`'s exports (`TURBIDITY_BAND_EDGES`, `OFF_SCALE_INDEX`,
 * `TURBIDITY_CLEAR_VOLT`, `TURBIDITY_INDEX_PER_VOLT`,
 * `TURBIDITY_SCALE_CAVEAT`) rather than re-typed here, so the chat tool and the report's clarity
 * bands can never drift apart -- see that file's docstring for the full provenance (the operator's
 * 2026-09-10 bands, the backend's `turbVoltToNTU.ts` conversion).
 *
 * Why this exists as its own tool rather than a note on `query_sensor_data`'s turbidity field.
 * Turbidity is the one metric this service reports as a raw index with no operator-configured
 * range at all (`get_pod_thresholds` has no turbidity entry for the same reason), and its
 * zero/off-scale behaviour is easy to misread as "clear water" or "very turbid water" respectively
 * when it can just as well mean a missing or wired-wrong sensor. A model that has not been told
 * this reads a run of zeros as confirmed clarity and a 1006 mean as an extreme pollution event --
 * both wrong for the same underlying reason. Calling this once before characterising any turbidity
 * reading is cheaper than re-deriving the caveat from `query_sensor_data`'s note field every time.
 */

import {
  OFF_SCALE_INDEX,
  TURBIDITY_BAND_EDGES,
  TURBIDITY_CLEAR_VOLT,
  TURBIDITY_INDEX_PER_VOLT,
  TURBIDITY_SCALE_CAVEAT,
} from "../report/referenceRanges";
import type { ToolContext, ToolDefinition } from "../types/tool.types";

/**
 * The documented conversion's ceiling -- `NTU_MAX` in the backend's `turbVoltToNTU.ts` -- a fact
 * about the conversion, not a per-device number, so it is stated here rather than exported: no
 * other file in this repo needs it (`TURBIDITY_BAND_EDGES`'s docstring already records it).
 */
const INDEX_CLAMP_MAX = 4550;

/** Inverse of the forward conversion: the voltage that produces a given index. */
const voltageAtIndex = (index: number): number => (
  TURBIDITY_CLEAR_VOLT - index / TURBIDITY_INDEX_PER_VOLT
);

/** Rounds to hundredths so float noise (0.7000000000000002) never reaches the model. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The three operator bands, ascending by index, each with both an index range and a voltage
 * range. Derived from `TURBIDITY_BAND_EDGES` (which is stored descending, first-match-wins) plus
 * the voltage conversion -- never re-typed as 345/795/2.2/0.7.
 *
 * `null` marks the open end of a band: Clear has no voltage ceiling (a voltage above
 * `TURBIDITY_CLEAR_VOLT` still clamps to index 0 and reads as Clear), and Turbid has no voltage
 * floor (the input can go arbitrarily far below 0 V in the conversion's own terms, which is
 * exactly what the off-scale flag below is for).
 */
const bandsAscending = () => {
  const ascending = [...TURBIDITY_BAND_EDGES].sort((a, b) => a.min - b.min);
  return ascending.map((edge, i) => {
    const next = ascending[i + 1];
    return {
      band: edge.band,
      index_min: edge.min,
      index_max: next ? next.min : null,
      volt_min: next ? round2(voltageAtIndex(next.min)) : null,
      volt_max: i === 0 ? null : round2(voltageAtIndex(edge.min)),
    };
  });
};

export const getTurbidityInfoDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "get_turbidity_info",
    description:
      "Returns how this system's turbidity number is derived and how to interpret it: the "
      + "voltage conversion, the operator's three clarity bands (Clear, Moderate, Turbid) in "
      + "both volts and index units, the off-scale flag, and what a reading of zero can mean. "
      + "Call this before interpreting or characterising any turbidity value.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

/**
 * The tool's whole implementation. No class: nothing here holds state or takes options, unlike
 * `QuerySensorData`/`GenerateReport`, so `buildToolRegistry` wires this function in directly as
 * `run` (a `ToolHandler`'s `run` need not be a bound method -- see `tool.types.ts`).
 */
export const getTurbidityInfo = async (
  _args?: Record<string, unknown>,
  _context?: ToolContext,
): Promise<unknown> => ({
  what_it_is: TURBIDITY_SCALE_CAVEAT,
  conversion: {
    formula: "index = (clear_water_reference_v - voltage) x index_per_volt_drop, clamped "
      + "to the range below",
    clear_water_reference_v: TURBIDITY_CLEAR_VOLT,
    index_per_volt_drop: TURBIDITY_INDEX_PER_VOLT,
    clamp: { min: 0, max: INDEX_CLAMP_MAX },
    direction: "lower voltage = more turbid",
  },
  bands: bandsAscending(),
  off_scale: {
    index_at_or_above: OFF_SCALE_INDEX,
    meaning: "The input voltage was at or below 0 V relative to the conversion's own "
      + "assumptions -- a sensor or wiring problem as readily as turbid water.",
  },
  zero_readings: {
    index: 0,
    meaning: "An index of 0 can mean clear water, a voltage above the clear-water reference, "
      + "or a missing/offline sensor reading -- the backend converts all of them to 0. A lone 0 "
      + "among varied readings is most likely real; a period in which every reading is 0 is a "
      + "possible missing sensor, not confirmed clear water, and query_sensor_data says so in "
      + "its note.",
  },
  no_operator_range: "No operator-configured turbidity threshold exists for any pod. Never "
    + "judge a turbidity value as in or out of range.",
});
