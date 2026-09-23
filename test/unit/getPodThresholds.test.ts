import fs from "fs";
import path from "path";
import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { QuerySensorData, querySensorDataDefinition } from "../../src/tools/querySensorData";
import { GetPodThresholds, getPodThresholdsDefinition } from "../../src/tools/getPodThresholds";

/**
 * Offline throughout, same rule `querySensorData.test.ts` follows: every response is a recorded
 * fixture served through a stubbed `fetch` into the real `DeviceApiClient`, and no test here may
 * reach the network or need a real token.
 *
 * `devices.json` is the same fixture `querySensorData.test.ts` and `generateReport.test.ts` use.
 * Its first "Algalita Pod" row (kept by `dedupeByLabel` -- first occurrence wins) carries a fully
 * valid threshold set; `dev:351077454591408` carries the registry's all-zero "never configured"
 * row, used here for the rejection-path coverage.
 */
const FIXTURES = path.join(__dirname, "../fixtures/device-api");
const DEVICES = JSON.parse(fs.readFileSync(path.join(FIXTURES, "devices.json"), "utf8"));

interface Call { url: string }

const makeClient = (devices: unknown = DEVICES): { client: DeviceApiClient; calls: Call[] } => {
  const calls: Call[] = [];
  const fetchImpl = async (url: string): Promise<Response> => {
    calls.push({ url });
    const body = url.includes("/devices") ? devices : {};
    return {
      ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body),
    } as unknown as Response;
  };
  return {
    client: new DeviceApiClient({ baseUrl: "https://example.invalid/api/v1", token: "test-token", fetchImpl }),
    calls,
  };
};

const TOKEN = "caller-jwt";

describe("get_pod_thresholds — tool definition", () => {
  it("is named get_pod_thresholds, takes an optional device, and uses the specified description", () => {
    expect(getPodThresholdsDefinition.function.name).toBe("get_pod_thresholds");
    expect(getPodThresholdsDefinition.function.parameters.required).toEqual([]);
    expect(getPodThresholdsDefinition.function.description).toBe(
      "Returns the alert thresholds the operator configured for a pod in the device registry: "
      + "minimum and maximum for temperature (°F), pH, dissolved oxygen (mg/L), ORP (mV) and "
      + "conductivity (µS/cm), plus the pod's water type. These are configured alert limits, "
      + "not an ecological standard. Values that fail validation are returned as rejected with a "
      + "reason - never quote a rejected value. This tool exposes no numeric turbidity threshold; use "
      + "get_turbidity_info for turbidity.",
    );
  });

  it("uses the identical device parameter description query_sensor_data uses", () => {
    const podDeviceParam = (getPodThresholdsDefinition.function.parameters.properties as Record<string, { description: string }>).device;
    const sensorDeviceParam = (querySensorDataDefinition.function.parameters.properties as Record<string, { description: string }>).device;
    expect(podDeviceParam.description).toBe(sensorDeviceParam.description);
  });
});

describe("get_pod_thresholds — a fully valid pod", () => {
  it("reports every metric as configured, cast to numbers, with the registry's units", async () => {
    const { client } = makeClient();
    const sensor = new QuerySensorData({ client });
    const tool = new GetPodThresholds({ sensor });

    const result = await tool.run({ device: "Algalita" }, { token: TOKEN });

    expect(result.error).toBeUndefined();
    expect(result.device).toMatchObject({
      name: "Algalita Pod",
      label: "dev:351077454569099",
      operating_environment: "salt-water",
    });
    expect(result.thresholds).toEqual({
      temperature: { status: "configured", min: 50, max: 80, unit: "°F" },
      ph: { status: "configured", min: 6, max: 10, unit: "unitless" },
      dissolved_oxygen: { status: "configured", min: 4, max: 15, unit: "mg/L" },
      orp: { status: "configured", min: 50, max: 400, unit: "mV" },
      conductivity: { status: "configured", min: 40_000, max: 75_000, unit: "µS/cm" },
    });
    expect(result.turbidity).toMatchObject({ status: "unavailable" });
    expect(String((result.turbidity as { note: string }).note)).toContain("get_turbidity_info");
    expect(String(result.source)).toMatch(/device registry/i);
    expect(String(result.note)).toMatch(/not an ecological/i);
  });

  it("never names sensor hardware anywhere in the result", async () => {
    const { client } = makeClient();
    const tool = new GetPodThresholds({ sensor: new QuerySensorData({ client }) });

    const result = await tool.run({ device: "Algalita" }, { token: TOKEN });
    const text = JSON.stringify(result).toLowerCase();

    expect(text).not.toMatch(/turner|keystudio|keyestudio|ks0414/);
  });
});

