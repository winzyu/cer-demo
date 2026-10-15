import type { Sample } from "../../src/tools/aggregate";
import { dailyPeaks, solarOffsetHours } from "../../src/tools/dailyCycle";
import { GetTides, getTidesDefinition } from "../../src/tools/getTides";
import { buildToolRegistry } from "../../src/tools";
import type { QuerySensorData, SensorQueryParams } from "../../src/tools/querySensorData";
import { NoaaTides, type TideEvent } from "../../src/tides/noaaTides";
import { compareWithTides } from "../../src/tides/tideComparison";
import { buildSystemPrompt, TOOL_BLOCK, toolBlock } from "../../src/prompt/systemPrompt";

/**
 * `get_tides` (`src/tools/getTides.ts`) and its parts, offline: NOAA is a stubbed `fetch`, and the
 * pod's readings come from a stand-in for `QuerySensorData` that serves synthetic samples.
 */

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const START = Date.parse("2026-10-01T00:00:00.000Z");
/** Bay Mouth's longitude: local solar time runs about 7 h 52 min behind UTC. */
const LON = -118.1146;
const LAT = 33.6;
const OFFSET = solarOffsetHours(LON) * HOUR;
const TIDE_PERIOD = 12.42 * HOUR;
/** First high tide of the synthetic series. */
const FIRST_HIGH = START + 3 * HOUR;

/** Highs every 12.42 h from `FIRST_HIGH`, each followed by a low, over `days` plus a margin. */
const tideSeries = (days: number): TideEvent[] => {
  const out: TideEvent[] = [];
  for (let t = FIRST_HIGH - TIDE_PERIOD; t < START + (days + 1) * DAY; t += TIDE_PERIOD) {
    out.push({ atMs: t, type: "high", levelM: 1.6 });
    out.push({ atMs: t + TIDE_PERIOD / 2, type: "low", levelM: 0.1 });
  }
  return out;
};

/** Half-hourly samples whose value peaks once a day at `peakAt(day)` (epoch ms). */
const samples = (days: number, peakAt: (day: number) => number): Sample[] => {
  const out: Sample[] = [];
  for (let t = START; t < START + days * DAY; t += HOUR / 2) {
    const day = Math.floor((t + OFFSET - (START + OFFSET)) / DAY);
    const distance = Math.min(
      ...[day - 1, day, day + 1].map((d) => Math.abs(t - peakAt(d))),
    );
    out.push({
      atMs: t, at: new Date(t).toISOString(), value: 10 - distance / HOUR, valid: true, plausible: true,
    });
  }
  return out;
};

/** A peak 2 hours after the high tide nearest each local solar afternoon. */
const tidalPeak = (day: number): number => {
  const afternoon = START - OFFSET + day * DAY + 14 * HOUR;
  const k = Math.round((afternoon - FIRST_HIGH) / TIDE_PERIOD);
  return FIRST_HIGH + k * TIDE_PERIOD + 2 * HOUR;
};
const solarPeak = (day: number): number => START - OFFSET + day * DAY + 14.5 * HOUR;

describe("compareWithTides", () => {
  it("finds a steady lag behind high tide and calls the peaks tidal", () => {
    const rows = samples(10, tidalPeak);
    const result = compareWithTides(dailyPeaks(rows, LON), tideSeries(10), LON, "about 50 minutes later each day");
    expect(result?.verdict).toBe("peaks follow the tide");
    expect(result?.mean_hours_after_high_tide).toBeCloseTo(2, 0);
    expect(result!.lag_scatter_hours).toBeLessThan(0.5);
  });

  it("calls peaks that hold their hour while the tide drifts solar, not tidal", () => {
    const rows = samples(10, solarPeak);
    const result = compareWithTides(dailyPeaks(rows, LON), tideSeries(10), LON, "same hour each day");
    expect(result?.verdict).toBe("peaks keep to the time of day, not the tide");
    expect(result!.lag_scatter_hours).toBeGreaterThan(1.5);
    expect(result!.daily[0].peak_local_solar.slice(11, 13)).toBe("14");
  });

  it("keeps a peak at low tide on one side of the cycle rather than splitting it", () => {
    const atLow = (day: number): number => tidalPeak(day) - 2 * HOUR + TIDE_PERIOD / 2;
    const result = compareWithTides(dailyPeaks(samples(10, atLow), LON), tideSeries(10), LON, undefined);
    expect(result?.verdict).toBe("peaks follow the tide");
    expect(Math.abs(result!.mean_hours_after_high_tide)).toBeCloseTo(6.2, 0);
  });

  it("stays unclear when neither the hour nor the lag holds", () => {
    const wander = (day: number): number => solarPeak(day) + ((day * 7) % 5) * 2 * HOUR;
    const result = compareWithTides(dailyPeaks(samples(10, wander), LON), tideSeries(10), LON, "unclear");
    expect(result?.verdict).toBe("unclear");
  });

  it("gives nothing with fewer than five days to compare", () => {
    expect(compareWithTides(dailyPeaks(samples(5, solarPeak), LON), tideSeries(5), LON, "same hour each day"))
      .toBeUndefined();
  });
});

