import fs from "fs";
import path from "path";
import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import {
  QuerySensorData,
  dedupeByLabel,
  matchDevices,
  querySensorDataDefinition,
} from "../../src/tools/querySensorData";
import type { DeviceSummary } from "../../src/types/device.types";

/**
 * Offline throughout. Every response is a recorded body from `data/device-api/` (see
 * `test/fixtures/device-api/README.md`), served through a stubbed `fetch` into the **real**
 * `DeviceApiClient` and the real decoder — so these exercise the metric-code table, the
 * epoch-seconds conversion and the per-endpoint temperature unit, not a mock of them.
 *
 * No test here may reach the network, need a token, or cost money.
 */

const FIXTURES = path.join(__dirname, "../fixtures/device-api");
const load = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

const DEVICES = load("devices.json");
const ALGALITA_PERIOD = load("algalita-period-1-day.json") as Array<Record<string, unknown>>;
const OWC_PERIOD_DAY = load("owc-period-1-day.json");
const OWC_LAST = load("owc-last.json") as { data: Record<string, unknown> };

const ALGALITA = "dev:351077454569099";
const OWC = "dev:351077454567580";

/** Wall-clock "now" for the tests: two days after the newest recorded Algalita reading. */
const NOW = Date.parse("2026-08-13T12:00:00.000Z");

/**
 * OWC's one known reading, re-served as a one-row week window.
 *
 * **Synthetic in placement only** — the document is the pod's real last reading, reconstructed
 * into the raw wire shape. The recording never captured `/water/period/1/week` for this pod, and
 * a week window is what the escalation path asks for. Recording the real one is a single
 * read-only call (`npm run explore:devices`) and would strengthen this test.
 */
const OWC_PERIOD_WEEK = [{
  ...OWC_LAST.data,
  water_data: {
    ...(OWC_LAST.data.water_data as Record<string, unknown>),
    // /water/period returns the stored document, so temperature is Celsius on this route
    // while the /water/last fixture it came from carries Fahrenheit.
    102: ((OWC_LAST.data.water_data as Record<string, number>)[102] - 32) * (5 / 9),
  },
}];

/**
 * Algalita's raw `/water/last` body, derived from the newest row of its recorded period series.
 * `/water/last` returns Fahrenheit while `/water/period` returns Celsius, so the temperature is
 * converted here to match what the real endpoint would send.
 */
const ALGALITA_LAST = (() => {
  const newest = [...ALGALITA_PERIOD]
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0];
  const water = newest.water_data as Record<string, number>;
  return {
    id: "algalita-last",
    data: { ...newest, water_data: { ...water, 102: water[102] * (9 / 5) + 32 } },
  };
})();

interface Call { url: string }

/** Routes a stubbed fetch by URL. Records every call so "no network" is checkable. */
const makeClient = (
  overrides: Partial<Record<"devices" | "periodDay" | "periodWeek" | "periodMonth" | "last", unknown>> = {},
): { client: DeviceApiClient; calls: Call[] } => {
  const calls: Call[] = [];

  const fetchImpl = async (url: string): Promise<Response> => {
    calls.push({ url });

    const body = ((): unknown => {
      if (url.includes("/devices")) {
        return overrides.devices ?? DEVICES;
      }
      if (url.includes("/water/last/")) {
        if (overrides.last !== undefined) {
          return overrides.last;
        }
        // Routed by device: serving one pod's last reading for every device would anchor
        // every range to the wrong instant.
        return url.includes(encodeURIComponent(OWC)) ? OWC_LAST : ALGALITA_LAST;
      }
      if (url.includes("/water/period/")) {
        const forOwc = url.includes(encodeURIComponent(OWC));
        if (url.includes("/1/week")) {
          return overrides.periodWeek ?? (forOwc ? OWC_PERIOD_WEEK : ALGALITA_PERIOD);
        }
        if (url.includes("/1/month")) {
          return overrides.periodMonth ?? (forOwc ? OWC_PERIOD_WEEK : ALGALITA_PERIOD);
        }
        return overrides.periodDay ?? (forOwc ? OWC_PERIOD_DAY : ALGALITA_PERIOD);
      }
      return {};
    })();

    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  };

  return {
    client: new DeviceApiClient({ baseUrl: "https://example.invalid/api/v1", token: "test-token", fetchImpl }),
    calls,
  };
};

const makeTool = (
  overrides?: Parameters<typeof makeClient>[0],
  options: { waterType?: string; defaultDeviceLabel?: string } = {},
): { tool: QuerySensorData; calls: Call[] } => {
  const { client, calls } = makeClient(overrides);
  return {
    tool: new QuerySensorData({
      client,
      now: () => NOW,
      rawLimit: 200,
      waterType: options.waterType ?? "saltwater",
      defaultDeviceLabel: options.defaultDeviceLabel,
    }),
    calls,
  };
};

