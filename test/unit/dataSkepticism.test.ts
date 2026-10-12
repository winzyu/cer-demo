import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { GenerateReport } from "../../src/tools/generateReport";
import { GetPodThresholds } from "../../src/tools/getPodThresholds";
import { QuerySensorData } from "../../src/tools/querySensorData";
import type { ToolContext } from "../../src/types/tool.types";
import {
  ACID_READING,
  ACID_READINGS,
  BAY_MOUTH,
  ESTUARY_OXYGEN,
  HARBOR_ACID,
  IMPLAUSIBLE_LAST_WEEK,
  OXYGEN_EVENT_HOURS,
  QUIET_COVE,
  QUIET_SILENT_DAYS,
  buildFleet,
  routeDeviceApi,
  type Fleet,
  type FleetOptions,
  type RawReading,
} from "../fixtures/skepticism/fleet";

/**
 * The data-skepticism incident (`docs/migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`) at the
 * tool layer: what `query_sensor_data`, `generate_report` and `get_pod_thresholds` hand the model
 * for a week shaped on the conversation Gilligan wrote off as sensor faults, and for the four
 * over-correction guards in the record's §6 step 5.
 *
 * The record's root causes 1-4 live in the prompt and catalogue and are tested by the paid replay
 * (`scripts/skepticism/`); these cases pin the half the tools own: a solar cycle and an afternoon
 * pH dip are never a data issue, the device-flagged faults are still reported, a daily dip is not
 * a persistent offset, and nothing in a tool result names a cause no tool measured.
 *
 * Offline: the fleet is served through a stubbed `fetch` into the real client and decoder.
 */

const NOW = Date.parse("2026-10-09T21:30:00.000Z");
const HOUR = 60 * 60_000;
const CONTEXT: ToolContext = { token: "test-token" };

type Result = Record<string, unknown>;
type Verdict = {
  status: string;
  out_of_range?: { direction: string; first_run_start: string; latest_run_end: string; runs: number; persistent: boolean };
};
type MetricResult = {
  verdict: Verdict;
  n_samples: number;
  excluded_stuck?: number;
  sensor_quality?: string;
  excluded_implausible?: number;
  excluded_implausible_values?: Array<{ value: number }>;
  excluded_implausible_not_listed?: number;
};

/** A fresh tool per fleet: `QuerySensorData` caches site reads, so fleets must not share one. */
const toolsFor = (fleet: Fleet) => {
  const paths: string[] = [];
  const fetchImpl = async (url: string): Promise<Response> => {
    const path = url.replace("https://example.invalid", "");
    paths.push(path);
    const body = routeDeviceApi(fleet, path);
    if (body === undefined) throw new Error(`The fake device API does not serve ${path}`);
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
  };
  const client = new DeviceApiClient({ baseUrl: "https://example.invalid/api/v1", token: "test-token", fetchImpl });
  const sensor = new QuerySensorData({ client, now: () => fleet.now });
  return {
    paths,
    query: (args: Result) => sensor.run(args, CONTEXT) as Promise<Result>,
    report: (args: Result) => new GenerateReport({ sensor }).run(args, CONTEXT) as Promise<Result>,
    thresholds: (args: Result) => new GetPodThresholds({ sensor }).run(args, CONTEXT) as Promise<Result>,
  };
};

const fleetWith = (options?: FleetOptions): Fleet => buildFleet(NOW, options);
const metrics = (result: Result): Record<string, MetricResult> => result.metrics as Record<string, MetricResult>;

/** Causes the conversation reached for that no tool measures (record §2, §3 root cause 4). */
const UNMEASURED_CAUSE = /tid(e|al)|swell|el ni[nñ]o|low water|exposed|exposure|weather|rain|storm|wave/i;

