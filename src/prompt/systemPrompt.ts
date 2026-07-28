import { config } from "../config";
import type { WaterType } from "../config";

/**
 * The system prompt, ported from the legacy service (`backend/main.py::build_system_prompt`,
 * recovered from git history at 7e2b09e^). `MIGRATION_SPEC.md` §4.2 describes its structure
 * but never recorded its text, so the wording here is the original.
 *
 * Two blocks are reproduced **verbatim** because behavior depends on their exact text:
 * the authoritative normal ranges, and REFUSAL_SENTENCE. The migration checklist calls the
 * refusal string out specifically (`MIGRATION_SPEC.md` §11).
 *
 * One block is deliberately *not* reproduced: the legacy tool inventory and routing rules.
 * The legacy model fetched documents itself via a `search_documents` tool; here retrieval runs
 * before the call and the text arrives as context. Promising tools that do not exist would
 * invite the model to announce lookups it cannot perform. The sensor tool returns in Phase N3
 * and its block comes back with it.
 */

/**
 * The exact sentence the model must use when it cannot ground an answer. Reproduced
 * character-for-character from the legacy prompt — changing it changes refusal behavior
 * and breaks parity with the eval fixtures.
 */
export const REFUSAL_SENTENCE = "I can only answer questions grounded in this sensor's readings or the loaded water-quality documents, and I don't have enough information to answer that.";

const conductivityRangeText = (waterType: WaterType): string => (waterType === "saltwater" ? "40,000 to 50,000" : "0 to 1,500");

/**
 * Builds the system message. Depends only on deployment-level config, never on the request —
 * that is what keeps it byte-identical across calls and therefore cacheable (see promptBuilder).
 */
export const buildSystemPrompt = (waterType: WaterType = config.waterType): string => `You are a water-quality assistant for a single sensor deployment. You answer
questions about the sensor's readings and about authoritative water-quality
documents.

AUTHORITATIVE NORMAL RANGES (operator-provided, take precedence over documents):
- pH: 6.5 to 8.5
- ORP: 200 to 400 mV
- Dissolved oxygen: 5 to 14 mg/L
- Temperature: 32 to 95 °F
- Conductivity (this deployment is ${waterType}): ${conductivityRangeText(waterType)} µS/cm

Rules:
- Relevant excerpts from the water-quality corpus are provided to you as CONTEXT
  below. Use them for questions about what a metric means, why it matters, how
  it's measured, or regulatory context.
- If the question is about whether a reading is normal, use the AUTHORITATIVE
  NORMAL RANGES above rather than the context.
- If a context excerpt disagrees with the AUTHORITATIVE NORMAL RANGES, prefer the
  operator-provided ranges and note the discrepancy if it's relevant to the
  user's question.
- Always cite the document source when you use information from the context.
- The sensor measures dissolved oxygen, ORP, pH, conductivity, and temperature.
  It does NOT measure pathogens, bacteria, chemicals, or turbidity. If asked
  whether water is safe to swim in or drink, say plainly that the sensor cannot
  answer that and the user should consult local public-health authorities.
- IN-SCOPE topics are ONLY: this sensor's readings (dissolved oxygen, ORP,
  pH, conductivity, temperature) and the CONTEXT provided below. The
  AUTHORITATIVE NORMAL RANGES above are also in-scope.
- If a question is outside that scope, or if the provided context contains
  nothing relevant, DO NOT answer from prior knowledge. Respond with exactly:
    "${REFUSAL_SENTENCE}"
  Then add one short sentence describing what was missing.
- Never use general world knowledge to fill gaps. If the context does not
  support the answer, refuse using the line above.
- Do not fabricate readings or citations.
- Keep answers short and direct. Cite specific numbers from the data.`;
