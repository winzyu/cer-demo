/**
 * `get_pod_thresholds` -- reads the operator-configured alert thresholds off a pod's device
 * registry row: temperature, pH, dissolved oxygen, ORP and conductivity min/max, plus its water
 * type. No turbidity entry exists on any pod (`referenceRanges.ts`, `BACKEND_FIELDS.md` §3b);
 * `get_turbidity_info` is the pointer this result carries for that metric.
 *
 * **The operator's source-of-truth document is vetoed as a source of ranges** (`timeline.md`).
 * Every number here comes from the registry, validated by `operatorThresholds.ts`'s
 * `metricThreshold`, or is refused with a reason -- there is no fallback to any reference table.
 * `metricThreshold` generalises what was originally temperature-only validation (`unset` for an
 * all-zero row, `inverted` for a transposed pair, `implausible` for a data-entry placeholder like
 * `maxPH=100`), one sanity rail per metric, documented next to `RAILS` in that file.
 *
 * **Device resolution is reused, not rebuilt.** `QuerySensorData.resolveDeviceForTool()` is the
 * same private `resolveDevice()` `query_sensor_data` calls, so a bad `device` argument here fails
 * with the identical "no device matches" / "matches N devices, ask the user" text, and a request
 * that already called `query_sensor_data` costs this no extra `/devices` call (same TTL cache,
 * keyed by token). `buildToolRegistry` passes both tools the same `QuerySensorData` instance for
 * exactly this reason.
 */

import { METRIC_BY_KEY } from "../devices/metrics";
import {
  type MetricThresholdKey,
  metricThreshold,
  metricThresholdRejectionReason,
} from "../report/operatorThresholds";
import { resolveErrorCode } from "../utils/errors";
import { createLogger } from "../utils/logger";
import type { ToolContext, ToolDefinition } from "../types/tool.types";
import { QuerySensorData, type SensorToolResult } from "./querySensorData";

const log = createLogger("GetPodThresholds");

const failure = (message: string): SensorToolResult => ({ error: message });

/**
 * Wire name (matching `query_sensor_data`'s `METRIC_NAMES`) to the registry validator's metric
 * key, in report order. Turbidity is deliberately not a row here -- see the module docstring.
 */
const METRIC_ORDER: ReadonlyArray<[string, MetricThresholdKey]> = [
  ["temperature", "temperature"],
  ["ph", "ph"],
  ["dissolved_oxygen", "dissolvedOxygen"],
  ["orp", "orp"],
  ["conductivity", "conductivity"],
];

/** `MetricThresholdKey` values match `MetricKey` exactly, so this lookup is a direct hit. */
const unitFor = (key: MetricThresholdKey): string => METRIC_BY_KEY.get(key)?.unit ?? "unitless";

export const getPodThresholdsDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "get_pod_thresholds",
    description:
      "Returns the alert thresholds the operator configured for a pod in the device registry: "
      + "minimum and maximum for temperature (°F), pH, dissolved oxygen (mg/L), ORP (mV) and "
      + "conductivity (µS/cm), plus the pod's water type. These are configured alert limits, "
      + "not an ecological standard. Values that fail validation are returned as rejected with a "
      + "reason — never quote a rejected value. There is no turbidity threshold; use "
      + "get_turbidity_info for turbidity.",
    parameters: {
      type: "object",
      properties: {
        device: {
          type: "string",
          description:
            "Which pod, by name or dev: label. Optional when the deployment has one device or a "
            + "default is configured. Ask the user rather than guessing if the tool reports the "
            + "name is ambiguous.",
        },
      },
      required: [],
    },
  },
};

export interface GetPodThresholdsOptions {
  sensor?: QuerySensorData;
}

export class GetPodThresholds {
  private readonly sensor: QuerySensorData;

  constructor(options: GetPodThresholdsOptions = {}) {
    this.sensor = options.sensor ?? new QuerySensorData();
  }

  /**
   * **Never throws** for an ordinary failure, same rule `query_sensor_data` follows and for the
   * same reason (`querySensorData.ts` `run()`): a coded `caller_token_required` (no token) or
   * `device_auth_expired` is re-thrown because no rewording by the model recovers either one;
   * everything else becomes `{ error }` so the tool loop can continue.
   */
  async run(args: Record<string, unknown>, context?: ToolContext): Promise<SensorToolResult> {
    try {
      return await this.execute(args, context?.token);
    } catch (error) {
      const code = resolveErrorCode(error);
      if (code === "device_auth_expired" || code === "caller_token_required") {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      log.error(`get_pod_thresholds failed: ${message}`);
      return failure(`Could not read pod thresholds: ${message}`);
    }
  }

  private async execute(args: Record<string, unknown>, token?: string): Promise<SensorToolResult> {
    const resolved = await this.sensor.resolveDeviceForTool(
      typeof args.device === "string" ? args.device : undefined,
      token,
    );
    if ("error" in resolved) {
      return resolved.error;
    }
    const { device } = resolved;

    const thresholds = Object.fromEntries(METRIC_ORDER.map(([wireName, metricKey]) => {
      const verdict = metricThreshold(device.thresholds, metricKey);
      const entry = verdict.usable
        ? {
          status: "configured",
          min: verdict.min,
          max: verdict.max,
          unit: unitFor(metricKey),
        }
        : {
          status: "rejected",
          reason: metricThresholdRejectionReason(verdict.reason, metricKey),
        };
      return [wireName, entry];
    }));

    return {
      device: {
        name: device.name ?? device.label ?? "(unnamed)",
        label: device.label ?? null,
        operating_environment: device.operatingEnvironment ?? null,
      },
      thresholds,
      turbidity: {
        status: "no_threshold",
        note: "No operator-configured turbidity threshold exists on any pod. Call "
          + "get_turbidity_info for how to interpret a turbidity reading.",
      },
      source: "Device registry — operator-configured alert thresholds.",
      note: "These are configured alert limits an operator set for this pod, not an ecological "
        + "water-quality standard.",
    };
  }
}
