import { config } from "../../src/config";
import fs from "fs";
import path from "path";
import createError from "http-errors";
import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import {
  REFUSED_REASON,
  isChainRefusal,
  mergeByTimestamp,
  resolveChain,
  withholdRefused,
} from "../../src/devices/mergeChains";
import { QuerySensorData } from "../../src/tools/querySensorData";
import type { DeviceSummary } from "../../src/types/device.types";

/**
 * Device continuity — chain resolution, cross-org withholding, and the overlap de-duplication.
 *
 * Offline throughout: the pure functions take registry rows built here, and the tool-level test
 * serves a stubbed `fetch` into the **real** `DeviceApiClient` and decoder, so it exercises the
 * actual fan-out rather than a mock of it. No network, no token, no cost.
 *
 * The shapes are the live ones (`docs/migration/BACKEND_FIELDS.md` §4): `labels[]` on the
 * survivor with self first, `mergedInto` on the retired device, `organization` as an opaque id.
 */

const SURVIVOR = "dev:survivor";
const PRED = "dev:pred";
const FOREIGN = "dev:foreign";

const CWA = "bLTGwdVSDUMc8iYVNjkK";
const NEWPORT = "yYSvuUPQhTZzHqvvPJFH";

const row = (
  label: string,
  organization: string | undefined,
  raw: Record<string, unknown> = {},
): DeviceSummary => ({
  id: label,
  name: label,
  label,
  organization,
  raw: { label, organization, ...raw },
});

describe("resolveChain", () => {
  const survivor = row(SURVIVOR, CWA, { labels: [SURVIVOR, PRED, FOREIGN] });
  const predecessor = row(PRED, CWA, { mergedInto: SURVIVOR });
  const foreign = row(FOREIGN, NEWPORT, { mergedInto: SURVIVOR });

  it("reads a same-organization predecessor, survivor first", () => {
    const chain = resolveChain(survivor, [survivor, predecessor, foreign]);
    expect(chain.labels).toEqual([SURVIVOR, PRED]);
  });

  it("withholds a predecessor from another organization and says why", () => {
    const chain = resolveChain(survivor, [survivor, predecessor, foreign]);
    expect(chain.withheld).toEqual([
      { label: FOREIGN, reason: "different organization — history not transferred" },
    ]);
  });

  it("hands a hidden predecessor to the period route when the caller's view is org-scoped", () => {
    // /devices hides every merged device, so CWA Old never appears in CWA's own view. The
    // patched route grants it (null or dangling organization) or refuses it (another existing
    // organization); the chain marks it so a refusal is withheld rather than fatal.
    const chain = resolveChain(survivor, [survivor, predecessor], true);
    expect(chain.labels).toEqual([SURVIVOR, PRED, FOREIGN]);
    expect(chain.unconfirmed).toEqual([FOREIGN]);
    expect(chain.withheld).toEqual([]);
  });

  it("withholds a hidden predecessor when the caller's view spans organizations", () => {
    // A superadmin sees every organization and the route grants a superadmin every label, so
    // nothing would check that the hidden predecessor belongs to the survivor's organization.
    const other = row("dev:elsewhere", NEWPORT);
    const chain = resolveChain(survivor, [survivor, predecessor, other]);
    expect(chain.labels).toEqual([SURVIVOR, PRED]);
    expect(chain.unconfirmed).toEqual([]);
    expect(chain.withheld).toEqual([{ label: FOREIGN, reason: "not visible to this account" }]);
  });

  it("inherits nothing when the survivor's own organization is a dangling reference", () => {
    // Marina Park points at an organization absent from /organizations and is actively
    // reporting (BACKEND_FIELDS.md §5a). Fail closed: compare ids as strings, never resolve.
    const dangling = row(SURVIVOR, undefined, { labels: [SURVIVOR, PRED] });
    const chain = resolveChain(dangling, [dangling, predecessor]);
    expect(chain.labels).toEqual([SURVIVOR]);
    expect(chain.withheld).toHaveLength(1);
  });

  it("finds a predecessor recorded only as mergedInto, with no labels[] on the survivor", () => {
    const bare = row(SURVIVOR, CWA);
    const chain = resolveChain(bare, [bare, predecessor]);
    expect(chain.labels).toEqual([SURVIVOR, PRED]);
  });

  it("walks a three-label chain transitively", () => {
    const middle = row(PRED, CWA, { mergedInto: SURVIVOR });
    const oldest = row("dev:oldest", CWA, { mergedInto: PRED });
    const head = row(SURVIVOR, CWA);
    expect(resolveChain(head, [head, middle, oldest]).labels)
      .toEqual([SURVIVOR, PRED, "dev:oldest"]);
  });

  it("reports a retired device's successor and does not follow it", () => {
    // A question about a retired pod is about that pod's own span. Following mergedInto forward
    // would widen the read into a device the caller never named.
    const chain = resolveChain(predecessor, [survivor, predecessor, foreign]);
    expect(chain.labels).toEqual([PRED]);
    expect(chain.mergedInto).toBe(SURVIVOR);
  });

  it("terminates on a registry cycle", () => {
    const a = row("dev:a", CWA, { labels: ["dev:a", "dev:b"] });
    const b = row("dev:b", CWA, { labels: ["dev:b", "dev:a"] });
    expect(resolveChain(a, [a, b]).labels).toEqual(["dev:a", "dev:b"]);
  });
});