describe("data skepticism: the incident week (Bay Mouth Pod, last 7 days)", () => {
  const tools = toolsFor(fleetWith());
  let week: Result;
  beforeAll(async () => {
    week = await tools.query({ device: BAY_MOUTH, metric: "all", time_range: "last 7 days", aggregation: "series" });
  });

  it("covers the requested week, complete, with the earlier location excluded and said", () => {
    expect(week.window_actually_searched).toEqual({
      start: "2026-10-02T21:30:00.000Z", end: "2026-10-09T21:30:00.000Z", complete: true,
    });
    expect(week.site_note).toMatch(/^775 reading\(s\) from an earlier location were excluded/);
    expect((week.reading_counts as { used: number }).used).toBe(316);
  });

  it("never calls the solar cycle a data issue: temperature, pH and dissolved oxygen stay judged on their limits", () => {
    const m = metrics(week);
    ["temperature", "ph", "dissolved_oxygen"].forEach((key) => {
      expect(m[key].verdict.status).toBe("in range");
      expect(m[key].n_samples).toBe(316);
    });
  });

  it("an afternoon pH just under 6 is a stray reading, not an exceedance (the 3-in-a-row rule plus the 0.2 detectable change)", async () => {
    const fleet = fleetWith();
    const week7 = fleet.readings[BAY_MOUTH].filter((r) => r.timestamp * 1000 >= NOW - 7 * 24 * HOUR);
    expect(week7.filter((r) => r.water_data[99] < 6).length).toBeGreaterThan(0);
    expect(metrics(week).ph.verdict.status).toBe("in range");
  });

  it("still reports the 16 implausible conductivity readings, excluded, without calling the channel a data issue", () => {
    const conductivity = metrics(week).conductivity;
    expect(conductivity.excluded_implausible).toBe(IMPLAUSIBLE_LAST_WEEK);
    expect(conductivity.excluded_implausible_values?.every((v) => v.value === 0)).toBe(true);
    expect(conductivity.verdict.status).toBe("in range");
    expect(week.note).toContain(`${IMPLAUSIBLE_LAST_WEEK} Conductivity reading(s)`);
  });

  it("still reports stuck turbidity as a likely failed sensor", () => {
    const turbidity = metrics(week).turbidity;
    expect(turbidity.sensor_quality).toBe("likely failed sensor");
    expect(turbidity.verdict.status).toBe("likely data issue");
    expect(turbidity.excluded_stuck).toBe(316);
    expect(turbidity.n_samples).toBe(0);
  });

  it("keeps the user notes to the device-flagged faults and the earlier location", () => {
    const notes = week.user_notes as string[];
    expect(notes).toHaveLength(3);
    expect(notes.join(" ")).toMatch(/Conductivity/);
    expect(notes.join(" ")).toMatch(/earlier location/);
    expect(notes.join(" ")).toMatch(/Turbidity/);
    expect(notes.join(" ")).not.toMatch(/temperature|pH|oxygen/i);
  });

  it("names no cause that no tool measured, in any result the model could quote", async () => {
    const results = [
      week,
      await tools.query({ device: BAY_MOUTH, metric: "ph", time_range: "last 30 days", aggregation: "series" }),
      await tools.query({ device: BAY_MOUTH, metric: "all", time_range: "last 3 months", aggregation: "mean" }),
      await tools.report({ device: BAY_MOUTH, time_range: "last 7 days" }),
      await tools.thresholds({ device: BAY_MOUTH }),
    ];
    results.forEach((result) => expect(JSON.stringify(result)).not.toMatch(UNMEASURED_CAUSE));
  });

  it("reports the week as Normal: no event, no flag on any configured parameter", async () => {
    const report = await tools.report({ device: BAY_MOUTH, time_range: "last 7 days" });
    expect(report.status).toBe("Normal");
    expect(report.parameter_flags).toEqual({
      dissolved_oxygen: "Normal", orp: "Normal", ph: "Normal", conductivity: "Normal", temperature: "Normal",
    });
    expect(report.events_flagged).toBe(0);
  });

  it("reads only the routes the fake serves: devices, then period windows", () => {
    expect(new Set(tools.paths.map((p) => p.replace(/\/\d+\/\w+\?.*$/, "")))).toEqual(
      new Set(["/api/v1/devices", "/api/v1/water/period"]),
    );
  });
});

describe("data skepticism: a deep daily pH dip is a real exceedance, never a persistent offset (record §5)", () => {
  const tools = toolsFor(fleetWith({ bayMouthPhSwing: 1.9 }));

  it.each(["last 7 days", "last 30 days"])("%s: out of range low, in daily runs, not persistent, not a data issue", async (range) => {
    const ph = await tools.query({ device: BAY_MOUTH, metric: "ph", time_range: range, aggregation: "mean" });
    const verdict = ph.verdict as Verdict;
    expect(verdict.status).toBe("out of range");
    expect(verdict.out_of_range).toMatchObject({ direction: "low", persistent: false });
    expect(verdict.out_of_range?.runs).toBeGreaterThanOrEqual(range === "last 7 days" ? 7 : 28);
  });

  it("the report flags pH as an exceedance and leaves every other parameter Normal", async () => {
    const report = await tools.report({ device: BAY_MOUTH, time_range: "last 7 days" });
    expect(report.status).toBe("Action Required");
    expect(report.parameter_flags).toMatchObject({ ph: "Exceedance", temperature: "Normal", conductivity: "Normal" });
    expect(report.status_reason).not.toMatch(/sensor|fault|calibrat|fouling/i);
  });
});

