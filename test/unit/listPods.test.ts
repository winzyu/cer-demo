import fs from "fs";
import path from "path";
import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { QuerySensorData } from "../../src/tools/querySensorData";
import { ListPods, listPodsDefinition } from "../../src/tools/listPods";

/**
 * Offline throughout, the rule `querySensorData.test.ts` and `getPodThresholds.test.ts` follow:
 * every response is a recorded fixture served through a stubbed `fetch` into the real
 * `DeviceApiClient`, and nothing here reaches the network or needs a real token.
 *
 * `devices.json` is the shared fleet fixture. Its six rows dedupe to four labels (two rows carry
 * the same `dev:351077454569099` under different organizations, and `dedupeByLabel` keeps the
 * first), which is what makes it useful here: `list_pods` must print the deduped fleet, because
 * a duplicate row would read to the model as two pods the user does not have.
 */
const FIXTURES = path.join(__dirname, "../fixtures/device-api");
const DEVICES = JSON.parse(fs.readFileSync(path.join(FIXTURES, "devices.json"), "utf8"));
const OWC_LAST = JSON.parse(fs.readFileSync(path.join(FIXTURES, "owc-last.json"), "utf8"));

const TOKEN = "caller-jwt";

interface Stub {
  client: DeviceApiClient;
  calls: string[];
}

/**
 * `lastByLabel` decides what `/water/last/<label>` returns per pod, so one stub covers the
 * "reporting", "no GPS fix" (`[]`, which the route really does return -- see
 * `DeviceApiClient.getLastReading`) and "route failed" cases in the same fleet.
 */