const STATIONS = {
  count: 3,
  stations: [
    { id: "9410580", name: "Newport Bay Entrance, Corona del Mar", lat: 33.6033, lng: -117.883, type: "R" },
    { id: "9410660", name: "LOS ANGELES (Outer Harbor)", lat: 33.72, lng: -118.272, type: "R" },
    { id: "9414290", name: "SAN FRANCISCO", lat: 37.8063, lng: -122.4659, type: "R" },
  ],
};

const noaaFetch = (days = 10): { fetchImpl: typeof fetch; urls: string[] } => {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    let body: unknown = STATIONS;
    if (url.includes("datagetter")) {
      if (url.includes("station=9087057")) {
        // What NOAA really does: a 400 whose JSON body says why.
        const error = JSON.stringify({ error: { message: " Great Lakes stations don't have Predictions data." } });
        return { ok: false, status: 400, text: async () => error } as unknown as Response;
      }
      body = {
          predictions: tideSeries(days).map((tide) => ({
            t: new Date(tide.atMs).toISOString().slice(0, 16).replace("T", " "),
            v: String(tide.levelM),
            type: tide.type === "high" ? "H" : "L",
          })),
        };
    }
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
};

const noaa = (days = 10): { client: NoaaTides; urls: string[] } => {
  const { fetchImpl, urls } = noaaFetch(days);
  return {
    client: new NoaaTides({
      dataUrl: "https://noaa.invalid/datagetter",
      stationsUrl: "https://noaa.invalid/stations.json",
      fetchImpl,
    }),
    urls,
  };
};

describe("NoaaTides", () => {
  it("asks for GMT high and low predictions and reads them as UTC events", async () => {
    const { client, urls } = noaa();
    const tides = await client.highsAndLows("9410580", START, START + DAY);
    expect(urls[0]).toContain("interval=hilo");
    expect(urls[0]).toContain("time_zone=gmt");
    expect(urls[0]).toContain("begin_date=20261001+00%3A00");
    expect(tides.find((t) => t.atMs === FIRST_HIGH)).toEqual({ atMs: FIRST_HIGH, type: "high", levelM: 1.6 });
  });

  it("says which station has no predictions instead of returning an empty list", async () => {
    const { client } = noaa();
    await expect(client.highsAndLows("9087057", START, START + DAY)).rejects.toThrow(/400: Great Lakes/);
  });

  it("finds the nearest station and fetches the station list once", async () => {
    const { client, urls } = noaa();
    const nearest = await client.nearestStation(LAT, LON);
    expect(nearest?.station.id).toBe("9410660");
    expect(nearest!.distanceKm).toBeLessThan(20);
    await client.stationById("9410580");
    expect(urls.filter((url) => url.includes("stations.json"))).toHaveLength(1);
  });
});

interface FakeDevice {
  operatingEnvironment?: string;
  noaaTidesId?: string;
  position?: { latitude: number; longitude: number } | null;
  rows?: Sample[];
}

const fakeSensor = (pod: FakeDevice): { sensor: QuerySensorData; queries: SensorQueryParams[] } => {
  const queries: SensorQueryParams[] = [];
  const rows = pod.rows ?? samples(10, solarPeak);
  const sensor = {
    resolveDeviceForTool: async () => ({
      device: {
        id: "x",
        name: "Bay Mouth Pod",
        label: "dev:1",
        operatingEnvironment: pod.operatingEnvironment ?? "salt-water",
        thresholds: {},
        raw: pod.noaaTidesId ? { noaaTidesId: pod.noaaTidesId } : {},
      },
    }),
    query: async (params: SensorQueryParams) => {
      queries.push(params);
      params.onSamples?.(params.metric, rows);
      return {
        ...(pod.position === null ? {} : { position: pod.position ?? { latitude: LAT, longitude: LON } }),
        window_actually_searched: {
          start: new Date(START).toISOString(), end: new Date(START + 10 * DAY).toISOString(), complete: true,
        },
      };
    },
  } as unknown as QuerySensorData;
  return { sensor, queries };
};