describe("period-route refusals", () => {
  const chain = resolveChain(
    row(SURVIVOR, CWA, { labels: [SURVIVOR, PRED, FOREIGN] }),
    [row(SURVIVOR, CWA, { labels: [SURVIVOR, PRED, FOREIGN] })],
    true,
  );

  it("moves a refused label into withheld and keeps the rest", () => {
    const refused = withholdRefused(chain, FOREIGN);
    expect(refused.labels).toEqual([SURVIVOR, PRED]);
    expect(refused.unconfirmed).toEqual([PRED]);
    expect(refused.withheld).toEqual([{ label: FOREIGN, reason: REFUSED_REASON }]);
  });

  it("never withholds the survivor or a label the caller could see", () => {
    expect(withholdRefused(chain, SURVIVOR)).toBe(chain);
  });

  it("recognises only the route's own refusal", () => {
    // The client's shape for a non-5xx upstream answer (DeviceApiClient.request).
    const refusal = createError(400, "Device API 400 on /water/period/5/fiveYears?device=x: "
      + "{\"error\":\"Device not found\"}");
    expect(isChainRefusal(refusal)).toBe(true);
    expect(isChainRefusal(createError(400, "Device API 400 on /water/period: bad unit"))).toBe(false);
    expect(isChainRefusal(createError(404, "Device not found"))).toBe(false);
    expect(isChainRefusal(new Error("Device not found"))).toBe(false);
    expect(isChainRefusal(undefined)).toBe(false);
  });
});

describe("mergeByTimestamp", () => {
  it("drops what a later label repeats and keeps the first batch intact", () => {
    const merged = mergeByTimestamp([
      [{ timestamp: 30 }, { timestamp: 20 }],
      [{ timestamp: 20 }, { timestamp: 10 }],
    ]);
    expect(merged.map((entry) => entry.timestamp)).toEqual([30, 20, 10]);
  });

  it("never drops a duplicate inside one batch", () => {
    const merged = mergeByTimestamp([[{ timestamp: 5 }, { timestamp: 5 }]]);
    expect(merged).toHaveLength(2);
  });

  it("keeps rows carrying no timestamp", () => {
    const merged = mergeByTimestamp([[{ timestamp: undefined }], [{ timestamp: undefined }]]);
    expect(merged).toHaveLength(2);
  });
});

