import type { DeviceReading } from "../types/device.types";

export const STUCK_SENSOR_MIN_DURATION_MS = 24 * 60 * 60_000;
export const STUCK_SENSOR_MAX_GAP_MS = 3 * 60 * 60_000;
export const STUCK_SENSOR_NOTE = "Turbidity has a sustained zero-variance run at exactly 0 or "
  + "1005, indicating a likely failed sensor. Affected readings were excluded; inspect the sensor.";
/** The reader's version of `STUCK_SENSOR_NOTE` (see `USER_NOTES_FIELD`). */
export const STUCK_SENSOR_USER_NOTE = "Turbidity readings stuck at exactly 0 or 1005 for a day or "
  + "more were left out as a likely failed sensor; the turbidity sensor should be inspected.";

/** Missing/faulted samples and changes of value break a run. */
export const stuckTurbidityReadings = (rows: DeviceReading[]): Set<DeviceReading> => {
  const excluded = new Set<DeviceReading>();
  let run: DeviceReading[] = [];
  let value: number | undefined;
  const flush = (): void => {
    if (run.length && Date.parse(run[run.length - 1].observedAt!)
      - Date.parse(run[0].observedAt!) >= STUCK_SENSOR_MIN_DURATION_MS) {
      run.forEach((row) => excluded.add(row));
    }
    run = [];
  };
  [...rows].sort((a, b) => Date.parse(a.observedAt!) - Date.parse(b.observedAt!)).forEach((row) => {
    const metric = row.metrics.turbidity;
    const next = metric?.valid ? metric.value : undefined;
    const at = Date.parse(row.observedAt ?? "");
    const previous = run.length ? Date.parse(run[run.length - 1].observedAt!) : at;
    if (!Number.isFinite(at) || next !== value || (next !== 0 && next !== 1005)
      || at - previous > STUCK_SENSOR_MAX_GAP_MS) flush();
    value = next;
    if (Number.isFinite(at) && (next === 0 || next === 1005)) run.push(row);
  });
  flush();
  return excluded;
};