describe("device matching", () => {
  const devices = [
    {
      id: "1", name: "Algalita Pod", label: "dev:1", raw: {},
    },
    {
      id: "2", name: "Old Woman Creek 2026", label: "dev:2", raw: {},
    },
    {
      id: "3", name: "Test 2", label: "dev:3", raw: {},
    },
  ] as DeviceSummary[];

  it("matches the OWC acronym that appears nowhere in the registry", () => {
    // The verified trap (DEVICE_API.md §2): the pod everyone calls "OWC" is registered as
    // "Old Woman Creek 2026". Without initials matching, the obvious query matches nothing and
    // the tool reports no such device about a device that exists.
    expect(matchDevices(devices, "OWC")).toHaveLength(1);
    expect(matchDevices(devices, "OWC")[0].label).toBe("dev:2");
    expect(matchDevices(devices, "owc 2026")).toHaveLength(0);
  });

  it("matches by exact label, exact name, and substring", () => {
    expect(matchDevices(devices, "dev:1")[0].name).toBe("Algalita Pod");
    expect(matchDevices(devices, "algalita pod")[0].label).toBe("dev:1");
    expect(matchDevices(devices, "algalita")[0].label).toBe("dev:1");
  });

  it("prefers an exact name over a substring match", () => {
    const overlapping = [
      {
        id: "1", name: "Creek", label: "dev:1", raw: {},
      },
      {
        id: "2", name: "Creek Downstream", label: "dev:2", raw: {},
      },
    ] as DeviceSummary[];

    expect(matchDevices(overlapping, "creek")).toHaveLength(1);
    expect(matchDevices(overlapping, "creek")[0].label).toBe("dev:1");
  });

  it("returns nothing rather than guessing on an unknown name", () => {
    expect(matchDevices(devices, "harbour buoy")).toHaveLength(0);
  });
});

describe("dedupeByLabel", () => {
  it("collapses the registry's duplicate rows for one physical pod", () => {
    // Algalita Pod has three registry entries against one dev: label (DEVICE_API.md §2).
    // Left alone they make an unambiguous question look ambiguous.
    const raw = DEVICES as Array<{ id: string; data: { label?: string } }>;
    const algalita = raw.filter((row) => row.data.label === ALGALITA);

    expect(algalita.length).toBeGreaterThan(1);

    const summaries = algalita.map((row) => ({
      id: row.id, label: row.data.label, raw: row.data,
    })) as DeviceSummary[];

    expect(dedupeByLabel(summaries)).toHaveLength(1);
  });
});

describe("query_sensor_data — the tool definition", () => {
  it("offers the six metrics and the six legacy aggregations", () => {
    const { properties, required } = querySensorDataDefinition.function.parameters;
    const metric = properties.metric as { enum: string[] };
    const aggregation = properties.aggregation as { enum: string[] };

    expect(metric.enum).toEqual([
      "dissolved_oxygen", "orp", "ph", "conductivity", "temperature", "turbidity",
    ]);
    expect(aggregation.enum).toEqual(["min", "max", "mean", "median", "latest", "raw"]);
    expect(required).toEqual(["metric", "time_range", "aggregation"]);
  });

  it("tells the model that null is not zero", () => {
    // The description is the only thing the model reads before deciding whether to trust a
    // field it has never seen. DEVICE_API.md §12b is the reason this sentence exists.
    expect(querySensorDataDefinition.function.description).toContain("never a reading of zero");
  });

  it("does not make device a required argument", () => {
    // A single-pod deployment should not have to name its pod on every call.
    expect(querySensorDataDefinition.function.parameters.required).not.toContain("device");
  });
});

