import fs from "fs";
import path from "path";
import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { QuerySensorData } from "../../src/tools/querySensorData";
import { buildReportInput } from "../../src/report/buildReportInput";
import { flagFor } from "../../src/report/types";
import { probeAccuracy } from "../../src/report/referenceRanges";
import type { DeviceSummary } from "../../src/types/device.types";

/**
 * buildReportInput.ts is the only place in src/report/ that talks to QuerySensorData -- these
 * tests exercise it against the same recorded device-api fixtures querySensorData.test.ts uses,
 * offline throughout, so a regression in how report generation reads sensor data (not just in
 * the report math downstream) would fail here too.
 */

const FIXTURES = path.join(__dirname, "../fixtures/device-api");
const load = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

const DEVICES = load("devices.json");
const ALGALITA_PERIOD = load("algalita-period-1-day.json") as Array<Record<string, unknown>>;
const OWC_PERIOD_DAY = load("owc-period-1-day.json");
const OWC_LAST = load("owc-last.json") as { data: Record<string, unknown> };

const OWC = "dev:351077454567580";
const NOW = Date.parse("2026-08-13T12:00:00.000Z");

const ALGALITA_LAST = (() => {
  const newest = [...ALGALITA_PERIOD]
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0];
  const water = newest.water_data as Record<string, number>;
  return {
    id: "algalita-last",
    data: { ...newest, water_data: { ...water, 102: water[102] * (9 / 5) + 32 } },
  };
})();

const makeSensor = (
  overrides: Partial<Record<"devices" | "periodDay" | "periodWeek" | "periodMonth" | "last", unknown>> = {},
): QuerySensorData => {
  const fetchImpl = async (url: string): Promise<Response> => {
    const body = ((): unknown => {
      if (url.includes("/devices")) {
        return overrides.devices ?? DEVICES;
      }
      if (url.includes("/water/last/")) {
        if (overrides.last !== undefined) return overrides.last;
        return url.includes(encodeURIComponent(OWC)) ? OWC_LAST : ALGALITA_LAST;
      }
      if (url.includes("/water/period/")) {
        const forOwc = url.includes(encodeURIComponent(OWC));
        if (url.includes("/1/week")) return overrides.periodWeek ?? (forOwc ? OWC_PERIOD_DAY : ALGALITA_PERIOD);
        if (url.includes("/1/month")) return overrides.periodMonth ?? (forOwc ? OWC_PERIOD_DAY : ALGALITA_PERIOD);
        return overrides.periodDay ?? (forOwc ? OWC_PERIOD_DAY : ALGALITA_PERIOD);
      }
      return {};
    })();
    return {
      ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body),
    } as unknown as Response;
  };

  const client = new DeviceApiClient({ baseUrl: "https://example.invalid/api/v1", token: "test-token", fetchImpl });
  return new QuerySensorData({
    client, now: () => NOW, rawLimit: 200, waterType: "saltwater",
  });
};

