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
  MARINA_DOCK,
  OXYGEN_EVENT_HOURS,
  PROBE_FAULT,
  QUIET_COVE,
  QUIET_SILENT_DAYS,
  STEADY_CHANNEL,
  TIDAL_FLAT,
  buildFleet,
  dockCleaningWindow,
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
  out_of_range?: {
    direction: string;
    flagged: Array<{ from: string; to: string }>;
    flagged_not_listed?: number;
    current: boolean;
    persistent: boolean;
  };
  at_edge?: { side: string; shape: string };
  unusual_readings?: number;
  unusual_listed?: Array<{ value: number; why?: string }>;
  unusual_stretches?: unknown[];
  data_issue?: unknown[];
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

  it("covers the requested week, complete, telling only the model about the earlier location it never reached", () => {
    expect(week.window_actually_searched).toEqual({
      start: "2026-10-02T21:30:00.000Z", end: "2026-10-09T21:30:00.000Z", complete: true,
    });
    // The earlier location ended 50 days before the week, so nothing was left out of it (SPECS §19).
    expect(week.site_note).toBeUndefined();
    expect(week.site_history_note).toMatch(/its 775 earlier-location reading\(s\) .* fall outside the requested period/);
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

  it("keeps the user notes to the device-flagged faults", () => {
    const notes = week.user_notes as string[];
    expect(notes).toHaveLength(2);
    expect(notes.join(" ")).toMatch(/Conductivity/);
    expect(notes.join(" ")).not.toMatch(/earlier location/);
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

  it("reports the week as Watch for pH at the low edge most afternoons: no flag, no event (Michael #6)", async () => {
    const report = await tools.report({ device: BAY_MOUTH, time_range: "last 7 days" });
    expect(report.status).toBe("Watch");
    expect(report.status_reason).toMatch(/^Watch because a parameter sat at the edge of its healthy range/);
    expect(report.parameter_flags).toEqual({
      dissolved_oxygen: "Normal", orp: "Normal", ph: "Normal", conductivity: "Normal", temperature: "Normal",
    });
    expect(report.flag_detail).toEqual({
      ph: { at_edge: expect.objectContaining({ side: "low", shape: "daily", days: 7, period_days: 7 }) },
    });
    expect(report.events_flagged).toBe(0);
    const ph = await tools.query({ device: BAY_MOUTH, metric: "ph", time_range: "last 7 days", aggregation: "mean" });
    expect((ph.verdict as Verdict)).toMatchObject({
      status: "in range", at_edge: { side: "low edge", shape: "on 7 of 7 days" },
    });
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
    // Each afternoon is its own flagged stretch, so the days are named, not the period.
    const stretches = (verdict.out_of_range?.flagged.length ?? 0) + (verdict.out_of_range?.flagged_not_listed ?? 0);
    expect(stretches).toBeGreaterThanOrEqual(range === "last 7 days" ? 7 : 28);
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

  it("pH 2.07 is kept and listed as unusual, never a fault and never a flag (2026-10-13)", async () => {
    const ph = await tools.query({ device: HARBOR_ACID, metric: "ph", time_range: "last 7 days", aggregation: "mean" });
    expect(ph).not.toHaveProperty("excluded_implausible");
    const verdict = ph.verdict as Verdict;
    expect(verdict.status).toBe("in range");
    expect(verdict.unusual_listed!.filter((u) => u.why === "outside the range natural water spans").map((u) => u.value))
      .toEqual(Array(ACID_READINGS).fill(ACID_READING));
    // Isolated, a day and a half apart: no stretch to mention, no data issue.
    expect(verdict).not.toHaveProperty("unusual_stretches");
    expect(verdict).not.toHaveProperty("data_issue");
    const report = await tools.report({ device: HARBOR_ACID, time_range: "last 7 days" });
    expect(report.status).not.toBe("Action Required");
    expect((report.parameter_flags as Record<string, string>).ph).toBe("Normal");
  });

  it(`an ${OXYGEN_EVENT_HOURS}-hour oxygen drop is still a real event: out of range low, one run, not a data issue`, async () => {
    const oxygen = await tools.query({ device: ESTUARY_OXYGEN, metric: "dissolved_oxygen", time_range: "last 7 days", aggregation: "mean" });
    const verdict = oxygen.verdict as Verdict;
    expect(verdict.status).toBe("out of range");
    expect(verdict.out_of_range).toMatchObject({ direction: "low", persistent: false });
    expect(verdict.out_of_range?.flagged).toHaveLength(1);
    const [stretch] = verdict.out_of_range!.flagged;
    const span = Date.parse(stretch.to) - Date.parse(stretch.from);
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
   * Fixed on dev by `612adaa`: a spike must also exceed the probe's minimum detectable change.
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

  it("is not a likely data issue", async () => {
    const conductivity = await toolsFor(steadyFleet()).query({
      device: HARBOR_ACID, metric: "conductivity", time_range: "last 7 days", aggregation: "mean",
    });
    expect((conductivity.verdict as Verdict).status).toBe("in range");
  });
});

describe("data skepticism: scenario pods", () => {
  const tools = toolsFor(fleetWith());
  const week = (device: string, metric = "all") => tools.query({
    device, metric, time_range: "last 7 days", aggregation: "series",
  });

  it("a tide is never a data issue: every Tidal Flat channel stays judged on its limits", async () => {
    const m = metrics(await week(TIDAL_FLAT));
    ["temperature", "ph", "conductivity", "dissolved_oxygen", "orp"].forEach((key) => {
      expect(m[key].verdict.status).toBe("in range");
    });
  });

  it("the tidal pod's daily high drifts later each day while Bay Mouth's stays on the clock", () => {
    const fleet = fleetWith();
    const peakHours = (device: string, code: number): number[] => {
      const byDay = new Map<string, RawReading>();
      fleet.readings[device].filter((r) => r.timestamp * 1000 >= NOW - 6 * 24 * HOUR).forEach((r) => {
        const day = new Date(r.timestamp * 1000).toISOString().slice(0, 10);
        const best = byDay.get(day);
        if (!best || r.water_data[code] > best.water_data[code]) byDay.set(day, r);
      });
      return [...byDay.values()].slice(1, -1).map((r) => (r.timestamp % 86_400) / 3_600);
    };
    const drift = (hours: number[]): number => (hours[hours.length - 1] - hours[0]) / (hours.length - 1);
    expect(drift(peakHours(TIDAL_FLAT, 100))).toBeGreaterThan(0.5);
    expect(Math.abs(drift(peakHours(BAY_MOUTH, 102)))).toBeLessThan(0.5);
  });

  it("tells the sun from the tide by when each day's peak comes (record §5 item 5)", async () => {
    type Cycle = { timing: string; daily_peaks_local_solar: string[]; peak_drift_minutes_per_day: number };
    const cycle = (result: Result, key: string): Cycle => (metrics(result)[key] as unknown as { daily_cycle: Cycle }).daily_cycle;
    const bay = await week(BAY_MOUTH);
    const tidal = await week(TIDAL_FLAT);
    expect(cycle(bay, "temperature").timing).toBe("same hour each day");
    // Warmest about 15:30 PDT, which is about 14:40 local solar time at longitude -118.1.
    cycle(bay, "temperature").daily_peaks_local_solar.forEach((at) => {
      expect(Number(at.slice(11, 13))).toBeGreaterThanOrEqual(12);
      expect(Number(at.slice(11, 13))).toBeLessThanOrEqual(17);
    });
    expect(cycle(tidal, "conductivity").timing).toBe("about 50 minutes later each day");
    expect(cycle(tidal, "conductivity").peak_drift_minutes_per_day).toBeGreaterThan(30);
  });

  it("labels each series bucket with local solar time beside UTC", async () => {
    const bay = await week(BAY_MOUTH, "temperature");
    const first = (bay.series as Array<{ start: string; start_local_solar: string }>)[0];
    expect(bay.local_solar_offset_hours).toBe(-7.9);
    expect(Date.parse(`${first.start_local_solar}Z`) - Date.parse(first.start)).toBeCloseTo(-7.874 * HOUR, -5);
  });

  it("a steady channel with independent noise is in range, not a data issue (spike floor, 612adaa)", async () => {
    const conductivity = await week(STEADY_CHANNEL, "conductivity");
    expect((conductivity.verdict as Verdict).status).toBe("in range");
  });

  it("a probe the device flagged is excluded as faulted, never read as low oxygen", async () => {
    const oxygen = await week(PROBE_FAULT, "dissolved_oxygen");
    expect(oxygen.excluded_faulted as number).toBeGreaterThan(200);
    expect(oxygen.value).toBeNull();
    expect((oxygen.verdict as Verdict).status).not.toBe("out of range");
  });

  it("the dock pod's 4 hours out of the water are in the data as real out-of-range readings with no cause", async () => {
    const { start, end } = dockCleaningWindow(NOW);
    const result = await week(MARINA_DOCK);
    const m = metrics(result);
    expect(m.conductivity.verdict.status).toBe("out of range");
    const { flagged } = m.conductivity.verdict.out_of_range!;
    expect(Date.parse(flagged[0].from)).toBeGreaterThanOrEqual(start);
    expect(Date.parse(flagged[flagged.length - 1].to)).toBeLessThanOrEqual(end);
    expect(JSON.stringify(result)).not.toMatch(/clean|out of the water|maintenance/i);
  });
});

