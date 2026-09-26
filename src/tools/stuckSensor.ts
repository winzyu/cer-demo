import type { DeviceReading } from "../types/device.types";

/** Three consecutive valid raw samples, before any averaging, constitute a sustained run. */
export const MIN_STUCK_SENSOR_RUN_LENGTH = 3;
export const STUCK_SENSOR_NOTE = "Turbidity has a sustained zero-variance run at exactly 0 or "
  + "1005, indicating a likely failed sensor. Affected readings were excluded; inspect the sensor.";

/** Missing/faulted samples and changes of value break a run. */
export const stuckTurbidityReadings = (rows: DeviceReading[]): Set<DeviceReading> => {
  const excluded = new Set<DeviceReading>();
  let run: DeviceReading[] = [];
  let value: number | undefined;
  const flush = (): void => {
    if (run.length >= MIN_STUCK_SENSOR_RUN_LENGTH) run.forEach((row) => excluded.add(row));
    run = [];
  };
  [...rows].sort((a, b) => Date.parse(a.observedAt!) - Date.parse(b.observedAt!)).forEach((row) => {
    const metric = row.metrics.turbidity;
    const next = metric?.valid ? metric.value : undefined;
    if (next !== value || (next !== 0 && next !== 1005)) flush();
    value = next;
    if (next === 0 || next === 1005) run.push(row);
  });
  flush();
  return excluded;
};
