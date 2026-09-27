import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { QuerySensorData } from "../../src/tools/querySensorData";
import { buildReportInput } from "../../src/report/buildReportInput";
import { ListPods } from "../../src/tools/listPods";
import { GenerateReport } from "../../src/tools/generateReport";
import { flagCellText } from "../../src/report/renderPdf";
import { probeAccuracy } from "../../src/report/referenceRanges";
import { prepareReport, renderReportPdf } from "../../src/report/produceReport";
import { GetPodThresholds } from "../../src/tools/getPodThresholds";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const row = (hour: number, lat: number | null, ph = 8, turbidity = 20) => ({
  timestamp: NOW / 1000 - (24 - hour) * 3600,
  best_lat: lat, best_lon: lat === null ? null : -82,
  best_location: "Same free text for all sites",
  water_data: { 99: ph, 72: turbidity, phError: 0, turbError: 0 },
});
const sensorFor = (
  rows: ReturnType<typeof row>[], thresholds = {}, history: ReturnType<typeof row>[] = [],
) => new QuerySensorData({
  defaultDeviceLabel: "dev:pod",
  now: () => NOW,
  client: new DeviceApiClient({ baseUrl: "https://offline.invalid", token: "fixture",
    fetchImpl: async (url) => ({ ok: true, status: 200,
      json: async () => (url.includes("/devices")
        ? [{ id: "pod", data: { name: "Pod", label: "dev:pod", thresholds,
          organization: "org", ...(history.length ? { labels: ["dev:old"] } : {}),
        } }, ...(history.length ? [{ id: "old", data: {
          name: "Old", label: "dev:old", organization: "org", mergedInto: "dev:pod",
        } }] : [])]
        : url.includes("/water/last/") ? { data: rows[rows.length - 1] }
          : new URL(url).searchParams.get("device") === "dev:old" ? history : rows),
    } as Response),
  }),
});

describe("current-site tool and report pipeline", () => {
  it("excludes the old site's values before aggregation and report building", async () => {
    const sensor = sensorFor([row(1, 35, 2), row(2, 41, 8), row(3, 41, 9)]);
    const result = await sensor.run({ metric: "ph", time_range: "last 7 days", aggregation: "min" });
    expect(result.value).toBe(8);
    expect(result.note).toMatch(/1 reading.*earlier location.*excluded/i);
    const built = await buildReportInput(sensor, { timeRange: "last 7 days" });
    expect(built.report?.parameters.find((p) => p.baseline.key === "ph")?.min).toBe(8);
    expect(built.report?.dataQuality?.completenessNotes).toMatch(/earlier location.*excluded/i);
  });

  it("excludes sustained endpoint runs before report patterns", async () => {
    const sensor = sensorFor([...Array.from({ length: 25 }, (_, i) => row(i - 2, 41, 8, 1005)), row(23, 41, 8, 25)]);
    const result = await sensor.run({ metric: "turbidity", time_range: "last 7 days", aggregation: "max" });
    expect(result.value).toBe(25);
    expect(result.note).toMatch(/likely failed sensor/i);
    const built = await buildReportInput(sensor, { timeRange: "last 7 days" });
    expect(built.report?.parameters.find((p) => p.baseline.key === "turbidity")?.max).toBe(25);
    expect(built.report?.dataQuality?.calibrationNotes).toMatch(/likely failed sensor/i);
  });

  it("labels over-wide limits not assessed", async () => {
    const sensor = sensorFor([row(1, 41), row(2, 41)], { minPH: 0, maxPH: 100 });
    const result = await new GetPodThresholds({ sensor }).run({});
    expect((result.thresholds as Record<string, { status: string }>).ph.status).toBe("not assessed");
    const built = await buildReportInput(sensor, { timeRange: "last 7 days" });
    expect(built.report?.parameters.find((p) => p.baseline.key === "ph")?.baseline.baselineNote)
      .toMatch(/not assessed/i);
  });
});


describe("release surfaces", () => {
  it("filters merged-chain history before every aggregation, including comparisons", async () => {
    const sensor = sensorFor([row(4, 41, 8), row(5, 41, 9)], {},
      [row(1, 35, 2), row(2, 39, 3), row(3, 39, 4)]);
    for (const aggregation of ["min", "max", "mean", "median", "latest", "earliest", "raw", "series"]) {
      const result = await sensor.run({ metric: "ph", time_range: "last year", aggregation });
      expect(result.n_samples).toBe(2);
      expect(result.note).toMatch(/3 reading.*earlier location.*excluded/i);
      expect(JSON.stringify(result)).not.toContain('"value":2');
    }
    const oldRange = await sensor.run({ metric: "ph", time_range: "2026-09-01 to 2026-09-24", aggregation: "min" });
    expect(oldRange.value).toBeNull();
  });

  it("gives list_pods the same site exclusion and sensor-failure notes", async () => {
    const sensor = sensorFor([row(-25, 35, 2), ...Array.from({ length: 25 }, (_, i) => row(i - 24, 41, 8, 0))]);
    const result = await new ListPods({ sensor }).run({});
    const pod = (result.pods as Array<{ note: string; last_reported: string }>)[0];
    expect(pod.note).toMatch(/earlier location.*excluded/i);
    expect(pod.note).toMatch(/likely failed sensor/i);
    expect(pod.last_reported).toBe(new Date(row(0, 41).timestamp * 1000).toISOString());
  });

  it("renders a report and preserves exclusions in generate_report without model calls", async () => {
    const sensor = sensorFor([row(-25, 35, 2),
      ...Array.from({ length: 25 }, (_, i) => row(i - 24, 41, 8, 1005))], { minPH: 0, maxPH: 100 });
    const prepared = await prepareReport(sensor, { timeRange: "last 7 days" });
    if (prepared.error || !("report" in prepared)) throw new Error(prepared.error);
    expect(prepared.report.parameters.map((p) => p.baseline.key)).toEqual(["ph"]);
    expect(flagCellText(prepared.report.parameters[0], probeAccuracy)).toBe("Not assessed");
    expect([...prepared.narrative.parameterAnalysis.values()].join(" ")).toMatch(/not assessed/i);
    const pdf = await renderReportPdf(prepared);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const result = await new GenerateReport({ sensor }).run({ time_range: "last 7 days" }, { token: "fixture" });
    expect(result.note).toMatch(/earlier location.*excluded/i);
    expect(result.note).toMatch(/likely failed sensor/i);
    expect(result.parameter_flags).toMatchObject({ ph: "Not assessed" });
  });

  it("refuses an all-unpositioned window and does not invent a site's values", async () => {
    const sensor = sensorFor([row(1, null, 2), row(2, null, 3)]);
    const result = await sensor.run({ metric: "all", time_range: "last year", aggregation: "mean" });
    expect(result.note).toContain("Current site not assessed");
    expect((await buildReportInput(sensor, { timeRange: "last year" })).report).toBeUndefined();
  });
});