describe("get_pod_thresholds — a pod with rejected thresholds", () => {
  it("rejects every metric on the all-zero row as unset, with no raw values in the entries", async () => {
    const { client } = makeClient();
    const tool = new GetPodThresholds({ sensor: new QuerySensorData({ client }) });

    // dev:351077454591408 carries all-ten-values "0" -- the registry's "never configured" state.
    const result = await tool.run({ device: "dev:351077454591408" }, { token: TOKEN });

    expect(result.error).toBeUndefined();
    const thresholds = result.thresholds as Record<string, { status: string; reason?: string }>;
    Object.values(thresholds).forEach((entry) => {
      expect(entry.status).toBe("rejected");
      expect(typeof entry.reason).toBe("string");
    });

    // No rejected entry may carry min/max/unit -- that would be quoting the rejected value.
    const json = JSON.stringify(thresholds);
    expect(json).not.toMatch(/"min":|"max":|"unit":/);
  });
});

describe("get_pod_thresholds — device resolution", () => {
  it("no token throws the same coded 401 query_sensor_data throws, not a returned error", async () => {
    // No client override: the production path where DeviceApiClient.client(token) itself refuses.
    const tool = new GetPodThresholds({ sensor: new QuerySensorData() });

    await expect(tool.run({ device: "Algalita" }))
      .rejects.toMatchObject({ status: 401, code: "caller_token_required" });
  });

  it("an unknown device name fails the same way query_sensor_data's resolveDevice does", async () => {
    const { client } = makeClient();
    const tool = new GetPodThresholds({ sensor: new QuerySensorData({ client }) });

    const result = await tool.run({ device: "Nonexistent Pod" }, { token: TOKEN });

    expect(result.error).toContain("No device matches");
  });

  it("an ambiguous device name reports how many devices matched, same as query_sensor_data", async () => {
    // A synthetic pair with a shared substring -- the fixture's real fleet has no two distinct
    // labels whose names overlap this way, so ambiguity has to be constructed to exercise it.
    const AMBIGUOUS_DEVICES = [
      { id: "a1", data: { name: "Marina Park Buoy", label: "dev:1001", thresholds: {} } },
      { id: "a2", data: { name: "Marina Park Dock", label: "dev:1002", thresholds: {} } },
    ];
    const { client } = makeClient(AMBIGUOUS_DEVICES);
    const tool = new GetPodThresholds({ sensor: new QuerySensorData({ client }) });

    const result = await tool.run({ device: "Marina Park" }, { token: TOKEN });

    expect(result.error).toContain("matches 2 devices");
  });

  it("reuses query_sensor_data's device cache -- no second /devices call for the same token", async () => {
    const { client, calls } = makeClient();
    const sensor = new QuerySensorData({ client });

    // Simulates query_sensor_data having already resolved (and cached) the device list for this
    // token, via the exact seam it uses internally (resolveDevice -> resolveDeviceForTool).
    await sensor.resolveDeviceForTool("Algalita", TOKEN);
    expect(calls.filter((c) => c.url.includes("/devices")).length).toBe(1);

    const tool = new GetPodThresholds({ sensor });
    await tool.run({ device: "Algalita" }, { token: TOKEN });

    expect(calls.filter((c) => c.url.includes("/devices")).length).toBe(1);
  });
});
