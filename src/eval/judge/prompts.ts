/**
 * The judge's prompts — one per dimension, and the parser for what comes back.
 *
 * `RETRIEVAL_BAKEOFF.md` §7b fixes the shape of this and the constraints are not stylistic:
 *
 * - **One dimension per call.** A combined "rate this 1-10" prompt collapses distinct failure
 *   modes into one uninformative number, and the two Tier-2 gates (§8b) are thresholded
 *   separately — correctness against a per-class mean, ungrounded claims against a turn rate.
 * - **Blind.** No prompt below names an arm, a retrieval strategy, or how many arms exist. The
 *   judge scores one answer with no sibling to compare it against, so there is no cross-arm
 *   impression for a label to attach to. That is a stronger blind than the human packet's
 *   shuffled A/B/C, which still shows all arms on one sheet.
 * - **Rubric-anchored, not vibes.** The scale below is `GRADING_GUIDE.md` §3 verbatim, because
 *   the judge is calibrated against humans who were handed exactly that text.
 *
 * The two count dimensions ask the model to **enumerate then count**, never to emit a number.
 * A bare count is unauditable and models are poor at it; a list is checkable by a human reading
 * the report, and its length is the count.
 */
import type { EvalRubric } from "../types";

export type JudgeDimension = "correctness" | "ungrounded" | "citations";

export const JUDGE_DIMENSIONS: readonly JudgeDimension[] = ["correctness", "ungrounded", "citations"];

/** What one turn of one arm looks like to the judge. Arm identity is deliberately absent. */
export interface JudgeEvidence {
  question: string;
  answer: string;
  rubric: EvalRubric;
  /** The retrieval context supplied for this turn, in the order the model saw it. */
  context: { id: string; text: string }[];
  /** The system prompt the answer was generated under — operator ranges and service rules. */
  systemPrompt: string;
  /** Earlier turns of this conversation, oldest first. */
  history: { question: string; answer: string }[];
}

const JSON_ONLY = "Reply with one JSON object and nothing else. No prose, no code fences.";

const bullets = (items: readonly string[]): string => (
  items.length === 0 ? "(none)" : items.map((item) => `- ${item}`).join("\n")
);

const rubricBlock = (rubric: EvalRubric): string => [
  "MUST CONTAIN:",
  bullets(rubric.must_contain),
  "",
  "MUST NOT:",
  bullets(rubric.must_not ?? []),
  ...(rubric.cite?.length ? ["", "SHOULD CITE:", bullets(rubric.cite)] : []),
  ...(rubric.notes ? ["", `RUBRIC NOTES: ${rubric.notes}`] : []),
].join("\n");

const historyBlock = (history: JudgeEvidence["history"]): string => (
  history.length === 0
    ? "(this is the first turn)"
    : history
      .map((h, i) => `Turn ${i + 1} user: ${h.question}\nTurn ${i + 1} assistant: ${h.answer}`)
      .join("\n\n")
);

const contextBlock = (context: JudgeEvidence["context"]): string => (
  context.length === 0
    ? "(no documents were retrieved for this turn)"
    : context
      .map((chunk, i) => `[${i + 1}] source: ${chunk.id}\n${chunk.text}`)
      .join("\n\n---\n\n")
);

/**
 * The same context, grouped by the **document** each chunk came from.
 *
 * The citation dimension judges documents, not chunks — see `citationsPrompt`. Two chunks of the
 * same PDF are two context entries and one source, and a claim supported by either is supported
 * by the document both markers name. Presenting them ungrouped is what made the judge report a
 * citation invalid because the claim sat in the *next* chunk of the file it pointed at.
 */
const groupedContextBlock = (context: JudgeEvidence["context"]): string => {
  if (context.length === 0) {
    return "(no documents were retrieved for this turn)";
  }
  const bySource = new Map<string, { entries: number[]; texts: string[] }>();
  context.forEach((chunk, i) => {
    const group = bySource.get(chunk.id) ?? { entries: [], texts: [] };
    group.entries.push(i + 1);
    group.texts.push(chunk.text);
    bySource.set(chunk.id, group);
  });
  return [...bySource.entries()]
    .map(([source, group]) => (
      `DOCUMENT: ${source}\ncited by marker(s): ${group.entries.map((e) => `[${e}]`).join(" ")}`
      + `\n\n${group.texts.join("\n\n")}`
    ))
    .join("\n\n=====\n\n");
};

