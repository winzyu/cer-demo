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
 * `query_sensor_data`, using the current site's coordinate-supported time span.
 * A pod whose returned history has no usable best_lat/best_lon fix cannot establish a site.
 * The result says so in its own `note`, and such a pod is "unconfirmed": only that status
 * needs a `query_sensor_data` check before the model calls the pod online or stopped.
 *
 * **Each timestamp carries its age.** `last_reported_age` and `last_reported_stale` sit beside
 * it, so "which pods are online" does not rest on date arithmetic by the model (`readingAge.ts`).
 *
 * **Silent pods are named, not dropped.** Given only a stale flag, the model answered "which pods
 * are online" by listing the fresh pods and leaving the rest out, so a pod that stopped reporting
 * vanished from the answer instead of being reported as down. Each pod now carries a `status`
 * ("reporting", "silent", "unconfirmed" or "not_checked"), and the result repeats the silent ones
 * in `silent_pods` with their age. The note says what each status means; what to say about each
 * is one rule in the system prompt (`systemPrompt.ts`, "Pod status in list_pods"), not repeated
 * here. It used to be: the note's "confirm with query_sensor_data before saying a pod stopped"
 * covered stale timestamps too, and the model resolved that conflict by leaving silent pods out.
 *
 * **Device resolution and the `/devices` call are reused, not rebuilt.** This shares the
 * `QuerySensorData` instance `buildToolRegistry` hands every device-reading tool, so it hits the
 * same TTL cache keyed by token: a request that lists pods and then reads one costs a single
 * `/devices` round trip, and the names printed here are exactly the strings `device` accepts.
 */

import { resolveErrorCode } from "../utils/errors";
import { createLogger } from "../utils/logger";
import { USER_NOTES_FIELD } from "../types/tool.types";
import type { ToolContext, ToolDefinition } from "../types/tool.types";
import { QuerySensorData, type SensorToolResult } from "./querySensorData";
import { readingAge, type ReadingAge } from "./readingAge";
import type { DeviceSummary } from "../types/device.types";

const log = createLogger("ListPods");

/**
 * How many pods get a `last_reported` probe. Each one is its own `query_sensor_data` call, so an
 * uncapped fan-out on a large or superadmin-scoped fleet would turn one question into dozens of
 * production reads. The listing itself is never truncated -- only the probe is -- because a
 * partial fleet is a wrong answer, while a missing freshness field is a stated omission.
 */
const LAST_REPORTED_PROBE_LIMIT = 20;

/**
 * "silent" is `readingAge`'s stale (no reading for more than six hours). A null timestamp is
 * "unconfirmed", not silent: the probe drops readings with no GPS fix, so null is not proof.
 */
export type PodStatus = "reporting" | "silent" | "unconfirmed" | "not_checked";

const podStatus = (probedPod: boolean, age: ReadingAge | null): PodStatus => {
  if (!probedPod) {
    return "not_checked";
  }
  if (age === null) {
    return "unconfirmed";
  }
  return age.stale ? "silent" : "reporting";
};

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

const podName = (device: DeviceSummary): string => device.name ?? device.label ?? "(unnamed)";

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
    const quality = await Promise.all(probed.map((device) => this.sensor.run({
      device: device.label, metric: "all", time_range: "last year", aggregation: "latest",
    }, { token })));
    const freshness = quality.map((result) => (
      typeof result.current_site_last_reported === "string" ? result.current_site_last_reported : null
    ));

    // Said out loud only when it applies: on a fleet inside the cap this sentence would
    // describe a truncation that did not happen.
    const probeNote = devices.length > probed.length
      ? ` Freshness was checked for the first ${probed.length} of ${devices.length} pods; the`
        + " rest are listed with \"last_reported\": \"not_checked\"."
      : "";

    const nowMs = this.sensor.clockMs();
    const pods = devices.map((device, index) => {
      const age = index < probed.length ? readingAge(freshness[index], nowMs) : null;
      const status = podStatus(index < probed.length, age);
      return {
        name: podName(device),
        device: device.label ?? null,
        operating_environment: device.operatingEnvironment ?? null,
        status,
        ...(index < probed.length
          ? { last_reported: freshness[index] }
          : { last_reported: "not_checked" }),
        ...(index < probed.length && (quality[index].note || quality[index].error)
          ? { note: quality[index].note ?? quality[index].error } : {}),
        ...(age ? { last_reported_age: age.age, last_reported_stale: age.stale } : {}),
      };
    });

    // Each probe's reader notes, named because this answer covers several pods. Lifted to the
    // top level: the page reads only that, and it is the only copy the model never sees.
    const podNotes = probed.flatMap((device, index) => {
      const texts = quality[index][USER_NOTES_FIELD];
      return Array.isArray(texts) ? texts.map((text) => `${podName(device)}: ${text}`) : [];
    });
    const failedNames = probed.filter((_, index) => quality[index].error).map(podName);
    const silentPods = pods
      .filter((pod) => pod.status === "silent")
      .map((pod) => ({
        name: pod.name, last_reported: pod.last_reported, last_reported_age: pod.last_reported_age,
      }));

    return {
      pods,
      count: pods.length,
      silent_pods: silentPods,
      source: "Device registry — the pods this account's organization can see.",
      note: "\"status\" is \"reporting\" when the pod's last current-site reading is at most "
        + "six hours old and \"silent\" when it is older; silent pods are repeated in "
        + "\"silent_pods\" with \"last_reported_age\". \"unconfirmed\" means \"last_reported\" "
        + "is null: only readings with a GPS fix count, so this pod may be reporting without one, "
        + `and its state is not known from this list.${probeNote}`,
      [USER_NOTES_FIELD]: [
        "Last-report times come from each pod's readings at its current site; a missing time "
          + "means not confirmed recently, not that the pod has stopped reporting.",
        ...(devices.length > probed.length
          ? [`Last-report times were checked for the first ${probed.length} of ${devices.length} pods only.`]
          : []),
        ...(failedNames.length > 0
          ? [`The last report could not be checked for ${failedNames.join(", ")}.`]
          : []),
        ...podNotes,
      ],
    };
  }
}
