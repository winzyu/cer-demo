import { buildCatalogueBlock, guidance } from "../catalogue";
import { config } from "../config";
import { buildSystemPrompt } from "../prompt/systemPrompt";
import type { TranscriptRunMeta } from "./transcript";

/**
 * The system prompt a captured answer was generated under, rebuilt for grading.
 *
 * Captures always run with `SENSOR_TOOL` and `REPORT_TOOL` off (on means live production reads),
 * so both tool blocks stay off here. The catalogue block follows the capture: the run's recorded
 * `cataloguePrompt`, or `CATALOGUE_PROMPT` in the grading process for captures made before the
 * field existed, which must then be set to what the capture's server ran with. Without it the
 * judge and the gates would treat catalogue text the answer was told to use as ungrounded.
 */
export const captureSystemPrompt = (run?: Pick<TranscriptRunMeta, "cataloguePrompt">): string => {
  const catalogueOn = run?.cataloguePrompt ?? config.catalogue.prompt;
  return buildSystemPrompt(false, false, catalogueOn ? buildCatalogueBlock(guidance) : null);
};