describe("query_sensor_data over a merge chain", () => {
  const NOW = Date.parse("2026-08-20T00:00:00.000Z");
  const seconds = (offsetMs: number): number => Math.floor((NOW + offsetMs) / 1000);
  const HOUR = 60 * 60_000;
  const DAY = 24 * HOUR;

  const reading = (device: string, atMs: number, ph: number): Record<string, unknown> => ({
    device,
    timestamp: seconds(atMs),
    best_lat: 41.38, best_lon: -82.51,
    date: new Date(NOW + atMs).toISOString(),
    water_data: { 99: ph, phError: 0 },
  });

  const DEVICES = [
    {
      id: "1",
      data: {
        label: SURVIVOR,
        name: "Old Woman Creek 2026",
        organization: CWA,
        labels: [SURVIVOR, PRED, FOREIGN],
      },
    },
    {
      id: "2",
      data: {
        label: PRED, name: "CWA 2025 testbed", organization: CWA, mergedInto: SURVIVOR,
      },
    },
    {
      id: "3",
      data: {
        label: FOREIGN, name: "CWA Old", organization: NEWPORT, mergedInto: SURVIVOR,
      },
    },
  ];

  /** Survivor: now and an hour ago. Predecessor: the same hour-ago instant, plus two days back. */
  const PERIOD: Record<string, Array<Record<string, unknown>>> = {
    [SURVIVOR]: [reading(SURVIVOR, 0, 7.1), reading(SURVIVOR, -HOUR, 7.3)],
    [PRED]: [reading(PRED, -HOUR, 9.9), reading(PRED, -2 * DAY, 6.9)],
    [FOREIGN]: [reading(FOREIGN, -3 * DAY, 1)],
  };

  const makeTool = (): { tool: QuerySensorData; urls: string[] } => {
    const urls: string[] = [];
    const fetchImpl = async (url: string): Promise<Response> => {
      urls.push(url);
      const body = ((): unknown => {
        if (url.includes("/devices")) {
          return DEVICES;
        }
        const label = Object.keys(PERIOD)
          .find((candidate) => url.includes(encodeURIComponent(candidate)));
        if (url.includes("/water/last/")) {
          return label ? { id: "last", data: PERIOD[label][0] } : {};
        }
        return label ? PERIOD[label] : [];
      })();
      return {
        ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body),
      } as unknown as Response;
    };

    return {
      tool: new QuerySensorData({
        client: new DeviceApiClient({
          baseUrl: "https://example.invalid/api/v1",
          token: "test-token",
          fetchImpl,
        }),
        now: () => NOW,
      }),
      urls,
    };
  };

  it("fans out over the chain, de-duplicates the overlap, and never reads the foreign label", async () => {
    const { tool, urls } = makeTool();
    const result = await tool.run({
      metric: "ph", time_range: "last 7 days", aggregation: "mean", device: "OWC",
    });

    // Three rows, not four: the predecessor's hour-ago row repeats an instant the survivor
    // already reported, and counting it twice would reweight the mean.
    expect(result.n_samples).toBe(3);
    expect(result.value).toBeCloseTo((7.1 + 7.3 + 6.9) / 3, 6);

    const periodCalls = urls.filter((url) => url.includes("/water/period/"));
    expect(periodCalls.some((url) => url.includes(encodeURIComponent(PRED)))).toBe(true);
    expect(periodCalls.some((url) => url.includes(encodeURIComponent(FOREIGN)))).toBe(false);
  });

  it("discloses which labels it read and which it withheld", async () => {
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "ph", time_range: "last 7 days", aggregation: "mean", device: "OWC",
    }) as { device: Record<string, unknown>; note: string };

    expect(result.device.history_labels).toEqual([SURVIVOR, PRED]);
    expect(result.device.history_withheld).toEqual([
      { label: FOREIGN, reason: "different organization — history not transferred" },
    ]);
    expect(result.note).toContain("NOT included");
  });

  it("tells the model when the pod it was asked about is itself retired", async () => {
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "ph", time_range: "last 7 days", aggregation: "mean", device: "CWA 2025 testbed",
    }) as { note: string };

    expect(result.note).toContain(`merged into ${SURVIVOR}`);
  });
});

