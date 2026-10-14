import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { GenerateReport } from "../../src/tools/generateReport";
import { QuerySensorData } from "../../src/tools/querySensorData";
import { prepareReport } from "../../src/report/produceReport";
import type { ToolContext } from "../../src/types/tool.types";
import { routeDeviceApi } from "../fixtures/skepticism/fleet";
import { ALGALITA, algalitaMonth } from "../fixtures/algalita/month";

/**
 * The flagging rework (docs/timeline.md, 2026-10-13) end to end on a month shaped on the Algalita
 * Pod's real Sep 12 to Oct 13 (`../fixtures/algalita/month.ts`: recorded Sep 25-26, Sep 29-30 and
 * Oct 7, synthetic elsewhere), through the real sensor tool and report. Each case is one the
 * overview walks through (FLAGGING_OVERVIEW_2026-10-12.html §6), the customer's two questions, and
 * what the real month added: a flag straddling the 30 days' start, whole-board read failures, and
 * the conductivity drop of Sep 24.
 */
const CONTEXT: ToolContext = { token: "test-token" };
type Result = Record<string, unknown>;

const tools = () => {
  const fleet = algalitaMonth();
  const fetchImpl = async (url: string): Promise<Response> => {
    const body = routeDeviceApi(fleet, url.replace("https://example.invalid", ""));
    if (body === undefined) throw new Error(`not served: ${url}`);
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
  };
  const client = new DeviceApiClient({ baseUrl: "https://example.invalid/api/v1", token: "test-token", fetchImpl });
  const sensor = new QuerySensorData({ client, now: () => fleet.now });
  return {
    sensor,
    query: (args: Result) => sensor.run({ device: ALGALITA, ...args }, CONTEXT) as Promise<Result>,
    report: (args: Result) => new GenerateReport({ sensor }).run({ device: ALGALITA, ...args }, CONTEXT) as Promise<Result>,
  };
};

type Verdict = {
  status: string;
  out_of_range?: { direction: string; flagged: Array<Record<string, unknown>>; current: boolean };
  at_edge?: Record<string, unknown>;
  unusual_readings?: number;
  unusual_listed?: Array<{ at: string; value: number; why?: string; previous?: number }>;
  unusual_stretches?: Array<{ from: string; to: string; lowest: number; highest: number }>;
  data_issue?: unknown[];
};
const verdictOf = (result: Result): Verdict => result.verdict as Verdict;
const r2 = (value: number): number => Math.round(value * 100) / 100;
const FAULT_WORDS = /fault|malfunction|faulty|broken|error|not real|impossible/i;

describe("Algalita: the customer's Sep 26 question", () => {
  it("lists the drop from 7.19 to 2.73 with its time, as unusual, never as a fault", async () => {
    const day = await tools().query({ metric: "ph", time_range: "2026-09-26", aggregation: "min" });
    expect(day.value).toBeCloseTo(6.36, 2); // UTC day; the 17:56 PDT drop is on Sep 27 UTC
    const month = await tools().query({ metric: "ph", time_range: "last 30 days", aggregation: "min" });
    expect(month.value).toBe(2.3); // Sep 27's 2.3, kept in the minimum (decision 1)
    const verdict = verdictOf(month);
    const listed = (value: number) => verdict.unusual_listed!.find((u) => r2(u.value) === value);
    expect(listed(2.73)).toMatchObject({ at: "2026-09-27T00:56:00.000Z" });
    expect(r2(listed(2.73)!.previous!)).toBe(7.19);
    expect(listed(6.36)).toMatchObject({ why: "a sudden jump from the previous reading" });
    expect(r2(listed(6.36)!.previous!)).toBe(11.21);
    expect(JSON.stringify(verdict.unusual_listed)).not.toMatch(FAULT_WORDS);
  });

  it("flags Sep 13 low, Sep 26 high and Sep 27-29 low, all in the past", async () => {
    const verdict = verdictOf(await tools().query({ metric: "ph", time_range: "last 30 days", aggregation: "mean" }));
    expect(verdict.status).toBe("out of range");
    expect(verdict.out_of_range).toMatchObject({
      direction: "high and low",
      current: false,
      flagged: [
        // Two readings in the 30 days and one the night before: three in 24 hours.
        { direction: "low", from: "2026-09-13T20:00:00.000Z", to: "2026-09-13T22:00:00.000Z" },
        { direction: "high", from: "2026-09-26T11:26:00.000Z", to: "2026-09-26T17:26:00.000Z" },
        { direction: "low", from: "2026-09-27T01:56:00.000Z", to: "2026-09-30T00:00:00.000Z" },
      ],
    });
    expect(verdict.out_of_range!.flagged.map((f) => r2((f.lowest ?? f.highest) as number)))
      .toEqual([5.2, 11.92, 3.42]);
    // The readings above 12 and the drops below 3 are unusual stretches, mentioned, never counted.
    expect(verdict.unusual_stretches!.map((s) => [s.from, r2(s.lowest), r2(s.highest)])).toEqual([
      ["2026-09-26T02:26:00.000Z", 2.73, 12.91],
      ["2026-09-27T17:30:00.000Z", 2.3, 2.5],
    ]);
  });

  it("calls a past day's flag past, even asked about that day alone", async () => {
    const verdict = verdictOf(await tools().query({ metric: "ph", time_range: "2026-09-26", aggregation: "mean" }));
    expect(verdict.out_of_range?.current).toBe(false);
  });
});

