import { decodeReading } from "../../src/devices/metrics";
import { MIN_STUCK_SENSOR_RUN_LENGTH, stuckTurbidityReadings } from "../../src/tools/stuckSensor";

const readings = (values: Array<number | null>) => values.map((value, index) => decodeReading({
  timestamp: 1000 + index * 600,
  water_data: value === null ? {} : { 72: value, turbError: 0 },
}));

describe("stuck turbidity", () => {
  it.each([0, 1005])("flags a sustained run at %s, even inside a varying period", (value) => {
    const rows = readings([20, value, value, value, 30]);
    expect(MIN_STUCK_SENSOR_RUN_LENGTH).toBe(3);
    expect([...stuckTurbidityReadings(rows)]).toEqual(rows.slice(1, 4));
  });
  it.each([[0, 0], [1005, 1005], [0, 1005, 0], [0, 0, null, 0], [20, 20, 20]])(
    "does not mistake short, interrupted, or non-endpoint runs for failure: %j", (...values) => {
      expect(stuckTurbidityReadings(readings(values))).toHaveProperty("size", 0);
    },
  );
  it("lets a fault flag interrupt a run", () => {
    const rows = readings([0, 0, 0, 0]);
    rows[2].metrics.turbidity.valid = false;
    expect(stuckTurbidityReadings(rows).size).toBe(0);
  });
});
