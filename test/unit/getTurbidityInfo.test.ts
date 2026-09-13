import {
  OFF_SCALE_INDEX,
  TURBIDITY_BAND_EDGES,
} from "../../src/report/referenceRanges";
import { getTurbidityInfo, getTurbidityInfoDefinition } from "../../src/tools/getTurbidityInfo";

/**
 * `get_turbidity_info` is static and no-parameter -- these tests pin the numbers in its result to
 * `referenceRanges.ts`'s exports (`TURBIDITY_BAND_EDGES`, `OFF_SCALE_INDEX`) rather than to
 * re-typed literals, so a future edge change (`docs/migration/DEVICE_API.md` §8c is still open on
 * the conversion curve) fails this test instead of silently drifting from the report's bands.
 */
describe("get_turbidity_info — tool definition", () => {
  it("is named get_turbidity_info and takes no parameters", () => {
    expect(getTurbidityInfoDefinition.function.name).toBe("get_turbidity_info");
    expect(getTurbidityInfoDefinition.function.parameters.properties).toEqual({});
    expect(getTurbidityInfoDefinition.function.parameters.required).toEqual([]);
  });

  it("uses the exact description string the brief specifies", () => {
    expect(getTurbidityInfoDefinition.function.description).toBe(
      "Returns how this system's turbidity number is derived and how to interpret it: the "
      + "voltage conversion, the operator's three clarity bands (Clear, Moderate, Turbid) in "
      + "both volts and index units, the off-scale flag, and what a reading of zero can mean. "
      + "Call this before interpreting or characterising any turbidity value.",
    );
  });
});

describe("get_turbidity_info — result", () => {
  it("derives the three bands' voltage bounds from TURBIDITY_BAND_EDGES, not re-typed literals", async () => {
    const result = await getTurbidityInfo() as { bands: Array<Record<string, unknown>> };

    expect(result.bands).toEqual([
      { band: "Clear", index_min: 0, index_max: 345, volt_min: 2.2, volt_max: null },
      { band: "Moderate", index_min: 345, index_max: 795, volt_min: 0.7, volt_max: 2.2 },
      { band: "Turbid", index_min: 795, index_max: null, volt_min: null, volt_max: 0.7 },
    ]);

    // And the edges actually came from the shared export, not a coincidence of hand-typed numbers.
    const sortedEdges = [...TURBIDITY_BAND_EDGES].sort((a, b) => a.min - b.min);
    expect(result.bands.map((b) => b.index_min)).toEqual(sortedEdges.map((e) => e.min));
  });

  it("reports the off-scale flag at OFF_SCALE_INDEX, corresponding to 0 V", async () => {
    const result = await getTurbidityInfo() as { off_scale: Record<string, unknown> };

    expect(result.off_scale.index_at_or_above).toBe(OFF_SCALE_INDEX);
    // Static interpretation rules, not a reading: nothing here may claim a value IS off-scale.
    expect(result.off_scale).not.toHaveProperty("is_off_scale");
    expect(String(result.off_scale.meaning)).toMatch(/0 V/);
  });

  it("reports the conversion formula and constants", async () => {
    const result = await getTurbidityInfo() as { conversion: Record<string, unknown> };

    expect(result.conversion).toMatchObject({
      clear_water_reference_v: 3.35,
      index_per_volt_drop: 300,
      clamp: { min: 0, max: 4550 },
      direction: "lower voltage = more turbid",
    });
  });

  it("says a zero reading can mean clear water, above-reference voltage, or a missing sensor", async () => {
    const result = await getTurbidityInfo() as { zero_readings: Record<string, unknown> };

    const meaning = String(result.zero_readings.meaning);
    expect(meaning).toMatch(/clear water/i);
    expect(meaning).toMatch(/missing|offline/i);
    expect(result.zero_readings.index).toBe(0);
  });

  it("states there is no operator turbidity range and points elsewhere for pod thresholds", async () => {
    const result = await getTurbidityInfo() as { no_operator_range: string };
    expect(result.no_operator_range).toMatch(/no operator-configured turbidity threshold/i);
  });

  it("never names sensor hardware anywhere in the result", async () => {
    const result = await getTurbidityInfo();
    const text = JSON.stringify(result).toLowerCase();

    // The backend's own source comments (read for this task, never copied) name a specific
    // sensor; the registry has no sensor-model field, so no pod-specific hardware claim is ever
    // safe to make here.
    expect(text).not.toMatch(/turner|keystudio|keyestudio|ks0414/);
  });

  it("uses snake_case keys throughout, matching query_sensor_data's model-facing shape", async () => {
    const result = await getTurbidityInfo() as Record<string, unknown>;
    const keys = [
      ...Object.keys(result),
      ...Object.keys(result.conversion as object),
      ...Object.keys(result.off_scale as object),
      ...Object.keys(result.zero_readings as object),
      ...(result.bands as Array<object>).flatMap((b) => Object.keys(b)),
    ];

    keys.forEach((key) => {
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
    });
  });
});