/**
 * Does this turn's rubric ask whether the answer made something up?
 *
 * A `must_not` like *"invents a numeric range"* or *"answers from general knowledge"* is not
 * decidable from the rubric alone — it is a claim about what the supplied material contains, and
 * a judge without that material can only guess. Measured, it guessed wrong: on
 * `deepmanual-stabilization-criteria` turn 1 it scored two arms 0 for "inventing" the `>100 TU`
 * row of Table 6.8-5, which is verbatim in the source. Both of the calibration's distance-2
 * correctness disagreements were this one defect.
 *
 * 25 of the fixtures' 110 distinct `must_not` items match. The other 85 — "declares the reading
 * normal", "concludes saltwater intrusion" — are decidable from the answer alone and stay cheap,
 * which is why this is a predicate rather than a blanket "always send the context": on direct-feed
 * the slice is ~11K tokens a call, and `GRADING_GUIDE.md` §3's rule that correctness is scored
 * against the rubric and not the source text is right everywhere it applies.
 */
const INVENTION_CHECK = /\b(invents?|inventing|fabricates?|fabricating)\b|not in the context|absent from|not supported by|from general knowledge|not derivable|not present in/i;

export const needsGroundingForCorrectness = (rubric: EvalRubric): boolean => (
  (rubric.must_not ?? []).some((item) => INVENTION_CHECK.test(item))
);

/**
 * Correctness — 0/1/2 against the turn's rubric.
 *
 * **The retrieval context is withheld unless the rubric needs it.** `GRADING_GUIDE.md` §3 tells
 * the human to score against the rubric and *not* against their own knowledge or the source text:
 * "if an answer is true but does not make the points the rubric lists, it is not a 2". Supplying
 * the context invites the judge to grade truth instead of rubric coverage, which is a different
 * measurement — and it would triple the input tokens of a dimension that mostly does not need
 * them.
 *
 * **Refusals are graded on behaviour, not phrasing** (2026-08-26). A rubric point asking for a
 * refusal is satisfied by an answer that declines and names what it lacks, in any wording. The
 * judge previously read "refuses using the exact refusal sentence" literally and scored such
 * answers 1 where the human scored 2 — but Tier 1's refusal gate vetoes on *answering*, not on
 * wording (`RETRIEVAL_BAKEOFF.md` §8b), so the judge was stricter than the pre-registration it
 * was supposed to implement. Two tiers measuring different things and reporting one number is the
 * defect; the fixture rubrics now say "any wording" so the instrument and the rule agree.
 *
 * Note what this is *not*: it is not a decision that wording does not matter. Whether the service
 * should emit a fixed sentence is a system-prompt question, and enforcing it is Tier 1's job,
 * where it is free and deterministic. Paying a judge to re-check a string match would be the
 * wrong instrument even if the answer were yes.
 *
 * The exception, added 2026-08-26 after the first calibration: a `must_not` phrased as an
 * invention check is *unjudgeable* without the material (see `needsGroundingForCorrectness`). For
 * those turns the source documents are supplied and the judge is told what they are for — deciding
 * that one rule, not re-grading the answer's truth.
 */
export const correctnessPrompt = (evidence: JudgeEvidence): string => `You are grading one answer
from a water-quality assistant against a fixed rubric. Grade only what the rubric asks for.

SCALE:
2 = every "must contain" point is made, and made correctly.
1 = partially there — some points made, or the right idea stated vaguely or incompletely.
0 = misses the point, is wrong, or refuses when the rubric expected a real answer.

RULES:
- Score against the rubric, not against your own knowledge. A true answer that does not make the
  rubric's points is not a 2.
- If any "must not" item appears in the answer, the score is 0 regardless of everything else.
- Judge each "must not" item on its own terms. Do not invent additional ones.
- A refusal scores 0 when the rubric expected content, and 2 when the rubric asked for a refusal.
- Wording is not part of a refusal rubric. When a rubric asks for a refusal, an answer that
  declines and says what it lacks satisfies that point in full, whether or not it uses the
  service's standard refusal sentence.
- Ignore style, tone, formatting and length. A blunt correct answer and an elegant correct answer
  score the same.

${needsGroundingForCorrectness(evidence.rubric) ? `SOURCE DOCUMENTS SUPPLIED TO THE ANSWER
These are here for ONE purpose: this turn's "must not" list asks whether the answer made
something up, and that cannot be decided without them. A figure, range, procedure or statement
that appears anywhere below — or in the operator-provided normal ranges the assistant is
instructed to apply — was NOT invented, even if the rubric does not mention it. Do not otherwise
grade the answer against these documents: an answer can be entirely true and still miss the
rubric's points, and that is still not a 2.