describe("buildReportInput", () => {
  it("builds a ReportInput covering every parameter with real readings", async () => {
    const sensor = makeSensor();
    const { report, error, skippedParameters } = await buildReportInput(
      sensor, { timeRange: "last day", device: "Algalita" },
    );

    expect(error).toBeUndefined();
    expect(skippedParameters).toBeUndefined();
    expect(report).toBeDefined();
    expect(report!.site.siteName).toContain("Algalita");
    expect(report!.parameters).toHaveLength(6);
  });

  it("labels temperature in the unit the device API actually returns (°F, not °C)", async () => {
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    const temp = report!.parameters.find((p) => p.baseline.key === "temperature");
    expect(temp).toBeDefined();
    expect(temp!.baseline.unit).toBe("°F");
    expect(temp!.baseline.label).toContain("°F");
  });

  /**
   * Temperature's baseline is the one that does not come from the source-of-truth table -- that
   * document gives it no fixed range on purpose and asks for a site-specific baseline instead.
   * The site-specific baseline is the operator's `minTemperature`/`maxTemperature` on the device
   * registry document, validated by operatorThresholds.ts before it is believed.
   *
   * The failure being guarded against is concrete: two live devices carry all ten thresholds as
   * "0", and a report that read them naively would print "72 °F is outside the acceptable range
   * of 0-0" in a customer-facing PDF.
   */
  describe("temperature baseline", () => {
    /** A registry row in DeviceSummary's shape, with only the fields this path reads. */
    const registryRow = (thresholds?: Record<string, string | number>): DeviceSummary => ({
      id: "doc-id",
      name: "Stub Pod",
      label: "dev:stub",
      ...(thresholds ? { thresholds } : {}),
      raw: {},
    });

    /** Minimal sensor with one temperature series and a registry row of the caller's choosing. */
    const sensorWithThresholds = (thresholds?: Record<string, string | number>): QuerySensorData => ({
      query: async () => ({
        device: { name: "Stub Pod", label: "dev:stub", operating_environment: "salt-water" },
        time_range_resolved: { start: "2026-08-01T00:00:00.000Z", end: "2026-08-08T00:00:00.000Z" },
        metrics: {
          temperature: {
            value: 68,
            n_samples: 40,
            series: [
              { start: "2026-08-01T00:00:00.000Z", end: "2026-08-01T12:00:00.000Z", mean: 66, min: 64, max: 68, n: 20 },
              { start: "2026-08-02T00:00:00.000Z", end: "2026-08-02T12:00:00.000Z", mean: 70, min: 68, max: 72, n: 20 },
            ],
          },
        },
      }),
      deviceRecord: async () => registryRow(thresholds),
    } as unknown as QuerySensorData);

    const temperatureOf = async (thresholds?: Record<string, string | number>) => {
      const { report } = await buildReportInput(
        sensorWithThresholds(thresholds), { timeRange: "last week" },
      );
      return report!.parameters.find((p) => p.baseline.key === "temperature")!;
    };

    it("uses the device's operator-set threshold, cast from the registry's strings", async () => {
      // Values arrive as strings ("50"/"80"), which is how the backend's own seed script stores
      // them -- the report must end up with numbers, not string-compared text.
      const temp = await temperatureOf({ minTemperature: "50", maxTemperature: "80" });

      expect(temp.baseline.hasFixedBaseline).toBe(true);
      expect(temp.baseline.baselineMin).toBe(50);
      expect(temp.baseline.baselineMax).toBe(80);
      expect(typeof temp.baseline.baselineMin).toBe("number");
      expect(typeof temp.baseline.baselineMax).toBe("number");
    });

    it("marks the baseline's provenance as the operator threshold, not the reference table", async () => {
      const temp = await temperatureOf({ minTemperature: "50", maxTemperature: "80" });

      expect(temp.baseline.baselineSource).toBe("operator-threshold");
      expect(temp.baseline.baselineNote).toContain("Operator-set threshold for this device");
    });

    it("takes every non-turbidity parameter's baseline from this device's own registry threshold", async () => {
      // The reference table (BASELINE_RANGES) is gone -- vetoed in full by the project
      // supervisor, 2026-09-13 (docs/timeline.md). All five numeric metrics, not just
      // temperature, now take their baseline from operatorThresholds.ts's metricThreshold.
      //
      // The recorded /devices fixture's Algalita Pod row matches the brief's live registry
      // table exactly: pH 6-10, DO 4-15, ORP 50-400, conductivity 40000-75000, temp 50-80.
      //
      // Turbidity is excluded: it has no numeric baseline at all (a qualitative clarity band)
      // and no device carries a turbidity threshold -- asserted separately below.
      const sensor = makeSensor();
      const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

      report!.parameters
        .filter((p) => p.baseline.key !== "turbidity")
        .forEach((p) => expect(p.baseline.baselineSource).toBe("operator-threshold"));

      const ph = report!.parameters.find((p) => p.baseline.key === "ph")!;
      expect(ph.baseline.baselineMin).toBe(6);
      expect(ph.baseline.baselineMax).toBe(10);

      const dissolvedOxygen = report!.parameters.find((p) => p.baseline.key === "dissolved_oxygen")!;
      expect(dissolvedOxygen.baseline.baselineMin).toBe(4);
      expect(dissolvedOxygen.baseline.baselineMax).toBe(15);

      const orp = report!.parameters.find((p) => p.baseline.key === "orp")!;
      expect(orp.baseline.baselineMin).toBe(50);
      expect(orp.baseline.baselineMax).toBe(400);

      const conductivity = report!.parameters.find((p) => p.baseline.key === "conductivity")!;
      expect(conductivity.baseline.baselineMin).toBe(40_000);
      expect(conductivity.baseline.baselineMax).toBe(75_000);

      const turbidity = report!.parameters.find((p) => p.baseline.key === "turbidity")!;
      expect(turbidity.baseline.scale).toBe("relative-index");
      expect(turbidity.baseline.hasFixedBaseline).toBe(false);
      expect(turbidity.baseline.baselineSource).toBeUndefined();
    });

    it("rejects a bad threshold for one metric while the other four still resolve normally", async () => {
      // A registry row can have one placeholder field (maxPH=100, the CER Conference Pod's real
      // value) without the rest of the row being junk. pH alone should fall back to no baseline,
      // with a rejection note -- everything else on this device keeps its own threshold.
      const sensor = makeSensor({
        devices: [{
          id: "bad-ph-pod",
          data: {
            name: "Algalita Pod",
            operatingEnvironment: "salt-water",
            label: "dev:351077454569099",
            thresholds: {
              minPH: "0", maxPH: "100",
              minORP: "50", maxORP: "400",
              minDissolvedOxygen: "4", maxDissolvedOxygen: "15",
              minConductivity: "40000", maxConductivity: "75000",
              minTemperature: "50", maxTemperature: "80",
            },
          },
        }],
      });
      const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

      const ph = report!.parameters.find((p) => p.baseline.key === "ph")!;
      expect(ph.baseline.hasFixedBaseline).toBe(false);
      expect(ph.baseline.baselineSource).toBeUndefined();
      expect(ph.baseline.baselineNote).toContain("pH");

      const orp = report!.parameters.find((p) => p.baseline.key === "orp")!;
      expect(orp.baseline.hasFixedBaseline).toBe(true);
      expect(orp.baseline.baselineMin).toBe(50);
      expect(orp.baseline.baselineMax).toBe(400);
    });

    describe("blind-spot note: a limit at the probe's own physical floor or ceiling", () => {
      // Old Woman Creek 2026's real registry row (docs/timeline.md's live-fleet table,
      // 2026-09-13). Built the same way `sensorWithThresholds` builds temperature-only fixtures
      // above -- a hand-rolled series per metric -- rather than through the recorded /devices
      // fixture, because that fixture's OWC period-day data is deliberately empty (it backs the
      // "no readings in the window" test) and would make every parameter here skip instead of
      // exercising the baseline path.
      const OWC_THRESHOLDS = {
        minPH: "0", maxPH: "10",
        minORP: "0", maxORP: "800",
        minDissolvedOxygen: "0", maxDissolvedOxygen: "12",
        minConductivity: "0", maxConductivity: "100000",
        minTemperature: "30", maxTemperature: "100",
      };

      const seriesFor = (mean: number, min: number, max: number) => ([
        { start: "2026-08-01T00:00:00.000Z", end: "2026-08-01T12:00:00.000Z", mean, min, max, n: 20 },
        { start: "2026-08-02T00:00:00.000Z", end: "2026-08-02T12:00:00.000Z", mean, min, max, n: 20 },
      ]);

      const owcSensor = (): QuerySensorData => ({
        query: async () => ({
          device: { name: "Old Woman Creek 2026", label: "dev:owc", operating_environment: "fresh-water" },
          time_range_resolved: { start: "2026-08-01T00:00:00.000Z", end: "2026-08-08T00:00:00.000Z" },
          metrics: {
            dissolved_oxygen: { value: 8, n_samples: 40, series: seriesFor(8, 6, 10) },
            orp: { value: 300, n_samples: 40, series: seriesFor(300, 250, 350) },
          },
        }),
        deviceRecord: async () => registryRow(OWC_THRESHOLDS),
      } as unknown as QuerySensorData);

      it("notes dissolved oxygen 0-12 as a blind spot -- 0 is the probe's own floor, so a "
        + "low-DO excursion can never be detected", async () => {
        const { report } = await buildReportInput(owcSensor(), { timeRange: "last week" });
        const dissolvedOxygen = report!.parameters.find((p) => p.baseline.key === "dissolved_oxygen")!;

        expect(dissolvedOxygen.baseline.hasFixedBaseline).toBe(true);
        expect(dissolvedOxygen.baseline.baselineMin).toBe(0);
        expect(dissolvedOxygen.baseline.baselineNote).toContain("below");
        expect(dissolvedOxygen.baseline.baselineNote).toContain("cannot be detected");
      });

      it("does NOT note ORP 0-800 as a blind spot -- ORP's floor is -2000 mV, nowhere near 0", async () => {
        const { report } = await buildReportInput(owcSensor(), { timeRange: "last week" });
        const orp = report!.parameters.find((p) => p.baseline.key === "orp")!;

        expect(orp.baseline.hasFixedBaseline).toBe(true);
        expect(orp.baseline.baselineMin).toBe(0);
        expect(orp.baseline.baselineNote).toBeUndefined();
      });
    });

    it("reads the real recorded registry fixture, not just a hand-built row", async () => {
      // devices.json is a recorded /devices body: the Algalita Pod rows carry
      // minTemperature "50" / maxTemperature "80".
      const sensor = makeSensor();
      const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

      const temp = report!.parameters.find((p) => p.baseline.key === "temperature")!;
      expect(temp.baseline.baselineMin).toBe(50);
      expect(temp.baseline.baselineMax).toBe(80);
      expect(temp.baseline.baselineSource).toBe("operator-threshold");
    });

    describe("falls back to no baseline rather than a bogus range", () => {
      const expectNoBaseline = (temp: { baseline: { hasFixedBaseline: boolean; baselineSource?: string; baselineNote?: string } }) => {
        expect(temp.baseline.hasFixedBaseline).toBe(false);
        expect(temp.baseline.baselineSource).toBeUndefined();
        // Says why, so the reader knows to go fix the registry rather than the probe.
        expect(temp.baseline.baselineNote).toContain("registry");
      };

      it("when the device carries all-zero thresholds", async () => {
        // Trinidad Island DataPod™ and dev:860322068098448, live. min === max is the registry's
        // unconfigured state -- treating it as a range makes every reading an exceedance.
        const temp = await temperatureOf({
          minTemperature: "0", maxTemperature: "0", minPH: "0", maxPH: "0",
        });

        expectNoBaseline(temp);
        expect(temp.baseline.baselineNote).toContain("identical minimum and maximum");
      });

      it("when min is greater than max", async () => {
        const temp = await temperatureOf({ minTemperature: "95", maxTemperature: "40" });

        expectNoBaseline(temp);
        expect(temp.baseline.baselineNote).toContain("minimum above the maximum");
      });

      it("when the values are placeholders outside the sanity rail", async () => {
        const temp = await temperatureOf({ minTemperature: "0", maxTemperature: "100000" });

        expectNoBaseline(temp);
        expect(temp.baseline.baselineNote).toContain("natural surface water");
      });

      it("when the device has no thresholds field at all", async () => {
        const temp = await temperatureOf(undefined);

        expectNoBaseline(temp);
        expect(temp.baseline.baselineNote).toContain("No operator thresholds are configured");
      });

      it("when the registry lookup itself comes back empty", async () => {
        const sensor = {
          query: (sensorWithThresholds() as unknown as { query: unknown }).query,
          deviceRecord: async () => null,
        } as unknown as QuerySensorData;
        const { report } = await buildReportInput(sensor, { timeRange: "last week" });
        const temp = report!.parameters.find((p) => p.baseline.key === "temperature")!;

        expectNoBaseline(temp);
        // A registry lookup that finds nothing must not fail the whole report -- the readings
        // are still real, even though every numeric metric on this device now has no baseline.
        expect(report!.parameters.length).toBeGreaterThan(0);
        // Distinct from "not configured": `deviceRecord() === null` means the lookup itself
        // failed (unresolvable device, network or auth error), not that the row was read and
        // found empty. Reporting "not configured" here would send an operator to fix a
        // configuration that was never actually read during an outage.
        expect(temp.baseline.baselineNote).toContain("could not be read");
        expect(temp.baseline.baselineNote).not.toContain("No operator thresholds are configured");
      });

      it("gives every numeric metric, not just temperature, the 'could not be read' note when "
        + "deviceRecord() returns null", async () => {
        const seriesFor = (mean: number, min: number, max: number) => ([
          { start: "2026-08-01T00:00:00.000Z", end: "2026-08-01T12:00:00.000Z", mean, min, max, n: 20 },
        ]);
        const stubSensor = {
          query: async () => ({
            device: { name: "Stub Pod", label: "dev:stub", operating_environment: "salt-water" },
            time_range_resolved: { start: "2026-08-01T00:00:00.000Z", end: "2026-08-08T00:00:00.000Z" },
            metrics: {
              temperature: { value: 68, n_samples: 20, series: seriesFor(68, 64, 72) },
              ph: { value: 7.2, n_samples: 20, series: seriesFor(7.2, 7.0, 7.4) },
              dissolved_oxygen: { value: 8, n_samples: 20, series: seriesFor(8, 6, 10) },
              orp: { value: 300, n_samples: 20, series: seriesFor(300, 250, 350) },
              conductivity: { value: 50_000, n_samples: 20, series: seriesFor(50_000, 48_000, 52_000) },
              turbidity: { value: 100, n_samples: 20, series: seriesFor(100, 80, 120) },
            },
          }),
          deviceRecord: async () => null,
        } as unknown as QuerySensorData;

        const { report } = await buildReportInput(stubSensor, { timeRange: "last week" });

        report!.parameters
          .filter((p) => p.baseline.key !== "turbidity")
          .forEach((p) => {
            expect(p.baseline.hasFixedBaseline).toBe(false);
            expect(p.baseline.baselineNote).toContain("could not be read");
          });
      });

      it("keeps the existing 'not configured' wording when the record resolves with no thresholds "
        + "object -- distinct from a failed lookup", async () => {
        // registryRow(undefined) -- a real record, just with no `thresholds` field -- must not be
        // confused with `deviceRecord()` returning `null` outright.
        const temp = await temperatureOf(undefined);

        expectNoBaseline(temp);
        expect(temp.baseline.baselineNote).toContain("No operator thresholds are configured");
        expect(temp.baseline.baselineNote).not.toContain("could not be read");
      });

      it("never lets the internal 0-0 placeholder reach a printed flag", async () => {
        // flagFor short-circuits on hasFixedBaseline, so a 72 °F reading against the placeholder
        // zeros must read "N/A", never "Exceedance".
        const temp = await temperatureOf({ minTemperature: "0", maxTemperature: "0" });

        expect(flagFor(temp, probeAccuracy)).toBe("N/A");
      });
    });

    it("resolves the registry row by the label the query settled on, not the caller's string", async () => {
      // A fuzzy device name ("Algalita") must not risk attaching another pod's thresholds to
      // these readings -- the exact dev: label the query resolved is what gets looked up.
      const requested: Array<string | undefined> = [];
      const sensor = {
        query: async () => ({
          device: { name: "Algalita Pod", label: "dev:351077454569099", operating_environment: "salt-water" },
          time_range_resolved: { start: "2026-08-01T00:00:00.000Z", end: "2026-08-08T00:00:00.000Z" },
          metrics: {
            temperature: {
              value: 68,
              n_samples: 20,
              series: [{ start: "2026-08-01T00:00:00.000Z", end: "2026-08-01T12:00:00.000Z", mean: 68, min: 64, max: 72, n: 20 }],
            },
          },
        }),
        deviceRecord: async (label?: string) => {
          requested.push(label);
          return null;
        },
      } as unknown as QuerySensorData;

      await buildReportInput(sensor, { timeRange: "last week", device: "Algalita" });

      expect(requested).toEqual(["dev:351077454569099"]);
    });
  });

  it("builds turbidity as a relative index with no numeric baseline, and relabels it", async () => {
    // Turbidity stays fully in scope as a reported metric -- what changed is how it is
    // expressed. It carries no baseline to be flagged against (there is no operator turbidity
    // range on any registered device) and is labelled Relative, matching the dashboard, rather
    // than claiming NTU it is not calibrated in.
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    const turbidity = report!.parameters.find((p) => p.baseline.key === "turbidity");
    expect(turbidity).toBeDefined();
    expect(turbidity!.baseline.scale).toBe("relative-index");
    expect(turbidity!.baseline.hasFixedBaseline).toBe(false);
    expect(turbidity!.baseline.label).toBe("Turbidity (Relative)");
    expect(turbidity!.baseline.unit).toBe("");
    expect(turbidity!.baseline.label).not.toContain("NTU");
  });

  it("keeps every other parameter on the numeric scale", async () => {
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    report!.parameters
      .filter((p) => p.baseline.key !== "turbidity")
      .forEach((p) => expect(p.baseline.scale).toBeUndefined());
  });

  it("computes min/max/mean from the series buckets, and falls back mean when the median call has no data", async () => {
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    const ph = report!.parameters.find((p) => p.baseline.key === "ph")!;
    expect(ph.max).toBeGreaterThanOrEqual(ph.min);
    expect(ph.mean).toBeGreaterThanOrEqual(ph.min);
    expect(ph.mean).toBeLessThanOrEqual(ph.max);
  });

  it("reports Not available for coordinates and client, rather than fabricating placeholder values", async () => {
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    expect(report!.site.latitude).toBeUndefined();
    expect(report!.site.longitude).toBeUndefined();
    expect(report!.site.clientName).toContain("Not available");
  });

  it("marks every parameter's pattern as unknown -- no live pattern detector exists yet", async () => {
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    expect(report!.parameters.every((p) => p.pattern === "unknown")).toBe(true);
  });

  it("returns an error instead of throwing when the device query fails", async () => {
    const sensor = makeSensor();
    const { report, error } = await buildReportInput(sensor, { timeRange: "since the storm", device: "Algalita" });

    expect(report).toBeUndefined();
    expect(error).toBeDefined();
  });

  it("returns an error when no parameter has any readings in the window", async () => {
    const sensor = makeSensor({
      periodDay: [], periodWeek: [], periodMonth: [], last: [],
    });
    const { report, error } = await buildReportInput(sensor, { timeRange: "last day", device: "OWC" });

    expect(report).toBeUndefined();
    expect(error).toContain("No readings found");
  });

  it("threads the caller's bearer token from ToolContext into every device call", async () => {
    // QuerySensorData.query() only grew a `token` parameter for this integration (see
    // querySensorData.ts's docstring on `query`) -- verify buildReportInput actually passes
    // context?.token through, not just that it compiles. A real QuerySensorData wired to a
    // constructor-supplied client (as the other tests here use) ignores the per-call token, so
    // this checks buildReportInput's own responsibility with a stub in QuerySensorData's shape.
    //
    // deviceRecord() is covered here too: /devices is organization-scoped, so a registry lookup
    // made on the service token would read a different fleet than the readings came from.
    const calls: Array<{ token: string | undefined }> = [];
    const registryCalls: Array<{ token: string | undefined }> = [];
    const stubSensor = {
      query: async (_params: unknown, token?: string) => {
        calls.push({ token });
        return { device: { name: "Stub" }, time_range_resolved: { start: "2026-08-01T00:00:00.000Z", end: "2026-08-08T00:00:00.000Z" }, metrics: {} };
      },
      deviceRecord: async (_requested?: string, token?: string) => {
        registryCalls.push({ token });
        return null;
      },
    } as unknown as QuerySensorData;

    await buildReportInput(stubSensor, { timeRange: "last day" }, { token: "caller-token" });

    expect(calls).toHaveLength(3); // series + median + hourly pattern series
    expect(calls.every((c) => c.token === "caller-token")).toBe(true);
    expect(registryCalls).toEqual([{ token: "caller-token" }]);
  });

  /**
   * The defect: `waterBodyType` used to be an override, and `generateReport` always passes it
   * (defaulted from `config.waterType`), so the `??` meant to let the registry decide never fell
   * through. The Algalita Pod is registered `operatingEnvironment: "salt-water"`, but a
   * `WATER_TYPE=freshwater` deployment produced a report headed "Freshwater" that judged ~58,000
   * µS/cm of ordinary seawater against the freshwater baseline of 50-1500 -- a 45x "Exceedance",
   * a High-severity "Stormwater" event, and an "Action Required" status, all manufactured.
   */
  describe("water body type", () => {
    it("takes the device registry's operating_environment over the deployment fallback", async () => {
      const sensor = makeSensor();
      const { report } = await buildReportInput(
        sensor,
        { timeRange: "last day", device: "Algalita", waterBodyTypeFallback: "Freshwater" },
      );

      expect(report!.site.waterBodyType).toBe("Marine");
      expect(report!.site.waterBodyTypeSource).toBe("device");
    });

    it("no longer selects a baseline table by water body type -- conductivity's baseline is "
      + "this device's own registry threshold either way", async () => {
      // This test used to pin the fix for a real regression: a freshwater deployment default
      // overriding the registry's "salt-water" classification produced a 45x conductivity
      // "Exceedance" by judging seawater against the freshwater reference range. That reference
      // table is gone now (vetoed in full, 2026-09-13) -- conductivity's baseline is the
      // Algalita Pod's own registry threshold (40000-75000) regardless of water body type, so a
      // wrong water body type can no longer manufacture a baseline mismatch this way. Water body
      // type itself still comes from the registry over the fallback -- see "takes the device
      // registry's operating_environment over the deployment fallback" above.
      const sensor = makeSensor();
      const { report } = await buildReportInput(
        sensor,
        { timeRange: "last day", device: "Algalita", waterBodyTypeFallback: "Freshwater" },
      );

      expect(report!.site.waterBodyType).toBe("Marine");
      const ec = report!.parameters.find((p) => p.baseline.key === "conductivity")!;
      expect(ec.baseline.baselineSource).toBe("operator-threshold");
      expect(ec.baseline.baselineMin).toBe(40_000);
      expect(ec.baseline.baselineMax).toBe(75_000);
    });

    it("falls back to the deployment value only when the registry says nothing usable", async () => {
      const stubSensor = {
        query: async () => ({
          device: { name: "Unregistered Pod", operating_environment: null },
          time_range_resolved: { start: "2026-08-01T00:00:00.000Z", end: "2026-08-08T00:00:00.000Z" },
          metrics: {
            ph: {
              value: 7.2, n_samples: 4, series: [{ start: "2026-08-01T00:00:00.000Z", end: "2026-08-01T12:00:00.000Z", mean: 7.2, min: 7.1, max: 7.3, n: 4 }],
            },
          },
        }),
      deviceRecord: async () => null,
      } as unknown as QuerySensorData;

      const { report } = await buildReportInput(
        stubSensor,
        { timeRange: "last day", waterBodyTypeFallback: "Brackish" },
      );

      expect(report!.site.waterBodyType).toBe("Brackish");
      // Flagged as a default so the PDF can say the classification was never confirmed.
      expect(report!.site.waterBodyTypeSource).toBe("default");
    });
  });

  /**
   * `dataQuality` was hardcoded to `undefined`, and renderPdf only prints the section
   * `if (report.dataQuality)` -- so the one section that could have disclosed the -1809.4 °F
   * probe rail was structurally unreachable on live data.
   */
  describe("data quality", () => {
    it("is populated rather than left undefined, so the section can render at all", async () => {
      const sensor = makeSensor();
      const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

      expect(report!.dataQuality).toBeDefined();
      expect(report!.dataQuality!.completenessPct).toBeGreaterThan(0);
    });

    it("raises calibration to Review, naming the metric, when a probe railed without a fault flag", async () => {
      const stubSensor = {
        query: async () => ({
          device: { name: "Algalita Pod", operating_environment: "salt-water" },
          time_range_resolved: { start: "2026-07-21T00:00:00.000Z", end: "2026-08-20T00:00:00.000Z" },
          metrics: {
            temperature: {
              value: null,
              n_samples: 1259,
              excluded_faulted: 0,
              excluded_implausible: 1,
              series: [{ start: "2026-07-24T00:00:00.000Z", end: "2026-07-24T12:00:00.000Z", mean: 73.4, min: 70.75, max: 88.91, n: 1259 }],
            },
          },
        }),
      deviceRecord: async () => null,
      } as unknown as QuerySensorData;

      const { report } = await buildReportInput(stubSensor, { timeRange: "last month" });
      const dq = report!.dataQuality!;

      expect(dq.calibrationStatus).toBe("Review");
      expect(dq.calibrationNotes).toContain("Temperature");
      expect(dq.calibrationNotes).toContain("without a fault flag");
    });

    it("leaves undetectable checks unset rather than reporting a clean result nothing verified", async () => {
      const sensor = makeSensor();
      const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });
      const dq = report!.dataQuality!;

      expect(dq.driftStatus).toBeUndefined();
      expect(dq.biofoulingStatus).toBeUndefined();
      expect(dq.sensorAgreementStatus).toBeUndefined();
      expect(dq.driftNotes).toContain("Not assessed");
    });
  });

  it("drops single-reading buckets from the trend series but not from min/max", async () => {
    // A reporting gap leaves one bucket holding one reading whose "mean" is that reading;
    // feeding it to the event detector invites a step-change event out of a gap. Section 2's
    // extremes stay exact over every usable reading.
    const stubSensor = {
      query: async () => ({
        device: { name: "Algalita Pod", operating_environment: "salt-water" },
        time_range_resolved: { start: "2026-07-21T00:00:00.000Z", end: "2026-08-20T00:00:00.000Z" },
        metrics: {
          ph: {
            value: 7.2,
            n_samples: 21,
            series: [
              { start: "2026-07-21T00:00:00.000Z", end: "2026-07-21T12:00:00.000Z", mean: 7.2, min: 7.0, max: 7.4, n: 10 },
              { start: "2026-07-24T00:00:00.000Z", end: "2026-07-24T12:00:00.000Z", mean: 8.9, min: 8.9, max: 8.9, n: 1 },
              { start: "2026-07-25T00:00:00.000Z", end: "2026-07-25T12:00:00.000Z", mean: 7.3, min: 7.1, max: 7.5, n: 10 },
            ],
          },
        },
      }),
      // No registry row, so temperature falls back to "no baseline" -- these cases are about
      // other behavior and must not depend on a threshold.
      deviceRecord: async () => null,
    } as unknown as QuerySensorData;

    const { report } = await buildReportInput(stubSensor, { timeRange: "last month" });
    const ph = report!.parameters.find((p) => p.baseline.key === "ph")!;

    expect(ph.series).toHaveLength(2); // the n=1 bucket is gone from the trend
    expect(ph.series!.some(([, v]) => v === 8.9)).toBe(false);
    // ...but it still counted toward the exact extremes.
    expect(ph.max).toBe(8.9);
    expect(ph.min).toBe(7.0);
  });
});

