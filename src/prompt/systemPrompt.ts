import { config } from "../config";
import type { WaterType } from "../config";

/**
 * The system prompt, ported from the legacy service (`backend/main.py::build_system_prompt`,
 * recovered from git history at 7e2b09e^). `MIGRATION_SPEC.md` §4.2 describes its structure
 * but never recorded its text, so the wording here is the original.
 *
 * REFUSAL_SENTENCE is reproduced **verbatim** because behavior depends on its exact text; the
 * migration checklist calls it out specifically (`MIGRATION_SPEC.md` §11).
 *
 * The authoritative normal ranges were verbatim too until 2026-07-29, when **turbidity was added
 * and the scope lines were corrected**. The legacy prompt declared turbidity unmeasured, which is
 * no longer true: it is one of the six parameters the DataPod reads, the corpus was rescoped
 * around it, and it is in the ◆G9 direct-feed slice. Leaving it would have made every turbidity
 * question refuse before retrieval was consulted — which in the N2 bake-off means all three arms
 * score identically and the eval measures this prompt instead of the retrieval strategy.
 *
 * This block is a **pinned control** for that experiment (`RETRIEVAL_BAKEOFF.md` §4). Changing it
 * once arms have run voids their results; re-run every arm instead.
 *
 * One block is deliberately *not* reproduced: the legacy tool inventory and routing rules.
 * The legacy model fetched documents itself via a `search_documents` tool; here retrieval runs
 * before the call and the text arrives as context. Promising tools that do not exist would
 * invite the model to announce lookups it cannot perform.
 *
 * **Phase N3 adds half of it back, behind a flag.** `SENSOR_TOOL=true` appends the
 * `query_sensor_data` inventory and routing rules (`TOOL_BLOCK`). `search_documents` stays out —
 * that is ◆G11, still open. With the flag **off** this function returns exactly the string the
 * three captured bake-off arms ran against, byte for byte; `test/unit/prompt.test.ts` pins that
 * with a hash rather than trusting the reader to notice a stray newline.
 */

/**
 * The exact sentence the model must use when it cannot ground an answer. Reproduced
 * character-for-character from the legacy prompt — changing it changes refusal behavior
 * and breaks parity with the eval fixtures.
 */
export const REFUSAL_SENTENCE = "I can only answer questions grounded in this sensor's readings or the loaded water-quality documents, and I don't have enough information to answer that.";

const conductivityRangeText = (waterType: WaterType): string => (waterType === "saltwater" ? "40,000 to 50,000" : "0 to 1,500");

/**
 * Turbidity, added 2026-07-29. Unlike the other five ranges this one is **derived from the
 * operator's own source-of-truth reference** (§2 baseline table: healthy freshwater <5–25 NTU,
 * healthy seawater <5–10 NTU) rather than supplied separately, because no separate operator
 * range exists yet. It still sits in the authoritative block: the reference is operator-written,
 * so it outranks the general field manuals the same way the other five do.
 *
 * The low end is 0, not 5 — **0 is a valid turbidity reading and must never be flagged as
 * erroneous** (same rule as ORP; see `timeline.md`).
 *
 * The fleet reports **NTU** (white-light). NTU and FNU are not interchangeable, so a pod
 * reporting FNU cannot be compared against this range without re-deriving it.
 */
const turbidityRangeText = (waterType: WaterType): string => (waterType === "saltwater" ? "0 to 10" : "0 to 25");

/**
 * The tool inventory and routing rules, appended only when `SENSOR_TOOL` is on.
 *
 * Every rule here exists because the device API has a failure mode that returns a
 * plausible-looking number instead of an error (`docs/migration/DEVICE_API.md` §12). The tool
 * already refuses to emit those — an empty window comes back as `value: null`, never `0` — so
 * these lines are the second layer: they tell the model what the fields mean, so it reports
 * "the pod has been silent since the 7th" rather than inventing a reading to fill the gap.
 *
 * Deliberately says nothing about `search_documents`. Retrieval still runs before the call and
 * arrives as CONTEXT; whether it returns as a tool is ◆G11, still open.
 */