${contextBlock(evidence.context)}

` : ""}CONVERSATION SO FAR:
${historyBlock(evidence.history)}

QUESTION BEING GRADED:
${evidence.question}

RUBRIC:
${rubricBlock(evidence.rubric)}

ANSWER:
${evidence.answer}

${JSON_ONLY}
{"score": 0 | 1 | 2, "reason": "<one sentence, naming the rubric points made or missed>"}`;

/**
 * Ungrounded claims — enumerate, do not count.
 *
 * **The grounding is wider than the retrieval context, and this is the expensive lesson of
 * §8b.** The Tier-1 checker's first run reported ~24 fabricated figures per arm, and most were
 * the system prompt's own operator ranges quoted back correctly, plus figures the *user* supplied
 * in the question. A judge told "context only" reproduces that error at scale and at cost, so all
 * three sources are supplied and named.
 *
 * Prior *assistant* answers are shown for pronoun resolution but excluded from grounding by an
 * explicit rule — otherwise a model that invented a number on turn 1 grounds itself on turn 2.
 */
export const ungroundedPrompt = (evidence: JudgeEvidence): string => `You are auditing one answer
from a water-quality assistant for claims it had no grounds to make.

List every specific factual claim in the answer that is NOT supported by the supplied material
below. A claim is a number, threshold, range, unit, procedure, mechanism or attribution stated as
fact.

WHAT COUNTS AS GROUNDED — any one of these three is enough:
- The RETRIEVED DOCUMENTS section.
- The SERVICE RULES section. The operator-provided normal ranges in it are legitimate grounding;
  an answer quoting them back is grounded, not inventing.
- A figure the user supplied in their own question, in this turn or an earlier one.
Arithmetic on supplied numbers is grounded, including a degC/degF conversion of a supplied
temperature. A previous ASSISTANT answer is NOT grounding — an earlier invention does not become
a fact by being repeated.

DO NOT LIST:
- General phrasing, restatement of the question, hedging, or an offer to help further.
- A refusal, or a statement that the assistant lacks the information.
- A missing citation. That is a different dimension.
- Something you believe is true but cannot find in the supplied material. The question is not
  "is this true" — it is "did the assistant have grounds to say it".

SERVICE RULES (the standing instructions this answer was generated under):
${evidence.systemPrompt}

RETRIEVED DOCUMENTS (the retrieval context supplied for this turn):
${contextBlock(evidence.context)}

CONVERSATION SO FAR:
${historyBlock(evidence.history)}

QUESTION:
${evidence.question}

ANSWER BEING AUDITED:
${evidence.answer}

${JSON_ONLY}
{"claims": [{"claim": "<the unsupported words, quoted from the answer>",
"why": "<what you searched the supplied material for and did not find>"}]}
An answer with nothing unsupported returns {"claims": []}.`;

/**
 * Citation support — the judgement half of §8a's citation gate.
 *
 * §8b split this deliberately: the Tier-1 checker decides *resolution* (does `[9]` exist when
 * five chunks were supplied), and §8a's actual wording — "the cited document must actually
 * contain the claim" — has a support half no string match settles. That half is here. The judge
 * is told to assume resolution so the two instruments cannot double-count one defect.
 *
 * **It judges documents, not line ranges — corrected 2026-08-26.** The first calibration put this
 * dimension at Cohen's kappa **−0.06**, worse than chance, and every disagreement was the same
 * shape: the judge called `【5†L1-L4】` invalid because lines 1-4 of that chunk are introductory,
 * while the claim sits further down the same file. The human was never asked about line spans —
 * `GRADING_GUIDE.md` §3 says "citations that point at a document which **does not actually
 * contain the claim**", and §8a's own wording agrees. So the narrower reading was the judge's
 * invention, not the rubric's, and correcting it is a correction *to the pre-registered
 * definition* rather than a threshold moved to chase agreement.
 *
 * The line spans are unreliable and separately known to be so: across the warm sweep, 48 of the
 * 103 spans start at line 1 while the median chunk is 77 lines. That is a real model-behaviour
 * finding, recorded in `RETRIEVAL_COMPARISON.md` — it is simply not this gate's business, and it
 * is not decidable by judgement anyway. The durable fix is quote-based citations, which a string
 * match can verify and which would move this dimension into Tier 1 for free. That needs a system
 * prompt change, so it waits for ◆G7 to close.
 */
