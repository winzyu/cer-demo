import { config } from "../../src/config";
import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { decodeReading } from "../../src/devices/metrics";
import { QuerySensorData } from "../../src/tools/querySensorData";
import { currentSite } from "../../src/tools/currentSite";
import { buildReportInput } from "../../src/report/buildReportInput";
import { DAY_MS, SITE_CACHE_TTL_MS, SITE_CACHE_RETENTION_MS,
  SITE_CACHE_MAX_ENTRIES, snapshotSite } from "../../src/tools/siteSnapshot";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const row = (hoursAgo: number, lat = 41, ph = 8, turbidity = 20) => ({
  timestamp: NOW / 1000 - hoursAgo * 3600,
  best_lat: lat, best_lon: -82, best_location: "Same name",
  water_data: { 99: ph, 72: turbidity, phError: 0, turbError: 0 },
});
const registry = (labels = ["dev:pod"]) => [{ id: "pod", data: {
  label: "dev:pod", name: "PCH Public Dock Buoy", organization: "org", labels,
} }];
const args = { device: "dev:pod", metric: "ph", aggregation: "mean", time_range: "last 30 days" };
const setup = (initial: ReturnType<typeof row>[], labels = ["dev:pod"]) => {
  let now = NOW;
  let rows = initial;
  let devices = registry(labels);
  const requests: string[] = [];
  const fetchImpl = jest.fn(async (url: string) => {
    requests.push(url);
    const days = Number(/\/period\/(\d+)\/day/.exec(url)?.[1]);
    const body = url.includes("/devices") ? devices : rows.filter((r) => r.timestamp * 1000 >= now - days * DAY_MS);
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  const sensor = new QuerySensorData({ now: () => now, client: new DeviceApiClient({
    baseUrl: "https://offline.invalid", token: "fixture", fetchImpl,
  }) });
  return { sensor, requests, fetchImpl,
    periods: () => requests.filter((url) => url.includes("/period/")),
    advance: (ms: number) => { now += ms; },
    setRows: (next: typeof rows) => { rows = next; },
    setDevices: (next: typeof devices) => { devices = next; },
  };
};
const originalFlag = config.tools.predecessorPeriodHandoff;
afterEach(() => { config.tools.predecessorPeriodHandoff = originalFlag; jest.restoreAllMocks(); });

it("coalesces cold concurrent questions and reuses readings for repeat questions", async () => {
  const test = setup([row(240), row(0)]);
  const results = await Promise.all(Array.from({ length: 6 }, () => test.sensor.run(args)));
  expect(results.every((result) => result.n_samples === 2)).toBe(true);
  expect(test.periods()).toHaveLength(2); // Recent probe, then complete history.
  expect(test.requests.filter((url) => url.includes("/devices"))).toHaveLength(1);
  await test.sensor.run({ ...args, metric: "turbidity" });
  expect(test.periods()).toHaveLength(2);
});

it("uses one recent read when a reset is provable, then refreshes at exactly the TTL", async () => {
  const test = setup([row(48, 35), row(24), row(0)]);
  await test.sensor.run(args);
  expect(test.periods()).toHaveLength(1);
  test.advance(SITE_CACHE_TTL_MS - 1);
  await test.sensor.run(args);
  expect(test.periods()).toHaveLength(1);
  test.advance(1);
  await test.sensor.run(args);
  expect(test.periods()).toHaveLength(2);
  expect(test.periods().every((url) => url.includes("/3/day"))).toBe(true);
});

it("retains earlier centroid context when refreshing only a recent tail", async () => {
  const rows = [row(240, 41), row(120, 41.006), row(48, 41.0125), row(0, 41.0125)];
  const test = setup(rows);
  await test.sensor.run(args);
  test.advance(SITE_CACHE_TTL_MS);
  const next = [...rows, row(-0.1, 41.0126)];
  test.setRows(next);
  test.advance(60_000);
  const result = await test.sensor.run(args);
  expect(result.n_samples).toBe(currentSite(next.map((r) => decodeReading(r))).readings.length);
  expect(test.periods()).toHaveLength(3); // Two cold reads, one refresh.
});

it("expires retained context and bounds the number of caller entries", async () => {
  const test = setup([row(240), row(0)]);
  await test.sensor.run(args, { token: "first" });
  test.advance(SITE_CACHE_RETENTION_MS);
  await test.sensor.run(args, { token: "first" });
  expect(test.periods()).toHaveLength(4);
  for (let i = 0; i < SITE_CACHE_MAX_ENTRIES; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await test.sensor.run(args, { token: `caller-${i}` });
  }
  const before = test.periods().length;
  await test.sensor.run(args, { token: "first" });
  expect(test.periods()).toHaveLength(before + 2);
});

it.each([
  [row(240, 35), row(120, 41), row(0, 41)],
  [row(240, 41), row(120, 41.004), row(0, 40.998)],
  [row(240, 41), row(120, 35), row(0, 41)],
  [row(240, 41), row(120, 41.006), row(0, 41.0125)],
])("matches the chronological rule with moves, jitter, returns and centroid dependence: %j", async (...rows) => {
  const test = setup(rows);
  const expected = currentSite(rows.map((r) => decodeReading(r))).readings;
  const result = await test.sensor.run(args);
  expect(result.n_samples).toBe(expected.length);
  expect(test.periods()).toHaveLength(2);
  const historical = await test.sensor.run({ ...args, time_range: "2026-09-16" });
  expect(historical.n_samples).toBe(expected.filter((r) => r.observedAt?.startsWith("2026-09-16")).length);
  expect(test.periods()).toHaveLength(2);
});

it("does not guess that a partial window's first row starts a visit", () => {
  const rows = [row(1), row(0)].map((r) => decodeReading(r));
  expect(snapshotSite(rows, NOW - DAY_MS).site.readings).toEqual([]);
  expect(snapshotSite(rows, NOW - DAY_MS).site.note).toMatch(/cannot establish/);
});

it("uses one pinned snapshot for all three report calculations", async () => {
  const test = setup([row(240, 35), row(48), row(24), row(0)]);
  const result = await buildReportInput(test.sensor, { device: "dev:pod", timeRange: "last 30 days" });
  expect(result.report?.parameters.find((p) => p.baseline.key === "ph")?.mean).toBe(8);
  expect(test.periods()).toHaveLength(2);
  expect(test.requests.filter((url) => url.includes("/devices"))).toHaveLength(1);
});

it.each([0, 1005])("detects an established %s run across a short requested range", async (value) => {
  const test = setup(Array.from({ length: 31 }, (_, i) => row(30 - i, 41, 8, value)));
  const result = await test.sensor.run({ ...args, metric: "turbidity", time_range: "last hour" });
  expect(result.value).toBeNull();
  expect(result.excluded_stuck).toBe(2);
  expect(result.note).toMatch(/likely failed sensor/);
  const built = await buildReportInput(test.sensor, { timeRange: "last hour" });
  expect(built.report?.parameters.some((p) => p.baseline.key === "turbidity")).toBe(false);
  expect(built.report?.dataQuality?.calibrationNotes).toMatch(/likely failed sensor/);
});

it("cannot reuse readings or predecessor authorization between callers", async () => {
  const originalBase = config.deviceApi.baseUrl;
  config.deviceApi.baseUrl = "https://offline.invalid";
  const requests: Array<{ url: string; auth: string }> = [];
  jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const auth = (init?.headers as Record<string, string>).Authorization;
    requests.push({ url, auth });
    const body = url.includes("/devices") ? registry(auth === "Bearer alice" ? ["dev:pod", "dev:old"] : ["dev:pod"])
      : [row(0, 41, auth === "Bearer alice" ? 7 : 9)];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  config.tools.predecessorPeriodHandoff = true;
  try {
    const sensor = new QuerySensorData({ now: () => NOW });
    const a = await sensor.run(args, { token: "alice" });
    const b = await sensor.run(args, { token: "bob" });
    expect(a.value).toBe(7);
    expect(b.value).toBe(9);
    expect((b.device as Record<string, unknown>).history_labels).toBeUndefined();
    expect(requests.filter((r) => r.auth === "Bearer bob" && r.url.includes("dev%3Aold"))).toEqual([]);
  } finally { config.deviceApi.baseUrl = originalBase; }
});

it("invalidates snapshots when the flag or registry chain changes", async () => {
  const test = setup([row(0)], ["dev:pod", "dev:old"]);
  config.tools.predecessorPeriodHandoff = false;
  await test.sensor.run(args);
  expect(test.periods()).toHaveLength(2);
  expect(test.periods().some((url) => url.includes("dev%3Aold"))).toBe(false);
  config.tools.predecessorPeriodHandoff = true;
  const enabled = await test.sensor.run(args);
  expect((enabled.device as Record<string, unknown>).history_labels).toEqual(["dev:pod", "dev:old"]);
  expect(test.periods()).toHaveLength(6);
  config.tools.predecessorPeriodHandoff = false;
  const disabled = await test.sensor.run(args);
  expect((disabled.device as Record<string, unknown>).history_labels).toBeUndefined();
  expect(test.periods()).toHaveLength(6);
  test.advance(SITE_CACHE_TTL_MS);
  test.setDevices(registry(["dev:pod", "dev:new"]));
  config.tools.predecessorPeriodHandoff = true;
  await test.sensor.run(args);
  expect(test.periods()).toHaveLength(10);
  expect(test.periods().slice(-4).some((url) => url.includes("dev%3Anew"))).toBe(true);
});

it("drops cached predecessor readings when its authorization is refused on refresh", async () => {
  let now = NOW;
  let refused = false;
  const client = new DeviceApiClient({ baseUrl: "https://offline.invalid", token: "fixture",
    fetchImpl: async (url) => {
      const old = new URL(url).searchParams.get("device") === "dev:old";
      const fail = old && refused;
      const body = url.includes("/devices") ? registry(["dev:pod", "dev:old"])
        : [old ? row(240, 41, 2) : row(0, 41, 8)];
      return { ok: !fail, status: fail ? 400 : 200,
        text: async () => "Device not found", json: async () => body } as Response;
    } });
  config.tools.predecessorPeriodHandoff = true;
  const sensor = new QuerySensorData({ client, now: () => now });
  expect((await sensor.run({ ...args, aggregation: "min" })).value).toBe(2);
  now += SITE_CACHE_TTL_MS;
  refused = true;
  const result = await sensor.run({ ...args, aggregation: "min" });
  expect(result.value).toBe(8);
  expect((result.device as Record<string, unknown>).history_labels).toBeUndefined();
  expect(result.note).toMatch(/NOT included.*dev:old/);
});

it("preserves the failed-sensor warning when the report has no other usable parameter", async () => {
  const rows = Array.from({ length: 25 }, (_, i) => row(24 - i, 41, 8, 0));
  const test = setup(rows.map((r) => ({ ...r, water_data: { ...r.water_data, phError: 1 } })));
  const built = await buildReportInput(test.sensor, { timeRange: "last hour" });
  expect(built.report).toBeUndefined();
  expect(built.error).toMatch(/likely failed sensor/);
});