/**
 * CWA Old as live: merged into Old Woman Creek 2026, registered to an organization id that
 * matches no organization, and hidden from every `/devices` response. Each caller's `/devices`
 * is org-scoped, and the period stub grants only what the patched route grants that caller.
 */
describe("query_sensor_data and a hidden dangling-organization predecessor", () => {
  beforeEach(() => { config.tools.predecessorPeriodHandoff = true; });
  afterEach(() => { config.tools.predecessorPeriodHandoff = false; });
  const NOW = Date.parse("2026-08-20T00:00:00.000Z");
  const CWA_OLD = "dev:cwa-old";
  const NEWPORT_POD = "dev:newport";
  const reading = (device: string, daysAgo: number, ph: number): Record<string, unknown> => ({
    device,
    timestamp: Math.floor((NOW - daysAgo * 24 * 60 * 60_000) / 1000),
    best_lat: device === NEWPORT_POD ? 33.61 : 41.38,
    best_lon: device === NEWPORT_POD ? -117.93 : -82.51,
    water_data: { 99: ph, phError: 0 },
  });
  const PERIOD: Record<string, Array<Record<string, unknown>>> = {
    [SURVIVOR]: [reading(SURVIVOR, 0, 7.1)],
    [PRED]: [reading(PRED, 2, 7.3)],
    [CWA_OLD]: [reading(CWA_OLD, 4, 7.5)],
    [NEWPORT_POD]: [reading(NEWPORT_POD, 0, 8)],
  };
  const OWC = {
    id: "owc",
    data: {
      label: SURVIVOR,
      name: "Old Woman Creek 2026",
      organization: CWA,
      labels: [SURVIVOR, PRED, CWA_OLD],
    },
  };
  const NEWPORT_ROW = {
    id: "newport",
    data: { label: NEWPORT_POD, name: "Newport Pier", organization: NEWPORT },
  };

  const makeTool = (
    devices: unknown[],
    granted: string[],
  ): { tool: QuerySensorData; urls: string[] } => {
    const urls: string[] = [];
    const fetchImpl = async (url: string): Promise<Response> => {
      urls.push(url);
      const label = Object.keys(PERIOD)
        .find((candidate) => url.includes(encodeURIComponent(candidate)));
      const refused = label !== undefined && !granted.includes(label);
      const body = ((): unknown => {
        if (url.includes("/devices")) {
          return devices;
        }
        if (refused) {
          return { error: "Device not found" };
        }
        if (url.includes("/water/last/")) {
          return label ? { id: "last", data: PERIOD[label][0] } : {};
        }
        return label ? PERIOD[label] : [];
      })();
      return {
        ok: !refused,
        status: refused ? 400 : 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as unknown as Response;
    };
    return {
      tool: new QuerySensorData({
        client: new DeviceApiClient({
          baseUrl: "https://example.invalid/api/v1", token: "test-token", fetchImpl,
        }),
        now: () => NOW,
      }),
      urls,
    };
  };

  it("merges CWA Old into Old Woman Creek 2026 for a Cleveland Water Alliance member", async () => {
    const { tool, urls } = makeTool([OWC], [SURVIVOR, PRED, CWA_OLD]);
    const result = await tool.run({
      metric: "ph", time_range: "last 7 days", aggregation: "mean", device: "Old Woman Creek",
    }) as { device: Record<string, unknown>; n_samples: number; value: number };

    expect(result.device.history_labels).toEqual([SURVIVOR, PRED, CWA_OLD]);
    expect(result.device.history_withheld).toBeUndefined();
    expect(result.n_samples).toBe(3);
    expect(result.value).toBeCloseTo((7.1 + 7.3 + 7.5) / 3, 6);
    expect(urls.some((url) => url.includes("/water/period/") && url.includes(encodeURIComponent(CWA_OLD)))).toBe(true);
  });

  it("gives another organization's member nothing for CWA Old by name or label", async () => {
    await Promise.all(["CWA Old", CWA_OLD].map(async (device) => {
      const { tool, urls } = makeTool([NEWPORT_ROW], [NEWPORT_POD]);
      const result = await tool.run({
        metric: "ph", time_range: "last 7 days", aggregation: "mean", device,
      });
      expect((result as { error: string }).error).toContain(`No device matches "${device}"`);
      expect(urls.some((url) => url.includes(encodeURIComponent(CWA_OLD)))).toBe(false);
    }));
  });
});

/**
 * The dummy fleet in `test/fixtures/pod-scope/` stands in for a narrowed account, which the
 * superadmin `DEVICE_API_TOKEN` cannot impersonate (see that directory's README). These assert
 * the fixture still encodes the live hazards it was built from — a fixture that quietly drifts
 * into a tidy registry stops testing anything.
 */
describe("pod-scope fixture fleet", () => {
  const FIXTURE = path.join(__dirname, "../fixtures/pod-scope/devices.json");
  const raw = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as Array<{
    id: string; data: Record<string, unknown>;
  }>;

  const fleet: DeviceSummary[] = raw.map((entry) => ({
    id: entry.id,
    name: entry.data.name as string | undefined,
    label: entry.data.label as string | undefined,
    organization: entry.data.organization as string | undefined,
    operatingEnvironment: entry.data.operatingEnvironment as string | undefined,
    raw: entry.data,
  }));

  const by = (label: string): DeviceSummary => fleet
    .find((device) => device.label === label) as DeviceSummary;

  it("merges a same-organization chain", () => {
    const chain = resolveChain(by("dev:100000000000001"), fleet);
    expect(chain.labels).toEqual(["dev:100000000000001", "dev:100000000000002"]);
    expect(chain.withheld).toEqual([]);
  });

  it("withholds the dangling-organization leg of a three-label chain", () => {
    const chain = resolveChain(by("dev:100000000000003"), fleet);
    expect(chain.labels).toEqual(["dev:100000000000003", "dev:100000000000004"]);
    expect(chain.withheld.map((entry) => entry.label)).toEqual(["dev:100000000000005"]);
  });

  it("hands the dangling-organization leg to the period route for its own organization", () => {
    // The Lakeside organization's /devices as the server returns it: no merged devices.
    const lakeView = fleet.filter((device) => device.organization === "org-lake-00000000001"
      && !device.raw.mergedInto);
    const chain = resolveChain(by("dev:100000000000003"), lakeView, true);
    expect(chain.labels).toEqual([
      "dev:100000000000003", "dev:100000000000004", "dev:100000000000005",
    ]);
    expect(chain.unconfirmed).toEqual(["dev:100000000000004", "dev:100000000000005"]);
  });

  it("withholds a cross-organization predecessor", () => {
    const chain = resolveChain(by("dev:100000000000006"), fleet);
    expect(chain.labels).toEqual(["dev:100000000000006"]);
    expect(chain.withheld[0].reason).toMatch(/different organization/);
  });

  it("still carries the duplicate registry row a label-keyed resolver must collapse", () => {
    const duplicates = fleet.filter((device) => device.label === "dev:100000000000001");
    expect(duplicates).toHaveLength(2);
    expect(new Set(duplicates.map((entry) => entry.organization)).size).toBe(2);
  });

  it("still carries a chain whose predecessor is registered as a different water type", () => {
    expect(by("dev:100000000000003").operatingEnvironment).toBe("fresh-water");
    expect(by("dev:100000000000004").operatingEnvironment).toBe("salt-water");
  });
});