const makeClient = (
  lastByLabel: Record<string, unknown> = {},
  devices: unknown = DEVICES,
): Stub => {
  const calls: string[] = [];
  const fetchImpl = async (url: string): Promise<Response> => {
    calls.push(url);
    if (url.includes("/water/last/")) {
      const label = decodeURIComponent(url.split("/water/last/")[1]);
      const body = lastByLabel[label];
      if (body === "boom") {
        return { ok: false, status: 500, json: async () => ({}), text: async () => "upstream" } as unknown as Response;
      }
      const payload = body ?? [];
      return {
        ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload),
      } as unknown as Response;
    }
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

const toolWith = (stub: Stub): ListPods => new ListPods({ sensor: new QuerySensorData({ client: stub.client }) });

interface Pod {
  name: string;
  device: string | null;
  operating_environment: string | null;
  last_reported: string | null;
}

const podsOf = (result: Record<string, unknown>): Pod[] => result.pods as Pod[];

describe("list_pods — tool definition", () => {
  it("is named list_pods and takes no arguments", () => {
    expect(listPodsDefinition.function.name).toBe("list_pods");
    expect(listPodsDefinition.function.parameters.properties).toEqual({});
    expect(listPodsDefinition.function.parameters.required).toEqual([]);
  });

  it("describes itself in the words the failing questions actually used", () => {
    // The tool exists because "do you have data on any of my pods?" refused. A description that
    // does not contain that phrasing is a description the model will not match it against.
    const { description } = listPodsDefinition.function;

    expect(description).toContain("do you have data on my pods");
    expect(description).toContain("which pods do I have");
  });
});

describe("list_pods — the fleet", () => {
  it("lists every pod the token can see, deduped by label, with the names other tools accept", async () => {
    const stub = makeClient();

    const result = await toolWith(stub).run({}, { token: TOKEN });

    expect(result.error).toBeUndefined();
    expect(result.count).toBe(4);
    expect(podsOf(result).map((pod) => pod.device)).toEqual([
      "dev:351077454569099",
      "dev:351077454567580",
      "dev:351077454591408",
      "dev:9879347923842",
    ]);
    expect(podsOf(result)[0]).toMatchObject({
      name: "Algalita Pod",
      operating_environment: "salt-water",
    });
  });

  it("returns names that query_sensor_data can resolve back to exactly one pod", async () => {
    // The contract that makes this tool useful rather than decorative: whatever it prints, the
    // model may hand straight back as `device`. A name this tool invented would dead-end in
    // "No device matches".
    const stub = makeClient();
    const sensor = new QuerySensorData({ client: stub.client });
    const result = await new ListPods({ sensor }).run({}, { token: TOKEN });

    await Promise.all(podsOf(result).map(async (pod) => {
      const resolved = await sensor.resolveDeviceForTool(pod.name, TOKEN);
      expect(resolved).toHaveProperty("device");
    }));
  });

  it("shares one /devices call with the sensor tool rather than making its own", async () => {
    // Both tools hold the same QuerySensorData, so they share its TTL cache keyed by token.
    // A second /devices round trip here would double the cost of "which pods do I have, and
    // what is the pH on that one".
    const stub = makeClient();
    const sensor = new QuerySensorData({ client: stub.client });

    await new ListPods({ sensor }).run({}, { token: TOKEN });
    await sensor.resolveDeviceForTool("Algalita", TOKEN);

    expect(stub.calls.filter((url) => url.includes("/devices"))).toHaveLength(1);
  });
});

describe("list_pods — freshness", () => {
  it("reports the last reading's timestamp for a pod that has one", async () => {
    const stub = makeClient({ "dev:351077454567580": OWC_LAST });

    const result = await toolWith(stub).run({}, { token: TOKEN });
    const owc = podsOf(result).find((pod) => pod.device === "dev:351077454567580");

    expect(owc?.last_reported).toBe("2026-08-07T14:38:49.000Z");
  });

  it("returns null, not an error, for the no-GPS-fix empty response", async () => {
    // `/water/last` answers `[]` when it filtered every reading for want of a position. That is
    // not a silent pod, and it must not fail the listing either.
    const stub = makeClient({ "dev:351077454569099": [] });

    const result = await toolWith(stub).run({}, { token: TOKEN });

    expect(result.error).toBeUndefined();
    expect(podsOf(result)[0].last_reported).toBeNull();
  });

  it("survives a failing /water/last and still lists the whole fleet", async () => {
    const stub = makeClient({ "dev:351077454569099": "boom", "dev:351077454567580": OWC_LAST });

    const result = await toolWith(stub).run({}, { token: TOKEN });

    expect(result.error).toBeUndefined();
    expect(result.count).toBe(4);
    expect(podsOf(result)[0].last_reported).toBeNull();
    expect(podsOf(result)[1].last_reported).toBe("2026-08-07T14:38:49.000Z");
  });

  it("states each timestamp's age and flags a pod silent for days as stale", async () => {
    // CONVERSATION_QA_2026-09-24 finding 1: with absolute timestamps only, two pods ten and twelve
    // days silent were called "likely online".
    const stub = makeClient({ "dev:351077454567580": OWC_LAST, "dev:351077454569099": [] });
    const tenDaysOn = Date.parse("2026-08-17T15:00:00.000Z");
    const tool = new ListPods({ sensor: new QuerySensorData({ client: stub.client, now: () => tenDaysOn }) });

    const pods = podsOf(await tool.run({}, { token: TOKEN })) as unknown as Array<Record<string, unknown>>;
    const owc = pods.find((pod) => pod.device === "dev:351077454567580");

    expect(owc).toMatchObject({ last_reported_age: "11 days", last_reported_stale: true });
    // No timestamp, no age: a null must not acquire a made-up one.
    expect(pods[0]).not.toHaveProperty("last_reported_age");
    expect(pods[0]).not.toHaveProperty("last_reported_stale");
  });

  it("does not flag a pod that reported within the hour", async () => {
    const stub = makeClient({ "dev:351077454567580": OWC_LAST });
    const fortyMinutesOn = Date.parse("2026-08-07T15:18:49.000Z");
    const tool = new ListPods({ sensor: new QuerySensorData({ client: stub.client, now: () => fortyMinutesOn }) });

    const pods = podsOf(await tool.run({}, { token: TOKEN })) as unknown as Array<Record<string, unknown>>;

    expect(pods.find((pod) => pod.device === "dev:351077454567580"))
      .toMatchObject({ last_reported_age: "40 minutes", last_reported_stale: false });
  });

  it("says in the result that a null last_reported is not proof of silence", async () => {
    // The trap this tool could otherwise walk the model into: null here means "not confirmed",
    // because the route drops readings with no GPS fix, so a pod reporting chemistry without a
    // position looks identical to a dead one.
    const stub = makeClient();

    const result = await toolWith(stub).run({}, { token: TOKEN });

    expect(String(result.note)).toContain("NOT that the pod is silent");
    expect(String(result.note)).toContain("query_sensor_data");
  });
});

describe("list_pods — failure paths", () => {
  it("re-throws the coded 401 rather than returning it, when no token was sent", async () => {
    // Same rule every device-reading tool follows: no rewording by the model recovers a missing
    // credential, so this must not come back as a tool result the loop retries.
    const tool = new ListPods({ sensor: new QuerySensorData() });

    await expect(tool.run({})).rejects.toMatchObject({
      status: 401,
      code: "caller_token_required",
    });
  });

  it("explains an empty fleet as a token scoped elsewhere, in resolveDevice's own words", async () => {
    const stub = makeClient({}, []);

    const result = await toolWith(stub).run({}, { token: TOKEN });

    expect(String(result.error)).toContain("returned no devices for this token");
    expect(String(result.error)).toContain("scoped to one organization");
  });
});
