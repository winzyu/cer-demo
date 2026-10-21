import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { QuerySensorData } from "../../src/tools/querySensorData";
import { config } from "../../src/config";

const now = Date.parse("2026-09-26T12:00:00Z");
const row = (hoursAgo: number, value: number) => ({
  timestamp: now / 1000 - hoursAgo * 3600, best_lat: 41, best_lon: -82,
  water_data: { 72: value, turbError: 0 },
});
const exercise = async (rows: ReturnType<typeof row>[], refusal = false) => {
  const client = new DeviceApiClient({ baseUrl: "https://offline.invalid", token: "fixture",
    fetchImpl: async (url) => {
      const refused = refusal && url.includes("dev%3Aold");
      const body = url.includes("/devices") ? [{ id: "pod", data: {
        name: "PCH Public Dock Buoy", label: "dev:pod", organization: "org",
        labels: ["dev:pod", "dev:old"],
      } }] : url.includes("/water/last") ? { data: rows[rows.length - 1] } : rows;
      return { ok: !refused, status: refused ? 400 : 200,
        text: async () => "Device not found", json: async () => body } as Response;
    } });
  const sensor = new QuerySensorData({ client, now: () => now });
  return sensor.run({ metric: "turbidity", time_range: "last hour", aggregation: "max" });
};

afterEach(() => { Object.assign(config.tools, { predecessorPeriodHandoff: false }); });
it("keeps a brief endpoint burst usable through the tool boundary", async () => {
  const result = await exercise([row(1, 1005), row(0.5, 1005), row(0, 1005)]);
  expect(result.value).toBe(1005);
  expect(result.excluded_stuck).toBeUndefined();
});
it("retains authorized survivor data when PCH's hidden predecessor is refused", async () => {
  Object.assign(config.tools, { predecessorPeriodHandoff: true });
  const result = await exercise([row(0, 20)], true);
  expect(result.error).toBeUndefined();
  expect(result.value).toBe(20);
  expect((result.device as Record<string, unknown>).history_withheld).toEqual([
    { label: "dev:old", reason: "refused by the device API for this account" },
  ]);
});

it.each([
  ["survivor refusal", "dev:pod", 400, "Device not found", false],
  ["confirmed predecessor refusal", "dev:old", 400, "Device not found", true],
  ["authentication failure", "dev:old", 401, "Expired", false],
  ["upstream outage", "dev:old", 503, "Unavailable", false],
  ["unrelated bad request", "dev:old", 400, "Invalid duration", false],
])("fails on %s instead of withholding history", async (_name, failedLabel, status, message, confirmed) => {
  config.tools.predecessorPeriodHandoff = true;
  const client = new DeviceApiClient({ baseUrl: "https://offline.invalid", token: "fixture",
    fetchImpl: async (url) => {
      const failing = new URL(url).searchParams.get("device") === failedLabel;
      const body = url.includes("/devices") ? [{ id: "pod", data: {
        label: "dev:pod", organization: "org", labels: ["dev:pod", "dev:old"],
      } }, ...(confirmed ? [{ id: "old", data: { label: "dev:old", organization: "org" } }] : [])]
        : [row(0, 20)];
      return { ok: !failing, status: failing ? status : 200,
        text: async () => message, json: async () => body } as Response;
    } });
  const sensor = new QuerySensorData({ client, now: () => now });
  await expect(sensor.query({ device: "dev:pod", metric: "ph", aggregation: "mean", timeRange: "last day" }))
    .rejects.toThrow();
});

it("keeps successful predecessor readings and refreshes all returned history metadata", async () => {
  config.tools.predecessorPeriodHandoff = true;
  const client = new DeviceApiClient({ baseUrl: "https://offline.invalid", token: "fixture",
    fetchImpl: async (url) => {
      const label = new URL(url).searchParams.get("device");
      const refused = label === "dev:refused";
      const body = url.includes("/devices") ? [{ id: "pod", data: {
        label: "dev:pod", name: "PCH Public Dock Buoy", organization: "org",
        labels: ["dev:pod", "dev:refused", "dev:allowed"],
      } }] : [label === "dev:allowed" ? row(1, 21) : row(0, 20)];
      return { ok: !refused, status: refused ? 400 : 200,
        text: async () => "Device not found", json: async () => body } as Response;
    } });
  const result = await new QuerySensorData({ client, now: () => now }).run({
    metric: "turbidity", aggregation: "max", time_range: "last day",
  });
  expect(result.value).toBe(21);
  expect(result.n_samples).toBe(2);
  expect((result.device as Record<string, unknown>).history_labels).toEqual(["dev:pod", "dev:allowed"]);
  expect((result.device as Record<string, unknown>).history_withheld).toEqual([
    { label: "dev:refused", reason: "refused by the device API for this account" },
  ]);
  expect(result.note).toContain("covers all of them (dev:pod, dev:allowed)");
  expect(result.note).toMatch(/NOT included.*dev:refused/);
});
