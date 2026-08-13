import { config } from "../config";
import type { ToolHandler } from "../types/tool.types";
import { QuerySensorData, querySensorDataDefinition } from "./querySensorData";

/**
 * The tool inventory offered to the model.
 *
 * **Gated on `SENSOR_TOOL`, which defaults off.** The flag governs three things that must move
 * together or not at all: the system prompt's tool block, the `tools` array on the request, and
 * this registry. Any one of them landing alone either promises a tool that cannot be called or
 * offers one the model was never told about — and the first also changes the prompt, which is a
 * pinned control for the Phase N2 bake-off while ◆G7 is open (`RETRIEVAL_BAKEOFF.md` §4).
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
    run: (args) => sensor.run(args),
  }];
};

export { QuerySensorData, querySensorDataDefinition };