describe("get_tides", () => {
  it("is named get_tides and needs no arguments", () => {
    expect(getTidesDefinition.function.name).toBe("get_tides");
    expect(getTidesDefinition.function.parameters.required).toEqual([]);
  });

  it("says a freshwater pod has no tides without asking NOAA", async () => {
    const { client, urls } = noaa();
    const { sensor } = fakeSensor({ operatingEnvironment: "freshwater" });
    const result = await new GetTides({ sensor, noaa: client }).run({}, { token: "t" });
    expect(result.tides).toBe("none");
    expect(String(result.reason)).toMatch(/freshwater/);
    expect(urls).toHaveLength(0);
  });

  it("compares a metric with the tides at the nearest station", async () => {
    const { client } = noaa();
    const { sensor, queries } = fakeSensor({ rows: samples(10, tidalPeak) });
    const result = await new GetTides({ sensor, noaa: client, maxStationKm: 50 })
      .run({ metric: "ph", time_range: "last 10 days" }, { token: "t" });
    expect(queries[0]).toMatchObject({ metric: "ph", timeRange: "last 10 days", aggregation: "series" });
    expect(result.station).toMatchObject({ id: "9410660", chosen: "nearest to the pod" });
    expect(result.comparison).toMatchObject({ metric: "ph", verdict: "peaks follow the tide" });
    expect(Array.isArray(result.tides)).toBe(true);
    expect(String(result.source)).toMatch(/no storm surge, swell or waves/);
  });

  it("passes over a registry station NOAA has no predictions for, and says so", async () => {
    const { client } = noaa();
    const { sensor } = fakeSensor({ noaaTidesId: "9087057" });
    const result = await new GetTides({ sensor, noaa: client, maxStationKm: 50 }).run({}, { token: "t" });
    expect(result.station).toMatchObject({ id: "9410660", chosen: "nearest to the pod" });
    expect(String((result.station as { note: string }).note)).toMatch(/9087057 has no NOAA tide predictions/);
  });

  it("uses the registry station when it is close enough", async () => {
    const { client } = noaa();
    const { sensor } = fakeSensor({ noaaTidesId: "9410580" });
    const result = await new GetTides({ sensor, noaa: client, maxStationKm: 50 }).run({}, { token: "t" });
    expect(result.station).toMatchObject({ id: "9410580", chosen: "registry noaaTidesId" });
  });

  it("gives no tides when no station is within range, naming the nearest", async () => {
    const { client } = noaa();
    const { sensor } = fakeSensor({ position: { latitude: 45, longitude: -140 } });
    const result = await new GetTides({ sensor, noaa: client, maxStationKm: 50 }).run({}, { token: "t" });
    expect(result.tides).toBe("none");
    expect(String(result.reason)).toMatch(/within 50 km.*nearest/);
  });

  it("gives no tides when no reading in the period has a GPS fix", async () => {
    const { client } = noaa();
    const { sensor } = fakeSensor({ position: null });
    const result = await new GetTides({ sensor, noaa: client }).run({}, { token: "t" });
    expect(result.tides).toBe("none");
    expect(String(result.reason)).toMatch(/GPS fix/);
  });
});

describe("get_tides behind TIDE_TOOL", () => {
  const names = (sensor: boolean, tides: boolean): string[] => buildToolRegistry(sensor, false, tides)
    .map((handler) => handler.definition.function.name);

  it("registers the tool only with both the sensor and tide flags on", () => {
    expect(names(true, true)).toContain("get_tides");
    expect(names(true, false)).not.toContain("get_tides");
    expect(names(false, true)).not.toContain("get_tides");
  });

  it("leaves the tide-off prompt unchanged and only rewrites the tide sentences when on", () => {
    expect(toolBlock(false)).toBe(TOOL_BLOCK);
    const off = buildSystemPrompt(true, false, null, null, false);
    const on = buildSystemPrompt(true, false, null, null, true);
    const base = buildSystemPrompt(false, false, null, null, true);
    expect(off).toContain(TOOL_BLOCK);
    expect(on).toContain(toolBlock(true));
    expect(base).toBe(buildSystemPrompt(false, false, null, null, false));
    expect(on).toContain("- get_tides — NOAA's predicted high and low tides");
    expect(on).toContain("call get_tides with that metric");
    expect(on).not.toContain("and say that no\n  tool measures tides");
    expect(on).toContain("Swell, waves, weather, rain, air");
    expect(on).not.toContain("Tides, swell, waves, weather");
    expect(on.slice(0, on.indexOf("TOOLS:"))).toBe(off.slice(0, off.indexOf("TOOLS:")));
  });
});
