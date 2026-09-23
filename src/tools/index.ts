import { config } from "../config";
import type { ToolHandler } from "../types/tool.types";
import { QuerySensorData, SensorQueryError, querySensorDataDefinition } from "./querySensorData";
import { GenerateReport, generateReportDefinition } from "./generateReport";
import { GetPodThresholds, getPodThresholdsDefinition } from "./getPodThresholds";
import { getTurbidityInfo, getTurbidityInfoDefinition } from "./getTurbidityInfo";
import { ListPods, listPodsDefinition } from "./listPods";

/**
 * The tool inventory offered to the model.
 *
 * **Gated on `SENSOR_TOOL` and `REPORT_TOOL`, both defaulting off.** Each flag governs the same
 * three things that must move together or not at all: the system prompt's tool block, the
 * `tools` array on the request, and this registry. Any one landing alone either promises a tool
 * that cannot be called or offers one the model was never told about. The prompt half of that used
 * to carry extra weight because it was a pinned control for the Phase N2 bake-off while ◆G7 was
 * open (`RETRIEVAL_BAKEOFF.md` §4) — that pin was released 2026-08-26 when ◆G7 split, and the
 * transcripts it protected were archived 2026-09-01 under `eval-archive-2026-09-01`. What still
 * holds, and is checked, is `test/unit/prompt.test.ts`'s "the tool flags are additive" property: a
 * flag may only append, so keeping these three in lockstep is what keeps the base prompt a
 * byte-exact prefix no matter which flags are on. `generate_report` has its own flag rather than
 * riding on `sensorTool`: it calls `QuerySensorData.query()` directly, not through the model, so
 * it does not strictly need the model-facing sensor tool switched on to work.
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
    // One instance, shared by every handler below that needs device data: `QuerySensorData`
    // caches the registry row per token (`deviceCache` in querySensorData.ts), and sharing the
    // instance is what makes that cache actually shared across tools in the same request instead
    // of each tool re-fetching `/devices` on its own.
    const sensor = new QuerySensorData();
    handlers.push({
      definition: querySensorDataDefinition,
      // `context` must be forwarded, not dropped: it carries the caller's bearer token, and
      // without it the handler has no credential at all and refuses with a coded 401. It used to
      // fall back to the deployment's `DEVICE_API_TOKEN` instead, which on an organization-scoped
      // API answered out of the wrong fleet rather than failing.
      run: (args, context) => sensor.run(args, context),
    });

    // Shares `sensor` for the same reason `get_pod_thresholds` does: one `/devices` TTL cache
    // per token across every tool in a request, and one set of pod names for the model to pass
    // straight back as `device`.
    const listPods = new ListPods({ sensor });
    handlers.push({
      definition: listPodsDefinition,
      run: (args, context) => listPods.run(args, context),
    });

    const podThresholds = new GetPodThresholds({ sensor });
    handlers.push({
      definition: getPodThresholdsDefinition,
      run: (args, context) => podThresholds.run(args, context),
    });

    handlers.push({
      definition: getTurbidityInfoDefinition,
      run: (args, context) => getTurbidityInfo(args, context),
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
export { GetPodThresholds, getPodThresholdsDefinition };
export { getTurbidityInfo, getTurbidityInfoDefinition };
export { ListPods, listPodsDefinition };
export type { SensorQueryParams } from "./querySensorData";
