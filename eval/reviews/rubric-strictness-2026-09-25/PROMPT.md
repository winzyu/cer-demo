# Review request: is the correctness rubric too strict, or would relaxing it move the goalposts?

Paste this whole file as the prompt, and attach `SAMPLE.md` and `ALL_TURNS.md` from the same folder.
If the tool cannot take both files, attach `SAMPLE.md` alone and say in your answer that you did not see `ALL_TURNS.md`.

---

You are reviewing an evaluation of a question-answering assistant, as an independent expert in LLM evaluation and in field water-quality monitoring practice.
I will compare your answer with other independent reviews, so reason from the evidence in the attached files, say where you are uncertain, and do not try to guess what I want to hear.
Both outcomes are acceptable: "the rubric is sound and the model falls short" is as useful a finding as "the rubric asks for more than an answer needs".

## The system

Gilligan is an assistant for field operators who run water-quality sensor pods (dissolved oxygen, pH, conductivity, ORP, turbidity, temperature) in creeks and wells.
Operators ask practical questions such as how to calibrate a probe, whether a reading can be trusted, or what a manual requires.
Answers must be grounded in a small corpus: USGS National Field Manual chapters, an EPA field calibration SOP, probe datasheets and an operator reference sheet.
The answer model is `gpt-oss-120b` at temperature 0 with its default reasoning effort.
It is instructed to answer only from the supplied excerpts, cite them with markers such as `【3†"quoted text"】`, and refuse with a fixed sentence when the excerpts do not answer the question.

## The evaluation

There are 45 two-turn conversations (90 turns) in seven classes: cross-document, deep-in-manual, definitional, follow-up, precedence (operator sheet versus manual), probe-calibration and refusal.
Each turn has a rubric: a `must_contain` list of atomic points and a `must_not` list of specific wrong answers.
The files attached come from the **gold-context** arm: the model was handed the excerpts the rubric was written from, so retrieval is not a factor.

Correctness is scored per turn:

| score | meaning |
|---:|---|
| 2 | Every `must_contain` point is made, and made correctly. |
| 1 | Partially there: some points made, or the right idea stated vaguely or incompletely. |
| 0 | Misses the point, is wrong, or refuses when content was expected. Any `must_not` item appearing makes the turn 0. |

Graders are told to score against the rubric, not their own knowledge, and to ignore style and length.

The pass bars were pre-registered on 2026-07-30, before this rubric set existed: mean correctness at least **1.30 / 2** overall and at least **1.00** in every class.
The written rule is: "Thresholds set after the numbers exist are not a test. If you cannot reach them, say so - that is a finding, not a failure."
The rubrics were written in September 2026 by Claude (Anthropic), working from extracted claims rather than the chunk text, under human supervision, with the instruction that each `must_contain` entry be one atomic, independently checkable claim.
They are not yet human-verified.

## What has been measured

- Gold context, judged twice by a DeepSeek model: mean correctness **1.01 and 1.01**. Pass 1 scores 69 of 90 turns as 1, 10 as 0 and 11 as 2.
- On the turns scored 1, the judge's notes list 1-8 unmet points, most often 1-4. Most read as omissions (the answer is right as far as it goes but leaves points out) rather than errors; 9 of the 10 turns scored 0 are attributed to a `must_not` violation.
- Three versions of the answer prompt stayed within 0.92-1.01 on gold context, which the team read as the prompt lever being exhausted.
- With real retrieval, correctness is 0.58. A reranker that raised retrieval recall from 39.5% to 51.9% moved it only to 0.62, inside judge noise.
- The judge was calibrated against the project owner's own grades: 91% exact agreement on 32 rows its prompt was tuned on, 75% (9 of 12, every disagreement one point, in both directions) on 12 held-out rows. The owner graded 9 of those 12 held-out answers as 1.
- A capture with the answer model's reasoning effort raised to `high` is in progress and not reflected in these files.

## The question

The team is considering whether some `must_contain` points are supplementary (useful elaboration a good answer may omit) rather than core (needed for a correct and safe answer), and whether scoring should distinguish them.
That could be a legitimate correction of an over-specified rubric, or it could be moving the goalposts after seeing results that miss a pre-registered bar.
Help decide which.

## What to do

1. **Assess the sampled turns in `SAMPLE.md`** (16 turns, chosen by hash before any answer was read, with the excerpts the model saw).
   For each turn:
   - Classify every `must_contain` point as **core** (an operator acting on an answer without it could make a wrong or unsafe decision, or the question cannot be said to be answered), **supplementary** (correct and useful but a competent expert answer could reasonably omit it), or **flawed** (not supported by the excerpts, ambiguous, duplicated, or not what the question asks).
   - Check the same for each `must_not` item, and say whether any is unreasonable.
   - Say whether the judge applied the rubric correctly, and what score you would give under the rubric as written.
   - Say what score the answer deserves on the question as an operator would ask it, if that differs, and why.
2. **Scan `ALL_TURNS.md`** for patterns across all 90 turns: classes or fixtures where the rubric looks systematically over- or under-specified, recurring kinds of omission, and turns where the judge looks wrong.
3. **Weigh the goalpost question directly.**
   - What would distinguish a principled rubric correction from goalpost moving here?
   - Is the pre-registered 1.30 bar still meaningful when the rubric's granularity (how many atomic points a turn has) was set later, and a 2 requires every point?
   - If a core/supplementary split is justified, what rule should decide it, who should apply it, and how should it be applied blind to the model's answers (for example before looking at scores, by a different reviewer, or on fresh fixtures)?
   - What would you report as the result under each option, so that no reader is misled?
4. **Name the other explanations** you considered for mean 1.01 on gold context (model capability, answer length habits, prompt, judge strictness, fixture difficulty, question ambiguity) and how much each seems to contribute, as far as the evidence allows.

## Disclosures

- The fixtures and rubrics were written by Claude; if you are Claude, account for same-family bias toward the rubric's framing.
- The judge is DeepSeek (`deepseek-v4-flash`) and the answer model is OpenAI's `gpt-oss-120b`; the three were chosen from different families on purpose.
- This packet and this prompt were also prepared by Claude, in the same project; the sample was chosen mechanically, but the framing is Claude's.

## Answer format

Please answer in this structure so reviews can be compared side by side.

1. **Verdict** in one or two sentences: rubric too strict, rubric sound and model short, or mixed; with a confidence of low, medium or high.
2. **Per-turn table** for the 16 sampled turns, with columns: turn key, number of `must_contain` points, core / supplementary / flawed counts, judge score, your score under the rubric, your score as an operator would judge it, one-line reason.
3. **Point-level totals** across the sample: how many points you rate core, supplementary and flawed.
4. **Patterns** from `ALL_TURNS.md`, with turn keys as evidence.
5. **Goalpost analysis**: your answer to step 3, including a concrete procedure the team could follow if it changes the rubric.
6. **Other explanations** from step 4, ranked.
7. **What you would do next**, in at most five bullets.
8. **Limits** of your review: what you could not check and what would change your mind.
