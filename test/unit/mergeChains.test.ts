import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { mergeByTimestamp, resolveChain } from "../../src/devices/mergeChains";
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

  it("withholds a predecessor the caller cannot see at all", () => {
    // /devices is org-scoped, so a chain can name a label absent from the caller's own view.
    // Reading it would work upstream — /water/period does not check the label — which is
    // precisely why it must not be attempted (SECURITY_FINDINGS.md §1).
    const chain = resolveChain(survivor, [survivor, predecessor]);
    expect(chain.labels).toEqual([SURVIVOR, PRED]);
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
