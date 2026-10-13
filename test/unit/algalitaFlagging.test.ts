import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { GenerateReport } from "../../src/tools/generateReport";
import { QuerySensorData } from "../../src/tools/querySensorData";
import { prepareReport } from "../../src/report/produceReport";
import type { ToolContext } from "../../src/types/tool.types";
import { routeDeviceApi } from "../fixtures/skepticism/fleet";
import { ALGALITA, algalitaMonth } from "../fixtures/algalita/month";

/**
 * The flagging rework (docs/timeline.md, 2026-10-13) end to end on a month shaped on the Algalita
 * Pod (`../fixtures/algalita/month.ts`: recorded Sep 25-26, Sep 29-30 and Oct 7, synthetic
 * between), through the real sensor tool and report. Each case is one the overview walks
 * through (FLAGGING_OVERVIEW_2026-10-12.html §6), and the customer's two questions.
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
const FAULT_WORDS = /fault|malfunction|faulty|broken|error|not real|impossible/i;

describe("Algalita: the customer's Sep 26 question", () => {
  it("lists the drop from 7.19 to 2.73 with its time, as unusual, never as a fault", async () => {
    const day = await tools().query({ metric: "ph", time_range: "2026-09-26", aggregation: "min" });
    expect(day.value).toBe(6.36); // UTC day; the 17:56 PDT drop is on Sep 27 UTC
    const evening = await tools().query({ metric: "ph", time_range: "last 30 days", aggregation: "min" });
    expect(evening.value).toBe(2.73); // kept in the minimum (decision 1)
    const verdict = verdictOf(evening);
    const drop = verdict.unusual_listed!.find((u) => u.value === 2.73);
    expect(drop).toMatchObject({ at: "2026-09-27T00:56:00.000Z", previous: 7.19 });
    expect(verdict.unusual_listed!.find((u) => u.value === 6.36)).toMatchObject({
      why: "a sudden jump from the previous reading", previous: 11.21,
    });
    expect(verdict).not.toHaveProperty("data_issue");
    expect(JSON.stringify(verdict)).not.toMatch(FAULT_WORDS);
  });

  it("flags Sep 26 high and Sep 27-29 low, both in the past", async () => {
    const verdict = verdictOf(await tools().query({ metric: "ph", time_range: "last 30 days", aggregation: "mean" }));
    expect(verdict.status).toBe("out of range");
    expect(verdict.out_of_range).toMatchObject({
      direction: "high and low",
      current: false,
      flagged: [
        { direction: "high", from: "2026-09-26T11:26:00.000Z", to: "2026-09-26T17:26:00.000Z", highest: 11.92 },
        { direction: "low", from: "2026-09-27T01:56:00.000Z", lowest: expect.any(Number) },
      ],
    });
    // The readings above 12 and the drop are one unusual stretch, mentioned, never counted.
    expect(verdict.unusual_stretches).toEqual([expect.objectContaining({
      from: "2026-09-26T02:26:00.000Z", lowest: 2.73, highest: 12.91,
    })]);
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
    expect(verdict.unusual_listed!.map((u) => u.value)).toEqual([10.94, 8.41]);
  });
});

describe("Algalita: Michael's afternoon dips to about 6 (his 10-09 pod)", () => {
  it("is mentioned as sitting at the low edge, never flagged", async () => {
    const verdict = verdictOf(await tools().query({ metric: "ph", time_range: "last 7 days", aggregation: "mean" }));
    expect(verdict.status).toBe("in range");
    expect(verdict.at_edge).toMatchObject({ side: "low edge", shape: "on 7 of 7 days" });
  });
});

describe("Algalita: the customer's 30-day report", () => {
  it("is Watch, not Action Required, with the pH flags told as past", async () => {
    const t = tools();
    const report = await t.report({ time_range: "last 30 days" });
    expect(report.status).toBe("Watch");
    expect(report.status_reason).toMatch(/^Watch because a parameter was flagged/);
    expect(report.parameter_flags).toMatchObject({
      ph: "Elevated", dissolved_oxygen: "Normal", orp: "Normal", conductivity: "Normal",
    });
    expect(report.flag_detail).toMatchObject({ ph: { current: false } });
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
    // Turbidity stuck at 0 all month is the one device-reported data issue (F13).
    expect(prepared.report.dataQuality?.likelyDataIssue).toEqual(["Turbidity (Relative)"]);
    // Events come from the flagged windows, and name no cause the other channels do not support.
    prepared.report.events
      .forEach((e) => expect(["Inconclusive", "Anomaly, cause unclear"]).toContain(e.type));
  });

  it("keeps a past period's flags out of Action Required", async () => {
    const t = tools();
    const prepared = await prepareReport(t.sensor, { timeRange: "2026-09-21 to 2026-09-28", device: ALGALITA }, CONTEXT);
    if (prepared.error !== undefined) throw new Error(prepared.error);
    // A past period: the pod reported after it ended, so nothing in it is current.
    expect(prepared.status).toBe("Watch");
  });
});
