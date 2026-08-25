import { config } from "../config";
import type { ToolHandler } from "../types/tool.types";
import { QuerySensorData, SensorQueryError, querySensorDataDefinition } from "./querySensorData";
import { GenerateReport, generateReportDefinition } from "./generateReport";

/**
 * The tool inventory offered to the model.
 *
 * **Gated on `SENSOR_TOOL` and `REPORT_TOOL`, both defaulting off.** Each flag governs the same
 * three things that must move together or not at all: the system prompt's tool block, the
 * `tools` array on the request, and this registry. Any one landing alone either promises a tool
 * that cannot be called or offers one the model was never told about — and the prompt half of
 * that is a pinned control for the Phase N2 bake-off while ◆G7 is open (`RETRIEVAL_BAKEOFF.md`
 * §4). `generate_report` has its own flag rather than riding on `sensorTool`: it calls
 * `QuerySensorData.query()` directly, not through the model, so it does not strictly need the
 * model-facing sensor tool switched on to work.
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
export const buildToolRegistry = (
  sensorTool: boolean = config.tools.sensorTool,
  reportTool: boolean = config.tools.reportTool,
): ToolHandler[] => {
  const handlers: ToolHandler[] = [];

  if (sensorTool) {
    const sensor = new QuerySensorData();
    handlers.push({
      definition: querySensorDataDefinition,
      // `context` must be forwarded, not dropped: it carries the caller's bearer token, and
      // without it the handler has no credential at all and refuses with a coded 401. It used to
      // fall back to the deployment's `DEVICE_API_TOKEN` instead, which on an organization-scoped
      // API answered out of the wrong fleet rather than failing.
      run: (args, context) => sensor.run(args, context),
    });
  }

  if (reportTool) {
    const report = new GenerateReport();
    handlers.push({
      definition: generateReportDefinition,
      run: (args, context) => report.run(args, context),
    });
  }

  return handlers;
};

export { QuerySensorData, SensorQueryError, querySensorDataDefinition };
export { GenerateReport, generateReportDefinition };
export type { SensorQueryParams } from "./querySensorData";