describe("Algalita: Michael's Oct 7 three readings above 10", () => {
  it("stays quiet: no flag, no stretch, two jumps listed only if asked", async () => {
    const verdict = verdictOf(await tools().query({ metric: "ph", time_range: "2026-10-07", aggregation: "max" }));
    expect(verdict.status).toBe("in range");
    expect(verdict).not.toHaveProperty("out_of_range");
    expect(verdict).not.toHaveProperty("unusual_stretches");
    expect(verdict.unusual_listed!.map((u) => r2(u.value))).toEqual([10.94, 8.41]);
  });
});

describe("Algalita: Michael's afternoon dips to about 6 (Oct 3-9)", () => {
  it("is mentioned as sitting at the low edge, never flagged", async () => {
    const verdict = verdictOf(await tools().query({ metric: "ph", time_range: "2026-10-03 to 2026-10-09", aggregation: "mean" }));
    expect(verdict.status).toBe("in range");
    expect(verdict.at_edge).toMatchObject({ side: "low edge", shape: "on 6 of 7 days" });
  });

  it("drops the mention once the dips are under half the window's days", async () => {
    // Oct 6-13: the dips stopped after Oct 9.
    const verdict = verdictOf(await tools().query({ metric: "ph", time_range: "last 7 days", aggregation: "mean" }));
    expect(verdict.status).toBe("in range");
    expect(verdict).not.toHaveProperty("at_edge");
  });

  it("reports the Oct 8 whole-board read failures beside the verdict, never instead of it", async () => {
    // 15:00, 15:30 and 16:00 PDT: every probe flagged its own reading.
    const verdict = verdictOf(await tools().query({ metric: "ph", time_range: "2026-10-03 to 2026-10-09", aggregation: "mean" }));
    expect(verdict.data_issue).toEqual([
      { from: "2026-10-08T22:00:00.000Z", to: "2026-10-08T23:00:00.000Z", readings: 3 },
    ]);
  });
});

describe("Algalita: the customer's 30-day report", () => {
  it("is Watch, not Action Required, with the flags told as past", async () => {
    const t = tools();
    const report = await t.report({ time_range: "last 30 days" });
    expect(report.status).toBe("Watch");
    expect(report.status_reason).toMatch(/^Watch because a parameter was flagged/);
    expect(report.parameter_flags).toMatchObject({
      ph: "Elevated", dissolved_oxygen: "Normal", orp: "Normal", conductivity: "Low",
    });
    expect(report.flag_detail).toMatchObject({ ph: { current: false }, conductivity: { current: false } });
    expect(JSON.stringify(report.status_reason)).not.toMatch(FAULT_WORDS);

    const prepared = await prepareReport(t.sensor, { timeRange: "last 30 days", device: ALGALITA }, CONTEXT);
    if (prepared.error !== undefined) throw new Error(prepared.error);
    const { narrative } = prepared;
    const ph = narrative.parameterAnalysis.get("pH")!;
    expect(ph).toContain("That has since cleared");
    expect(ph).toContain("Some readings were very unusual for this water");
    expect(ph).toContain("a calibration check would confirm them");
    expect(ph).not.toMatch(FAULT_WORDS);
    expect(narrative.summaryBullets.join(" ")).toContain("each flag had cleared by the end of the period");
    // Device-reported faults only: turbidity stuck at 0 (F13) and the Oct 8 whole-board failures.
    expect(prepared.report.dataQuality?.likelyDataIssue).toEqual(
      expect.arrayContaining(["Turbidity (Relative)", "All sensors at once"]),
    );
    // Events come from the flagged windows, and name no cause the other channels do not support.
    prepared.report.events
      .forEach((e) => expect(["Inconclusive", "Anomaly, cause unclear"]).toContain(e.type));
  });

  it("names the same flags as the chat answer, including the one straddling the period's start", async () => {
    const t = tools();
    const chat = verdictOf(await t.query({ metric: "ph", time_range: "last 30 days", aggregation: "mean" }));
    const report = await t.report({ time_range: "last 30 days" });
    const detail = report.flag_detail as { ph: { flagged: Array<{ from: string }> } };
    expect(detail.ph.flagged.map((f) => f.from)).toEqual(chat.out_of_range!.flagged.map((f) => f.from));
    expect(detail.ph.flagged[0].from).toBe("2026-09-13T20:00:00.000Z");
  });

  it("keeps a past period's flags out of Action Required", async () => {
    const t = tools();
    const prepared = await prepareReport(t.sensor, { timeRange: "2026-09-21 to 2026-09-28", device: ALGALITA }, CONTEXT);
    if (prepared.error !== undefined) throw new Error(prepared.error);
    // A past period: the pod reported after it ended, so nothing in it is current.
    expect(prepared.status).toBe("Watch");
  });
});
