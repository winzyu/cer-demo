import { decodeReading } from "../../src/devices/metrics";
import { STUCK_SENSOR_MIN_DURATION_MS, STUCK_SENSOR_MAX_GAP_MS,
  stuckTurbidityReadings } from "../../src/tools/stuckSensor";

const hour = 3600_000;
const run = (value: number, step = 3 * hour, length = 9) => Array.from({ length }, (_, i) => decodeReading({
  timestamp: 1000 + i * step / 1000, water_data: { 72: value, turbError: 0 },
}));

describe("elapsed stuck turbidity", () => {
  it("names the duration and gap policy", () => {
    expect(STUCK_SENSOR_MIN_DURATION_MS).toBe(24 * hour);
    expect(STUCK_SENSOR_MAX_GAP_MS).toBe(3 * hour);
  });
  it.each([0, 1005])("excludes exactly 24 hours with exactly 3-hour gaps at %s", (value) => {
    const rows = run(value);
    expect([...stuckTurbidityReadings(rows)]).toEqual(rows);
    expect(stuckTurbidityReadings([...rows].reverse()).size).toBe(9);
  });
  it("keeps a run one millisecond under 24 hours", () => {
    const rows = run(0);
    rows[8].observedAt = new Date(Date.parse(rows[8].observedAt!) - 1).toISOString();
    expect(stuckTurbidityReadings(rows).size).toBe(0);
  });
  it("breaks at a gap one millisecond over 3 hours", () => {
    const rows = run(1005, 3 * hour + 1);
    expect(stuckTurbidityReadings(rows).size).toBe(0);
  });
  it.each(["missing", "faulted", "changed", "other endpoint", "timestamp"])("breaks on %s", (kind) => {
    const rows = run(0, hour, 30);
    if (kind === "missing") rows[12].metrics.turbidity.value = undefined;
    if (kind === "faulted") rows[12].metrics.turbidity.valid = false;
    if (kind === "changed") rows[12].metrics.turbidity.value = 30;
    if (kind === "other endpoint") rows[12].metrics.turbidity.value = 1005;
    if (kind === "timestamp") rows[12].observedAt = undefined;
    expect(stuckTurbidityReadings(rows).size).toBe(0);
  });
  it("never flags a flat non-endpoint series or a brief burst", () => {
    expect(stuckTurbidityReadings(run(20)).size).toBe(0);
    expect(stuckTurbidityReadings(run(1005, hour, 3)).size).toBe(0);
  });
});