describe("query_sensor_data — reading real recorded data", () => {
  it("returns the latest dissolved oxygen with its timestamp", async () => {
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "dissolved_oxygen", time_range: "now", aggregation: "latest", device: "Algalita",
    });

    expect(result.value).toBeCloseTo(9.640000343322754, 6);
    expect(result.unit).toBe("mg/L");
    expect(result.observed_at).toBe("2026-08-11T19:37:25.000Z");
    expect(result.n_samples).toBe(1);
  });

  it("converts period temperature from Celsius, never reporting the raw number", async () => {
    // The trap that produces the most plausible wrong answer (DEVICE_API.md §12a): /water/period
    // returns Celsius while /water/last returns Fahrenheit, and nothing in the payload says
    // which. Reported raw, 26 °C water reads as 26 °F — below the prompt's 32-95 °F range, so
    // a warm ocean gets flagged as near-freezing.
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "temperature", time_range: "now", aggregation: "latest", device: "Algalita",
    });

    expect(result.unit).toBe("°F");
    expect(result.value).toBeCloseTo(78.7838020324707, 6);
    expect(result.value).not.toBeCloseTo(25.99100112915039, 3);
  });

  it("computes a mean over the window from the raw series", async () => {
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "dissolved_oxygen", time_range: "last day", aggregation: "mean", device: "Algalita",
    });

    const expected = ALGALITA_PERIOD
      .map((doc) => (doc.water_data as Record<string, number>)[97]);

    expect(result.n_samples).toBe(expected.length);
    expect(result.value).toBeCloseTo(
      expected.reduce((sum, value) => sum + value, 0) / expected.length,
      6,
    );
  });

  it("reports min and max from the recorded series", async () => {
    const { tool } = makeTool();
    const min = await tool.run({
      metric: "dissolved_oxygen", time_range: "last day", aggregation: "min", device: "Algalita",
    });
    const max = await tool.run({
      metric: "dissolved_oxygen", time_range: "last day", aggregation: "max", device: "Algalita",
    });

    expect(min.value).toBeCloseTo(7.610000133514404, 6);
    expect(max.value).toBeCloseTo(10.77000045776367, 6);
  });

  it("never calls /water/average", async () => {
    // That endpoint answers an empty window with zeros for all six metrics and drops whole rows
    // when any one probe faults. Everything is computed from the raw series instead — see
    // aggregate.ts. This asserts the decision rather than trusting it to stay true.
    const { tool, calls } = makeTool();
    await tool.run({
      metric: "ph", time_range: "last day", aggregation: "mean", device: "Algalita",
    });

    expect(calls.some((call) => call.url.includes("/water/average"))).toBe(false);
    expect(calls.some((call) => call.url.includes("/water/period/"))).toBe(true);
  });

  it("returns raw samples in chronological order", async () => {
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "ph", time_range: "last day", aggregation: "raw", device: "Algalita",
    });

    const samples = result.samples as Array<{ at: string; value: number }>;
    expect(samples).toHaveLength(47);
    expect(Date.parse(samples[0].at)).toBeLessThan(Date.parse(samples[samples.length - 1].at));
  });
});

describe("query_sensor_data — the stale pod", () => {
  it("anchors a relative range to the device's last reading, not the wall clock", async () => {
    // Old Woman Creek 2026 has been silent since 2026-08-07. Against a wall clock "the last
    // day" is an empty window; against its own last reading it is a perfectly good day of data.
    const { tool, calls } = makeTool();
    const result = await tool.run({
      metric: "ph", time_range: "last day", aggregation: "latest", device: "OWC",
    });

    expect(calls.some((call) => call.url.includes("/water/last/"))).toBe(true);
    expect(result.value).toBeCloseTo(9.119500160217285, 6);
    expect((result.time_range_resolved as { end: string }).end).toBe("2026-08-07T14:38:49.000Z");
  });

  it("sizes the window from the reference instant, in one fetch, not from the phrase", async () => {
    // The phrase says "last week", but the range it resolves to ends six days ago, so covering
    // it from the server's now needs ~13 days — a month rung, not a week. Sizing from the phrase
    // alone would fetch 7 days and return a real statistic over a fraction of the window it
    // claims, with nothing in the result saying so. Asking /water/last first makes the right
    // size knowable before the series is fetched, so this stays one period call rather than a
    // short fetch followed by a corrective one.
    const { tool, calls } = makeTool();
    await tool.run({
      metric: "ph", time_range: "last week", aggregation: "mean", device: "OWC",
    });

    const periodCalls = calls.filter((call) => call.url.includes("/water/period/"));
    expect(periodCalls).toHaveLength(1);
    expect(periodCalls[0].url).toContain("/1/month");
  });

  it("makes exactly one period call on the normal path", async () => {
    // The correction for staleness must not become a second call on every query.
    const { tool, calls } = makeTool();
    await tool.run({
      metric: "ph", time_range: "last day", aggregation: "mean", device: "Algalita",
    });

    expect(calls.filter((call) => call.url.includes("/water/period/"))).toHaveLength(1);
  });

  it("reports no data as null with the last-reported time, never as zero", async () => {
    // The disqualifying failure. An empty window comes back from the API as zeros for all six
    // metrics; reported as data that is anoxic water at pH 0, which the eval's quality floor
    // treats as an automatic fail.
    const { tool } = makeTool({ periodDay: [], periodWeek: [], periodMonth: [] });
    const result = await tool.run({
      metric: "dissolved_oxygen", time_range: "last day", aggregation: "mean", device: "OWC",
    });

    expect(result.value).toBeNull();
    expect(result.value).not.toBe(0);
    expect(result.n_samples).toBe(0);
    expect(result.device_last_reported).toBe("2026-08-07T14:38:49.000Z");
    expect(result.note).toContain("last reported");
  });

  it("falls back to widening windows when /water/last gives nothing, and stops", async () => {
    // `/water/last` drops readings with no GPS fix, so an empty response there is not proof of
    // silence — the period route does not filter, and is the honest second opinion. That probe
    // widens at most twice rather than climbing to a year-wide fetch.
    const { tool, calls } = makeTool({
      last: [], periodDay: [], periodWeek: [], periodMonth: [],
    });
    const result = await tool.run({
      metric: "ph", time_range: "last day", aggregation: "mean", device: "OWC",
    });

    const periodCalls = calls.filter((call) => call.url.includes("/water/period/"));
    expect(periodCalls).toHaveLength(3);
    expect(periodCalls.some((call) => call.url.includes("/1/year"))).toBe(false);
    expect(result.value).toBeNull();
    expect(result.device_last_reported).toBeNull();
  });
});