export const citationsPrompt = (evidence: JudgeEvidence): string => `You are checking whether this
answer's citations support what they are attached to.

The answer cites sources as markers like [1] or [1 L4-L9]. The number identifies a document; the
answer may also cite by filename.

For each citation, decide whether the document it points at actually contains the claim in the
sentence carrying it. List only the ones that do not.

RULES:
- **Ignore the line numbers.** A marker such as [5 L1-L4] is unreliable about *where* in the
  document the support sits, and that is checked separately. Treat it as naming the DOCUMENT the
  marker belongs to, and ask only whether that document supports the claim ANYWHERE in the text
  shown for it below — including passages far from any line range the marker mentions.
- Assume every marker's number resolves to a document. Whether the index exists is checked
  separately; do not report it here.
- A citation is invalid only when the claim is absent from the document it names, or is supported
  instead by a DIFFERENT document. Pointing at the right document with the wrong line range is
  valid.
- A missing citation is not an invalid one. Do not list claims that carry no citation.
- The cited document must support the specific claim, not merely the general topic.
- A citation on a paraphrase is fine if the document supports the paraphrase.

RETRIEVED DOCUMENTS, grouped by document. Every marker listed under a document points at that
document, and the whole text shown for it counts as its content:
${groupedContextBlock(evidence.context)}

ANSWER:
${evidence.answer}

${JSON_ONLY}
{"invalid": [{"marker": "<the citation as written>",
"why": "<the claim it is attached to, and what the cited document says instead>"}]}
An answer whose citations all check out returns {"invalid": []}.`;

export const PROMPT_BUILDERS: Record<JudgeDimension, (evidence: JudgeEvidence) => string> = {
  correctness: correctnessPrompt,
  ungrounded: ungroundedPrompt,
  citations: citationsPrompt,
};

export interface JudgeVerdict {
  /** Correctness only. */
  score?: number;
  /** The enumerated findings for the two count dimensions; `items.length` is the count. */
  items: { text: string; why: string }[];
  /** One line for the `notes` column. Commas are stripped — they break the score CSV. */
  note: string;
}

/**
 * Pulls the verdict out of whatever the model actually emitted.
 *
 * Tolerant on the way in, strict on the way out. Models wrap JSON in prose or code fences often
 * enough that a bare `JSON.parse` would throw away a paid call, so the first balanced-looking
 * object in the reply is extracted. What it must then contain is checked hard: a correctness
 * reply with no numeric `score` in 0..2 throws rather than defaulting, because a silent default
 * is a fabricated grade and this feeds a pre-registered gate.
 */
export const parseVerdict = (dimension: JudgeDimension, reply: string): JudgeVerdict => {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`no JSON object in judge reply: ${reply.slice(0, 200)}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`unparseable judge reply: ${(error as Error).message}`);
  }

  const clean = (value: unknown): string => String(value ?? "")
    .replace(/[,\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (dimension === "correctness") {
    const score = Number(parsed.score);
    if (!Number.isInteger(score) || score < 0 || score > 2) {
      throw new Error(`judge returned score ${JSON.stringify(parsed.score)}, expected 0, 1 or 2`);
    }
    return { score, items: [], note: clean(parsed.reason) };
  }

  const listKey = dimension === "ungrounded" ? "claims" : "invalid";
  const textKey = dimension === "ungrounded" ? "claim" : "marker";
  const raw = parsed[listKey];
  if (!Array.isArray(raw)) {
    throw new Error(`judge returned no "${listKey}" array; got ${Object.keys(parsed).join(", ")}`);
  }

  const items = raw.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return { text: clean(row[textKey]), why: clean(row.why) };
  });

  return {
    items,
    note: items.map((item) => `${item.text} — ${item.why}`).join("; "),
  };
};
