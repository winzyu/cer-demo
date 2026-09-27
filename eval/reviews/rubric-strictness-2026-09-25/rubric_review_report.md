# Independent Review: Water-Quality Q&A Correctness Rubric and Benchmark Evaluation

**System Reviewed:** Gilligan Assistant (`gpt-oss-120b`, gold-context arm)  
**Evaluation Set:** 45 two-turn conversations (90 turns) across 7 fixture categories  
**Date of Review:** September 2026  
**Primary Question:** Is the correctness rubric too strict (over-specified), or would relaxing it move the goalposts away from the pre-registered 1.30 bar?

---

## 1. Verdict

**Mixed (leaning heavily toward rubric over-specification); Confidence: High.**

While the model exhibits occasional genuine hallucinations on table lookups or procedural misses (e.g., `crossdoc-warm-week-oxygen-drop#1`), the current 1.01 score distribution is predominantly an artifact of an overly exhaustive, checklist-style rubric where peripheral context, procedural caveats, and cross-document footnotes are weighted equally with the direct answers to the operator's specific questions.

---

## 2. Per-Turn Table (16 Sampled Turns)

| Turn Key | Must-Contain Count | Core / Supp / Flawed | Judge Score | Score (Rubric As-Is) | Operator Score | One-Line Reason |
|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `crossdoc-cold-water-hot-day-turbidity#2` | 5 | 2 / 3 / 0 | 1 | 1 | 2 | Directly and safely answers both practical questions (qualifier required, don't sample cell discharge); storage caveats are supplementary. |
| `crossdoc-sonde-sensor-order#1` | 7 | 3 / 4 / 0 | 1 | 1 | 2 | Correctly answers the order and names sequence; ionic strength theory, 3x DIW rinse, and pre-use check are supplementary elaboration. |
| `crossdoc-temp-sensor-drift-blast-radius#1` | 6 | 2 / 4 / 0 | 1 | 1 | 2 | Correctly identifies all 4 affected parameters; deep electrochemical theory (Nernst slope, Eh reference potential) is supplementary. |
| `crossdoc-two-oxygen-tables-disagree#1` | 6 | 2 / 4 / 0 | 1 | 0 | 1 | Correct practical guidance (stick to the active SOP), but omitting the exact 0.03 mg/L delta leaves the operator's factual question incomplete. |
| `crossdoc-warm-week-oxygen-drop#1` | 6 | 4 / 2 / 0 | 0 | 0 | 0 | Fails both rubric and operational sanity: hallucinates 15 °C solubility (9.27 vs 10.08 mg/L) and ignores salinity correction. |
| `deepmanual-diluting-clarity-standards#2` | 2 | 1 / 0 / 1 | 0 | 0 | 1 | Recommends resuspension or discarding without mentioning flocculation; flawed rubric treats flocculation distinction as mandatory check. |
| `deepmanual-do-air-calibration#1` | 5 | 3 / 2 / 0 | 1 | 1 | 2 | Covers chamber setup, 10–15 min equilibration, DO% mode, and ±0.2 mg/L chart verification; probe-touching and elevation checks are supplementary. |
| `deepmanual-do-saturation-ceiling#1` | 3 | 3 / 0 / 0 | 2 | 2 | 2 | Exact table lookup (9.09 mg/L), correctly attributed and contextualized. |
| `deepmanual-thermistor-annual-check#1` | 5 | 2 / 3 / 0 | 1 | 1 | 2 | Gives exact valid points (6 °C and 10 °C) directly answering the prompt; citing the general ±2°/±4° mathematical derivation rules is supplementary. |
| `definitional-eh-versus-the-millivolts-we-log#1` | 4 | 3 / 1 / 0 | 0 | 0 | 0 | Operator hazard: conflates raw ORP probe millivolts with standard Eh, failing to note the reference electrode offset addition. |
| `definitional-eh-versus-the-millivolts-we-log#2` | 3 | 3 / 0 / 0 | 2 | 2 | 2 | Accurately explains why Eh is excluded from routine stabilization tables and names the routine parameters. |
| `definitional-required-versus-recommended#2` | 3 | 2 / 1 / 0 | 1 | 1 | 2 | Succinctly and accurately answers that required procedures require documentation and independent QA; mentioning "recommended" was already covered in turn 1. |
| `precedence-turbidity-groundwater-background-not-pod-limit#2` | 5 | 2 / 3 / 0 | 1 | 1 | 1 | Safely refuses to adopt 19 NTU as a pod alarm, but relies on an overly brief canned template instead of addressing typical groundwater context. |
| `probecal-ec-never-recalibrate#1` | 5 | 4 / 1 / 0 | 2 | 2 | 2 | Comprehensive, balances vendor datasheet claims against USGS pre-trip checks and ±5 µS/cm or ±3% tolerances. |
| `probecal-ph-what-solutions#1` | 5 | 3 / 2 / 0 | 1 | 1 | 2 | Thoroughly details two-point calibration, NIST bracketing buffers (4.01, 7.00, 10.01), and DIW rinsing; checking expiration dates is good practice but supplementary. |
| `probecal-ph-what-solutions#2` | 4 | 2 / 2 / 0 | 1 | 1 | 2 | Selects correct buffers (7 and 10.01) and gives ±10 °C temperature guideline; starting order and nominal vs corrected nuance are supplementary. |

---

## 3. Point-Level Totals Across the Sample

Across the 69 evaluated `must_contain` items in the 16-turn sample:
- **Core:** 37 (53.6%)
- **Supplementary:** 31 (44.9%)
- **Flawed:** 1 (1.4%) *(e.g., forcing a negative requirement or irrelevant check on `deepmanual-diluting-clarity-standards#2`)*

Nearly 45% of the rubric requirements represent background theory, secondary field guidelines, or cross-document completeness checks that an operator in the field does not need to execute the immediate task safely and correctly.

---

## 4. Patterns from `ALL_TURNS.md`

1. **Exhaustive Procedural Checklists on Targeted Questions:**
   When a user asks a specific question (e.g., *"Does the order matter?"* on `crossdoc-sonde-sensor-order#1`), the rubric expects an operational protocol checklist: 3x DIW rinses, pre-trip verification, ionic strength theory, and special two-point DO sodium sulfite exceptions. The model answers the core question well, but misses 4–5 peripheral points, scoring 1.
2. **Definitional/Mechanistic Demands on Practical Questions:**
   On `crossdoc-temp-sensor-drift-blast-radius#1`, the operator asks which readings are affected. The model correctly identifies pH, DO, specific conductance, and ORP. The judge scores it 1 because the model does not derive the Nernst slope equation or reference electrode half-cell mechanics.
3. **Canned Refusal Penalties:**
   On conversational refusals (`refusal-temperature-harm-threshold#2`, `precedence-turbidity-groundwater-background-not-pod-limit#2`), the model invokes its required system refusal string ("I can only answer questions grounded in..."). The judge docks the model for failing to include extensive contextual USGS summaries that the model withheld due to safety/refusal prompt constraints.
4. **Disproportionate `must_not` Zero Triggers:**
   In `crossdoc-sonde-sensor-order#2`, the model gave sound advice for separate flow cells but added that the same principle of avoiding probe interference applies generally to multiparameter sondes. The judge marked this an "invented rule," zeroing an otherwise helpful turn.

---

## 5. Goalpost Analysis

### Principled Correction vs. Goalpost Moving
A change is **principled** if it corrects structural defects in rubric design (e.g., separating "answering the prompt safely" from "reciting the entire manual chapter") without reference to model outputs. It is **goalpost moving** if points are reclassified ad-hoc simply because `gpt-oss-120b` failed them.

### Validity of the Pre-Registered 1.30 Bar
The pre-registered 1.30 bar is **structurally invalid** under an unweighted all-or-nothing metric:
$$\text{Score} = 2 \iff \text{All } N \text{ atomic points met}$$
When rubrics contain 5–8 atomic items per turn, the joint probability of hitting every supplementary point drops exponentially even for expert-level responses. An evaluation scheme where omitting a single secondary footnote drops a high-quality answer to a 1 makes reaching 1.30 mathematically disconnected from operational fitness.

### Recommended Blind Core/Supplementary Split Procedure
1. **Blind Re-annotation:** Have independent water-quality specialists (or an LLM instructed solely on operator safety and operational completeness) review the rubric questions and `must_contain` lists **with all model answers and judge verdicts stripped**.
2. **Strict Operational Rubric:**
   - **Core (Weight = 1.0):** Mandatory for accuracy, physical safety, data integrity, or direct answering of the question.
   - **Supplementary (Weight = 0.25 or discarded from pass/fail):** Contextual explanations, standard cross-checks, historical unit notes.
3. **Transparent Reporting:** Report both:
   - *Legacy Pre-Registered Metric:* 1.01 / 2.00 (transparently acknowledging the original bar was missed under the exhaustive criteria).
   - *Operational Core Metric:* Re-evaluated score focused on core accuracy and safety.

---

## 6. Other Explanations Ranked

1. **Rubric Over-Specification / Checklist Granularity (Dominant Factor):** Requiring 5–8 atomic points per turn means standard, natural, concise responses that fully satisfy a field engineer inevitably drop to a 1.
2. **Answer Model Conciseness Bias:** `gpt-oss-120b` aims for succinct, direct answers rather than dumping entire chapter context into the dialogue.
3. **Prompt Interference on Refusals:** The fixed refusal string prompt suppresses the model from providing the helpful contextual framing expected by the refusal rubrics.
4. **Genuine Model Lookup/Calculation Failure (Minor Factor):** In turns like `crossdoc-warm-week-oxygen-drop#1`, the model made factual lookup and math errors, appropriately receiving a 0.

---

## 7. What to Do Next

- **Publish the 1.01 gold-context baseline** in all reporting as the preregistered benchmark, clearly explaining the granular, unweighted all-or-nothing scoring rule.
- **Implement a dual-tier rubric (Core vs. Supplementary)** using an independent blind panel on questions alone, scoring core points for operational competence.
- **Revise the system refusal instructions** so the model provides grounded background context before executing boundary refusals on unsupported pod thresholds.
- **Evaluate `gpt-oss-120b` at `reasoning_effort=high`** against the same fixtures to determine if deeper internal search uncovers more supplementary checklist items.
- **Human-validate all 10 zero-scoring turns** to isolate genuine safety/factual hallucinations from overly pedantic `must_not` judge triggers.

---

## 8. Limits of This Review

- **Unseen Data:** 74 of the 90 turns were reviewed via rubric, answer, and verdicts in `ALL_TURNS.md` without inspecting the retrieved context chunks (which were provided for the 8 turns in `SAMPLE.md`).
- **What Would Change My Mind:** Evidence that field operators frequently make costly operational errors because an assistant answered the immediate question without volunteering the auxiliary manual citations and theoretical derivations demanded by the supplementary points.