describe("query_sensor_data — caveats that travel with the number", () => {
  it("marks turbidity as a provisional uncalibrated index", async () => {
    // The value is derived from a raw voltage by a conversion its own source marks provisional
    // (DEVICE_API.md §8). Presenting it as a calibrated NTU measurement overstates it.
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "turbidity", time_range: "last day", aggregation: "mean", device: "Algalita",
    });

    expect(result.note).toContain("provisional, uncalibrated");
    expect(result.unit).toBe("NTU");
  });

  it("flags a device whose water type disagrees with the deployment's", async () => {
    // WATER_TYPE is one global env var selecting the conductivity and turbidity ranges in the
    // system prompt, and the two cleared pods are different water types — one deployment cannot
    // serve both. This is a flag, not a fix: making it per-device is N4 work and an input to
    // ◆G3 (DEVICE_API.md §12c).
    const { tool } = makeTool(undefined, { waterType: "freshwater" });
    const result = await tool.run({
      metric: "conductivity", time_range: "last day", aggregation: "mean", device: "Algalita",
    });

    expect(result.note).toContain("salt-water");
    expect(result.note).toContain("freshwater");
  });

  it("says nothing about water type when the device agrees with the deployment", async () => {
    const { tool } = makeTool(undefined, { waterType: "saltwater" });
    const result = await tool.run({
      metric: "conductivity", time_range: "last day", aggregation: "mean", device: "Algalita",
    });

    expect(result.note).toBeUndefined();
  });

  it("reports the device's own operating environment alongside the reading", async () => {
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "ph", time_range: "last day", aggregation: "mean", device: "Algalita",
    });

    expect(result.device).toMatchObject({ label: ALGALITA, operating_environment: "salt-water" });
  });
});

describe("query_sensor_data — errors are returned, not thrown", () => {
  it("rejects an unknown metric with the valid list", async () => {
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "salinity", time_range: "last day", aggregation: "mean", device: "Algalita",
    });

    expect(result.error).toContain("salinity");
    expect(result.error).toContain("dissolved_oxygen");
  });

  it("rejects an unknown aggregation", async () => {
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "ph", time_range: "last day", aggregation: "average", device: "Algalita",
    });

    expect(result.error).toContain("average");
  });

  it("rejects an unparseable time range with the accepted forms", async () => {
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "ph", time_range: "since the storm", aggregation: "mean", device: "Algalita",
    });

    expect(result.error).toContain("Accepted forms");
  });

  it("lists the available devices when the name does not match", async () => {
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "ph", time_range: "last day", aggregation: "mean", device: "harbour buoy",
    });

    expect(result.error).toContain("Algalita Pod");
    expect(result.error).toContain("Old Woman Creek 2026");
  });

  it("asks which device rather than guessing when none is named", async () => {
    // Answering about the wrong pod is worse than an error: the two cleared pods are in
    // different water bodies on opposite coasts, and either answer looks confident.
    const { tool } = makeTool();
    const result = await tool.run({
      metric: "ph", time_range: "last day", aggregation: "mean",
    });

    expect(result.error).toContain("device");
    expect(result.value).toBeUndefined();
  });

  it("uses the configured default device when one is set", async () => {
    const { tool } = makeTool(undefined, { defaultDeviceLabel: ALGALITA });
    const result = await tool.run({
      metric: "ph", time_range: "last day", aggregation: "mean",
    });

    expect(result.error).toBeUndefined();
    expect(result.device).toMatchObject({ label: ALGALITA });
  });

  it("turns a device-API failure into a tool error the model can report", async () => {
    const failing = new DeviceApiClient({
      baseUrl: "https://example.invalid/api/v1",
      token: "test-token",
      fetchImpl: async () => { throw new Error("connection refused"); },
    });
    const tool = new QuerySensorData({ client: failing, now: () => NOW });
    const result = await tool.run({
      metric: "ph", time_range: "last day", aggregation: "mean", device: "Algalita",
    });

    // Not thrown: a 500 on the chat request denies the model the chance to say it could not
    // reach the sensors (MIGRATION_SPEC §3, §8).
    expect(result.error).toContain("Could not read sensor data");
  });
});
