import { coordinateAudit, coordinateSummary } from "../../scripts/coordinateAudit";
import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { decodeReading } from "../../src/devices/metrics";
import { currentSite } from "../../src/tools/currentSite";

const raw = (hour: number, lat?: unknown, lon: unknown = -82) => ({
  timestamp: 1700000000 + hour * 3600, best_lat: lat, best_lon: lon,
  water_data: { 99: 8.123456789 }, secret: "raw-secret",
});
it("counts disjoint GPS categories and shares chronological visits with production", async () => {
  const rows = [raw(0, 41), raw(1), raw(2, 41), raw(3, 35), raw(4, 41),
    raw(5, 0, 0), raw(6, ""), raw(7, 91), raw(8, 0, 10), raw(9, null, 0)];
  const decoded = rows.map((r) => decodeReading(r));
  const summary = coordinateSummary(decoded);
  expect(summary.gps_categories).toEqual({ usable_gps_excluding_zero_zero: 5,
    zero_zero: 1, missing_or_invalid_gps_excluding_zero_zero: 4 });
  expect(summary.visits.map((v) => v.rows)).toEqual([3, 1, 1, 1]);
  expect(summary.visits[summary.visits.length - 1]?.rows).toBe(currentSite(decoded).readings.length);
  const urls: string[] = [];
  const client = new DeviceApiClient({ baseUrl: "https://offline.invalid", token: "secret-token",
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => (url.includes("/devices")
        ? [{ id: "pod", data: { name: "Pod", label: "dev:pod" } }] : rows) } as Response;
    } });
  const output: string[] = [];
  expect(await coordinateAudit(client, (line) => output.push(line))).toBe(true);
  expect(urls).toHaveLength(2);
  expect(urls[1]).toContain("/water/period/90/day?device=dev%3Apod");
  expect(output.join(" ")).toMatch(/limited.*90-day/);
  expect(output.join(" ")).not.toMatch(/raw-secret|secret-token|8\.123456789|water_data|Authorization/);
});
it("never prints exception text, raw rows or tokens on failures", async () => {
  const output: string[] = [];
  const write = (line: string) => output.push(line);
  const error = new Error("Authorization Bearer secret-token raw-secret sensor=8.123456789");
  expect(await coordinateAudit({ listDevices: async () => { throw error; }, getPeriod: jest.fn() }, write)).toBe(false);
  expect(await coordinateAudit({ listDevices: async () => [{ id: "pod", label: "dev:pod", raw: {} }],
    getPeriod: async () => { throw error; } }, write)).toBe(false);
  expect(output.join(" ")).not.toMatch(/Authorization|secret-token|raw-secret|8\.123456789/);
});