describe("data skepticism: over-correction guards (record §6 step 5)", () => {
  const tools = toolsFor(fleetWith());

  it("pH 2.07 is still implausible: excluded, listed and said, not averaged in", async () => {
    const ph = await tools.query({ device: HARBOR_ACID, metric: "ph", time_range: "last 7 days", aggregation: "mean" });
    expect(ph.excluded_implausible).toBe(ACID_READINGS);
    expect((ph.excluded_implausible_values as Array<{ value: number }>).map((v) => v.value))
      .toEqual(Array(ACID_READINGS).fill(ACID_READING));
    expect(ph.value as number).toBeGreaterThan(7.5);
    expect(ph.user_notes).toEqual([expect.stringContaining("pH plausibility band")]);
  });

  it(`an ${OXYGEN_EVENT_HOURS}-hour oxygen drop is still a real event: out of range low, one run, not a data issue`, async () => {
    const oxygen = await tools.query({ device: ESTUARY_OXYGEN, metric: "dissolved_oxygen", time_range: "last 7 days", aggregation: "mean" });
    const verdict = oxygen.verdict as Verdict;
    expect(verdict.status).toBe("out of range");
    expect(verdict.out_of_range).toMatchObject({ direction: "low", runs: 1, persistent: false });
    const span = Date.parse(verdict.out_of_range?.latest_run_end ?? "") - Date.parse(verdict.out_of_range?.first_run_start ?? "");
    expect(span).toBeGreaterThan((OXYGEN_EVENT_HOURS - 5) * HOUR);
    expect(span).toBeLessThanOrEqual(OXYGEN_EVENT_HOURS * HOUR);
    expect(oxygen.excluded_faulted).toBe(0);

    const report = await tools.report({ device: ESTUARY_OXYGEN, time_range: "last 7 days" });
    expect((report.parameter_flags as Record<string, string>).dissolved_oxygen).not.toBe("Normal");
  });

  it(`a pod silent for ${QUIET_SILENT_DAYS} days is still silent: stale, aged, and its week ends at the last reading`, async () => {
    const quiet = await tools.query({ device: QUIET_COVE, metric: "all", time_range: "last 7 days", aggregation: "mean" });
    expect(quiet.device_last_reported_stale).toBe(true);
    expect(quiet.device_last_reported_age).toBe(`${QUIET_SILENT_DAYS} days`);
    expect((quiet.time_range_resolved as { end: string }).end).toBe(new Date(NOW - QUIET_SILENT_DAYS * 24 * HOUR).toISOString());
  });

  it("stuck turbidity is still a likely failed sensor on a pod with nothing else wrong", async () => {
    const quiet = await tools.query({ device: HARBOR_ACID, metric: "turbidity", time_range: "last 7 days", aggregation: "mean" });
    expect(quiet.sensor_quality).toBe("likely failed sensor");
    expect((quiet.verdict as Verdict).status).toBe("likely data issue");
  });

  it("the guard pods' healthy channels stay in range (drifting noise trips no QC rule)", async () => {
    for (const pod of [HARBOR_ACID, QUIET_COVE]) {
      const all = await tools.query({ device: pod, metric: "all", time_range: "last 7 days", aggregation: "mean" });
      ["temperature", "ph", "dissolved_oxygen", "orp", "conductivity"].forEach((key) => {
        expect([pod, key, metrics(all)[key].verdict.status]).toEqual([pod, key, "in range"]);
      });
    }
  });
});

describe("data skepticism: a steady channel with independent noise", () => {
  /** Box-Muller over mulberry32, so the noise is Gaussian and the same on every run. */
  const gaussian = (seed: number) => {
    let state = seed;
    const uniform = (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return (): number => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
  };

  /**
   * Harbor Acid Pod with its conductivity replaced by 52,000 µS/cm plus independent Gaussian noise
   * (sd 300, about 0.6%, inside the probe's 2% detectable change), and its pH spikes removed.
   * Nothing is wrong with this channel. The spike rule compares each reading with its neighbours
   * against 3 x the **whole series'** MAD; on a steady channel that MAD is the noise itself, so
   * ordinary noise makes spikes, and three in a row make a "likely data issue". A simulation of the
   * rule gave a data issue in about 78% of such weeks. Real probe noise is partly correlated, so
   * the production rate is unknown; a series with a daily cycle (Bay Mouth's temperature) has a
   * larger MAD and is unaffected, but Bay Mouth's ORP (independent noise, no cycle) shows three
   * such runs over its three-month window.
   *
   * Recorded as `it.failing`: it starts failing once the spike rule stops flagging plain noise.
   */
  const steadyFleet = (): Fleet => {
    const fleet = fleetWith();
    const noise = gaussian(20261011);
    fleet.readings[HARBOR_ACID] = fleet.readings[HARBOR_ACID].map((r: RawReading) => ({
      ...r,
      water_data: { ...r.water_data, 99: 8.0, 100: Math.round(52_000 + 300 * noise()) },
    }));
    return fleet;
  };

  it("the noise sits inside the detectable change: no reading is implausible or beyond a limit", async () => {
    const conductivity = await toolsFor(steadyFleet()).query({
      device: HARBOR_ACID, metric: "conductivity", time_range: "last 7 days", aggregation: "mean",
    });
    expect(conductivity.excluded_implausible).toBeUndefined();
    expect(conductivity.value as number).toBeCloseTo(52_000, -2);
  });

  it.failing("is not a likely data issue", async () => {
    const conductivity = await toolsFor(steadyFleet()).query({
      device: HARBOR_ACID, metric: "conductivity", time_range: "last 7 days", aggregation: "mean",
    });
    expect((conductivity.verdict as Verdict).status).toBe("in range");
  });
});
