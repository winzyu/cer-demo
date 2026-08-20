import { config } from "../config";
import type { ToolHandler } from "../types/tool.types";
import { QuerySensorData, SensorQueryError, querySensorDataDefinition } from "./querySensorData";

/**
 * The tool inventory offered to the model.
 *
 * **Gated on `SENSOR_TOOL`, which defaults off.** The flag governs three things that must move
 * together or not at all: the system prompt's tool block, the `tools` array on the request, and
 * this registry. Any one of them landing alone either promises a tool that cannot be called or
 * offers one the model was never told about — and the first also changes the prompt, which is a
 * pinned control for the Phase N2 bake-off while ◆G7 is open (`RETRIEVAL_BAKEOFF.md` §4).
 *
 * **This registry is built once, not per request** — `ChatController` calls it from its
 * constructor default and the resulting handlers are shared by every request the process serves.
 * Nothing request-scoped may be closed over here: a caller-chosen device baked into a handler
 * would be handed to whichever request ran next. The chat request's `device` and the caller's
 * bearer token are threaded through `ChatOrchestrator.run(messages, { device, token })` instead,
 * where they stay on one call's stack and reach the handler as its `ToolContext`.
 *
 * `search_documents` is deliberately absent. Retrieval runs before the call and arrives as
 * CONTEXT; whether it returns as a tool is ◆G11, still open.
 */
export const buildToolRegistry = (sensorTool: boolean = config.tools.sensorTool): ToolHandler[] => {
  if (!sensorTool) {
    return [];
  }
  const sensor = new QuerySensorData();
  return [{
    definition: querySensorDataDefinition,
    // `context` must be forwarded, not dropped: it carries the caller's bearer token, and the
    // handler falls back to the deployment's `DEVICE_API_TOKEN` without it — which, on an
    // organization-scoped API, answers out of the wrong fleet.
    run: (args, context) => sensor.run(args, context),
  }];
};

export { QuerySensorData, SensorQueryError, querySensorDataDefinition };
export type { SensorQueryParams } from "./querySensorData";