describe("buildReportInput - pattern tags", () => {
  const HOUR_MS = 3_600_000;
  const START = Date.parse("2026-09-16T00:00:00.000Z");
  /** One reading per hourly bucket, the live cadence of the Newport pods. */
  const hourlyBuckets = (hours: number, valueAt: (h: number) => number) => Array.from(
    { length: hours },
    (_, h) => {
      const value = valueAt(h);
      return {
        start: new Date(START + h * HOUR_MS).toISOString(),
        end: new Date(START + (h + 1) * HOUR_MS).toISOString(),
        mean: value,
        min: value,
        max: value,
        n: 1,
      };
    },
  );

  const stubSensor = (hourly: ReturnType<typeof hourlyBuckets>) => ({
    query: async (params: { aggregation: string; bucket?: string }) => {
      const series = params.bucket === "hour"
        ? hourly
        : [{
          start: hourly[0].start, end: hourly[hourly.length - 1].end, mean: 8, min: 5, max: 11, n: hourly.length,
        }];
      return {
        device: { name: "Stub", label: "dev:stub", operating_environment: "salt-water" },
        time_range_resolved: { start: hourly[0].start, end: hourly[hourly.length - 1].end },
        metrics: {
          dissolved_oxygen: {
            value: params.aggregation === "median" ? 8 : null, n_samples: hourly.length, series,
          },
        },
      };
    },
    deviceRecord: async () => null,
  } as unknown as QuerySensorData);

  it("classifies a pod reporting once an hour, rather than dropping every thin bucket", async () => {
    const diel = hourlyBuckets(7 * 24, (h) => 8 + 3 * Math.sin((2 * Math.PI * h) / 24));

    const { report } = await buildReportInput(stubSensor(diel), { timeRange: "last 7 days" }, { token: "t" });

    expect(report!.parameters.find((p) => p.baseline.key === "dissolved_oxygen")!.pattern).toBe("diel");
  });

  it("asks for the hourly series with a raised bucket cap, so a long window is not cut to 60 hours", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const hourly = hourlyBuckets(7 * 24, () => 8);
    const sensor = stubSensor(hourly);
    const original = sensor.query.bind(sensor);
    (sensor as unknown as { query: unknown }).query = async (params: Record<string, unknown>, token?: string) => {
      seen.push(params);
      return original(params as never, token);
    };

    await buildReportInput(sensor, { timeRange: "last 30 days" }, { token: "t" });

    const hourlyCall = seen.find((p) => p.bucket === "hour");
    expect(hourlyCall).toMatchObject({ aggregation: "series" });
    expect(hourlyCall!.maxBuckets as number).toBeGreaterThanOrEqual(30 * 24);
  });
});
