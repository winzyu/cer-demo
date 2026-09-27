/* eslint-disable no-console */
import type { DeviceApiClient } from "../src/devices/DeviceApiClient";
import type { DeviceReading } from "../src/types/device.types";
import { coordinates, orderedReadings, siteVisits } from "../src/tools/currentSite";

export const AUDIT_DAYS = 90;

/** Mutually exclusive GPS categories; a valid fix still needs a timestamp to join a visit. */
export const coordinateSummary = (rows: DeviceReading[]) => {
  const usable = rows.filter((row) => coordinates(row) !== undefined).length;
  const zero = rows.filter((row) => {
    const values = [row.raw.best_lat, row.raw.best_lon];
    return values.every((value) => (typeof value === "number"
      || (typeof value === "string" && value.trim() !== "")) && Number(value) === 0);
  }).length;
  const ordered = orderedReadings(rows);
  return {
    total_rows: rows.length,
    gps_categories: {
      usable_gps_excluding_zero_zero: usable,
      zero_zero: zero,
      missing_or_invalid_gps_excluding_zero_zero: rows.length - usable - zero,
    },
    newest_timestamp: ordered[ordered.length - 1]?.observedAt ?? null,
    visits: siteVisits(rows).map((visit, index) => ({
      visit: index + 1,
      rows: ordered.filter((row) => {
        const at = Date.parse(row.observedAt!);
        return at >= visit.startMs && at <= visit.endMs;
      }).length,
      positioned_rows: visit.count,
      start: new Date(visit.startMs).toISOString(),
      end: new Date(visit.endMs).toISOString(),
    })),
  };
};

/** No raw payload or exception text ever reaches output, including on upstream failure. */
export const coordinateAudit = async (
  client: Pick<DeviceApiClient, "listDevices" | "getPeriod">,
  write: (line: string) => void = console.log,
): Promise<boolean> => {
  write("Site discovery is limited to the audited 90-day window; its first visit is provisional. "
    + "GPS categories are non-overlapping and sum to total rows.");
  let devices;
  try {
    devices = await client.listDevices();
  } catch {
    write("Device list unavailable; no audit summaries produced.");
    return false;
  }
  let succeeded = true;
  for (let i = 0; i < devices.length; i += 1) {
    const device = devices[i];
    const identification = { id: device.id, name: device.name, label: device.label };
    try {
      if (!device.label) throw new Error("missing label");
      // eslint-disable-next-line no-await-in-loop
      const rows = await client.getPeriod(AUDIT_DAYS, "day", device.label);
      write(JSON.stringify({ device: identification, ...coordinateSummary(rows) }));
    } catch {
      succeeded = false;
      write(JSON.stringify({ device: identification, error: "Coordinate summary unavailable." }));
    }
  }
  return succeeded;
};

if (require.main === module) {
  // Silence config/client diagnostics before importing them; only audit summaries are printed.
  process.env.LOG_LEVEL = "silent";
  process.env.DOTENV_CONFIG_QUIET = "true";
  import("../src/devices/DeviceApiClient").then(async ({ DeviceApiClient: Client }) => {
    const ok = await coordinateAudit(new Client({ useConfiguredToken: true }));
    if (!ok) process.exitCode = 1;
  }).catch(() => {
    console.error("Coordinate audit unavailable; check local configuration.");
    process.exitCode = 1;
  });
}
