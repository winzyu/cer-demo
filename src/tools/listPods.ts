/**
 * `list_pods` -- the pods the caller's own token can see, by name, with a best-effort
 * "when did this one last speak".
 *
 * **Why this is its own tool rather than a line in the system prompt.** Pod names are
 * org-scoped: the device API answers `/devices` out of the token holder's organization and
 * nothing else, so the fleet is a property of the *caller*, not of the deployment. The system
 * prompt is built once at boot and must stay byte-identical across requests for Fireworks to
 * cache its prefix (`promptBuilder.ts`), so a per-caller pod list cannot live there. A tool
 * result arrives after the static prefix and costs the cache nothing -- the same argument
 * `systemPrompt.ts` already makes for `get_pod_thresholds` and the deleted range block.
 *
 * **Why it exists at all.** Before it, "do you have data on any of my pods?" had no route. The
 * model's only way to learn a pod name was to fire a `query_sensor_data` with no `device` and
 * read the names out of the *error* text `resolveDevice` returns when the deployment sees more
 * than one ("This deployment can see 5 devices, so \"device\" is required. Available devices:
 * ..."). That works by accident, wastes a round, and reads to the model as a failure, so the
 * likeliest outcome was the refusal sentence for a question the system can answer completely.
 *
 * **`last_reported` is best-effort and its null is not proof of silence.** It comes from
 * `/water/last`, which drops readings whose latitude is absent or zero
 * (`DeviceApiClient.getLastReading`), so a pod reporting water chemistry without a GPS fix is
 * indistinguishable here from one that has stopped. The result says so in its own `note`, and
 * the answer to "is this pod dead" is a `query_sensor_data` call, not this field.
 *
 * **Device resolution and the `/devices` call are reused, not rebuilt.** This shares the
 * `QuerySensorData` instance `buildToolRegistry` hands every device-reading tool, so it hits the
 * same TTL cache keyed by token: a request that lists pods and then reads one costs a single
 * `/devices` round trip, and the names printed here are exactly the strings `device` accepts.
 */

import { resolveErrorCode } from "../utils/errors";
import { createLogger } from "../utils/logger";
import type { ToolContext, ToolDefinition } from "../types/tool.types";
import { QuerySensorData, type SensorToolResult } from "./querySensorData";

const log = createLogger("ListPods");

/**
 * How many pods get a `last_reported` probe. Each one is its own `/water/last` call, so an
 * uncapped fan-out on a large or superadmin-scoped fleet would turn one question into dozens of
 * production reads. The listing itself is never truncated -- only the probe is -- because a
 * partial fleet is a wrong answer, while a missing freshness field is a stated omission.
 */
const LAST_REPORTED_PROBE_LIMIT = 20;

const failure = (message: string): SensorToolResult => ({ error: message });

export const listPodsDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "list_pods",
    description:
      "Lists the pods (sensor deployments) this user's account can see, with each pod's name, "
      + "its water type, and when it was last heard from. Call this to answer \"which pods do I "
      + "have\", \"do you have data on my pods\", or any question that needs a pod's name before "
      + "a reading can be read — and whenever a pod name is ambiguous or unknown. Returns names "
      + "exactly as the other tools' \"device\" argument accepts them.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

export interface ListPodsOptions {
  sensor?: QuerySensorData;
}

export class ListPods {
  private readonly sensor: QuerySensorData;

  constructor(options: ListPodsOptions = {}) {
    this.sensor = options.sensor ?? new QuerySensorData();
  }

  /**
   * **Never throws** for an ordinary failure, the rule every tool in this directory follows
   * (`querySensorData.ts` `run()`): a coded `caller_token_required` or `device_auth_expired` is
   * re-thrown because no rewording by the model recovers either; everything else becomes
   * `{ error }` so the tool loop can carry on and the model can say what went wrong.
   */
  async run(_args?: Record<string, unknown>, context?: ToolContext): Promise<SensorToolResult> {
    try {
      return await this.execute(context?.token);
    } catch (error) {
      const code = resolveErrorCode(error);
      if (code === "device_auth_expired" || code === "caller_token_required") {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      log.error(`list_pods failed: ${message}`);
      return failure(`Could not list pods: ${message}`);
    }
  }

  private async execute(token?: string): Promise<SensorToolResult> {
    const devices = await this.sensor.listDevicesForTool(token);

    if (devices.length === 0) {
      // Same wording `resolveDevice` uses for the same condition: an empty fleet is almost
      // always a token scoped to a different organization, not a customer with no hardware.
      return failure(
        "The device API returned no devices for this token. The token is scoped to one "
        + "organization, so this usually means it belongs to a different one.",
      );
    }

    const probed = devices.slice(0, LAST_REPORTED_PROBE_LIMIT);
    const freshness = await Promise.all(
      probed.map((device) => this.sensor.lastReportedForTool(device.label ?? "", token)),
    );

    // Said out loud only when it applies: on a fleet inside the cap this sentence would
    // describe a truncation that did not happen.
    const probeNote = devices.length > probed.length
      ? ` Freshness was checked for the first ${probed.length} of ${devices.length} pods; the`
        + " rest are listed with \"last_reported\": \"not_checked\"."
      : "";

    const pods = devices.map((device, index) => ({
      name: device.name ?? device.label ?? "(unnamed)",
      device: device.label ?? null,
      operating_environment: device.operatingEnvironment ?? null,
      ...(index < probed.length
        ? { last_reported: freshness[index] }
        : { last_reported: "not_checked" }),
    }));

    return {
      pods,
      count: pods.length,
      source: "Device registry — the pods this account's organization can see.",
      note: "\"last_reported\" is best effort: it comes from the latest positioned reading, "
        + "which omits readings with no GPS fix, so a null there means \"not confirmed recently\" "
        + "and NOT that the pod is silent. Confirm with query_sensor_data before telling the user "
        + `a pod has stopped reporting.${probeNote}`,
    };
  }
}