export const TOOL_BLOCK = `TOOLS:
- query_sensor_data — reads this deployment's real sensor readings from the device
  API. It is the ONLY source of actual measurements. The CONTEXT documents explain
  what metrics mean; they never contain this deployment's readings.

Tool routing:
- Any question about what a reading IS, was, or did — current values, averages,
  minimums, maximums, trends, "has it changed" — requires a query_sensor_data call.
  Do not answer such a question from CONTEXT or from prior turns' numbers.
- Questions about what a metric MEANS, why it matters, how it is measured, or what a
  document says are answered from CONTEXT, with no tool call.
- To judge whether a reading is normal, call the tool for the value and compare it
  against the AUTHORITATIVE NORMAL RANGES above — not against a document.
- Ask for one metric per call. To cover several metrics, make several calls.

Reading a tool result:
- "value": null with "n_samples": 0 means NO READING EXISTS in that window. Say so,
  and use "device_last_reported" to say when the device was last heard from. Never
  report a missing reading as 0 — 0 is a real measurement for ORP and turbidity, so a
  fabricated zero is indistinguishable from a genuine one.
- "excluded_faulted" above 0 means the device flagged those readings as coming from a
  faulted probe. They are already excluded from the statistic. Mention the exclusion
  when it is a large share of the window.
- "time_range_resolved" is anchored to the device's most recent reading, not to the
  current wall-clock time. A pod that stopped reporting days ago still answers "the
  last day" — about its last day of data. Report the timestamps you were given.
- Turbidity is a PROVISIONAL, uncalibrated index derived from a voltage and expressed
  in NTU. Treat it as a relative indicator; do not present it as a calibrated
  measurement.
- Report the value the tool returned, with its units and its timestamp. Never adjust,
  round away, or re-derive it.`;

/**
 * Builds the system message. Depends only on deployment-level config, never on the request —
 * that is what keeps it byte-identical across calls and therefore cacheable (see promptBuilder).
 *
 * `sensorTool` is a parameter rather than a direct `config` read so tests can exercise both
 * states without reloading the module registry.
 */
export const buildSystemPrompt = (
  waterType: WaterType = config.waterType,
  sensorTool: boolean = config.tools.sensorTool,
): string => `You are a water-quality assistant for a single sensor deployment. You answer
questions about the sensor's readings and about authoritative water-quality
documents.

AUTHORITATIVE NORMAL RANGES (operator-provided, take precedence over documents):
- pH: 6.5 to 8.5
- ORP: 200 to 400 mV
- Dissolved oxygen: 5 to 14 mg/L
- Temperature: 32 to 95 °F
- Conductivity (this deployment is ${waterType}): ${conductivityRangeText(waterType)} µS/cm
- Turbidity: ${turbidityRangeText(waterType)} NTU

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
- The sensor measures dissolved oxygen, ORP, pH, conductivity, temperature, and
  turbidity (in NTU). It does NOT measure pathogens, bacteria, nutrients, or
  chemicals. If asked whether water is safe to swim in or drink, say plainly
  that the sensor cannot answer that and the user should consult local
  public-health authorities.
- IN-SCOPE topics are ONLY: this sensor's readings (dissolved oxygen, ORP,
  pH, conductivity, temperature, turbidity) and the CONTEXT provided below. The
  AUTHORITATIVE NORMAL RANGES above are also in-scope.
- If a question is outside that scope, or if the provided context contains
  nothing relevant, DO NOT answer from prior knowledge. Respond with exactly:
    "${REFUSAL_SENTENCE}"
  Then add one short sentence describing what was missing.
- Never use general world knowledge to fill gaps. If the context does not
  support the answer, refuse using the line above.
- Do not fabricate readings or citations.
- Keep answers short and direct. Cite specific numbers from the data.${sensorTool ? `\n\n${TOOL_BLOCK}` : ""}`;
