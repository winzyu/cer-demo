/**
 * The three machine-decidable gates from `RETRIEVAL_BAKEOFF.md` §8a, as pure functions over one
 * captured turn.
 *
 * These are §8a's **hard** gates: an arm failing one is out at any price, which is exactly why
 * they are worth deciding deterministically and first (§8b). Nothing here judges whether an answer
 * is *good* — that is the LLM judge's two gates, and no amount of string matching substitutes.
 *
 * Every function returns evidence, not just a boolean. A gate that says "fail" without naming the
 * figure or the citation is unactionable, and a gate nobody can act on gets ignored.
 */
import { REFUSAL_SENTENCE } from "../../prompt/systemPrompt";
import {
  closestWindow,
  describeChar,
  firstDivergence,
  normalizeForMatch,
  tokenSimilarity,
} from "./normalize";

/** One captured turn, as `eval/transcripts/**` stores it. */
export interface TurnEvidence {
  answer: string;
  context: { id: string; text: string }[];
  toolResults?: unknown[];
  /**
   * Everything else the model legitimately had: the system prompt and the conversation so far.
   *
   * **Not optional in practice.** The first run of this checker over the captured sweep reported
   * 24 fabricated figures per arm, and the majority were the system prompt's own
   * `AUTHORITATIVE NORMAL RANGES` block — pH 6.5-8.5, DO 5-14 mg/L, conductivity 0-1,500 µS/cm —
   * quoted back correctly. A transcript's `context` field holds *retrieval* context only, so a
   * checker that treats it as the whole grounding accuses an arm of inventing the operator ranges
   * it was told to apply. Question text belongs here too: a user who says "pH 8.4" has supplied
   * that figure.
   */
  grounding?: string[];
}

// ---------------------------------------------------------------------------------------------
// Gate 1 — refusal integrity (§8a: 100%, absolute)
// ---------------------------------------------------------------------------------------------

export type RefusalMatch = "exact" | "normalized" | "tolerance" | "absent";

export interface RefusalResult {
  match: RefusalMatch;
  /** Edit distance from the pinned sentence to the closest window of the answer, after folding. */
  distance: number;
  /** Jaccard term overlap against the pinned sentence, for reading a failure at a glance. */
  similarity: number;
  /** Human-readable account of *why* it was not an exact match. Empty when it was. */
  note: string;
}

/**
 * Default edit-distance tolerance, applied **after** normalisation.
 *
 * Two is a deliberate belt-and-braces number, not a fitted one: normalisation is expected to
 * account for every difference the transcripts actually contain, so anything reaching the
 * tolerance layer is a surprise worth reporting. It is reported as its own outcome and **never**
 * folded into an exact pass, because §8a fixed refusal integrity at 100% before any arm ran and a
 * tunable threshold silently deciding an absolute gate would hollow that out.
 */
export const REFUSAL_TOLERANCE = 2;

/**
 * Does this answer contain the pinned refusal sentence?
 *
 * Four outcomes rather than a boolean, because they mean different things to whoever reads the
 * report. `exact` is clean. `normalized` means the model emitted a visually identical variant —
 * measured, this is the common case: the transcripts contain U+2011 NON-BREAKING HYPHEN where the
 * constant has U+002D, which NFKC alone does not reconcile. `tolerance` means it was off by a
 * character or two beyond that and a human should look. `absent` is a gate failure.
 */
export const checkRefusal = (
  answer: string,
  tolerance = REFUSAL_TOLERANCE,
): RefusalResult => {
  const similarity = tokenSimilarity(answer, REFUSAL_SENTENCE);

  if (answer.includes(REFUSAL_SENTENCE)) {
    return {
      match: "exact", distance: 0, similarity, note: "",
    };
  }

  const foldedAnswer = normalizeForMatch(answer);
  const foldedSentence = normalizeForMatch(REFUSAL_SENTENCE);

  if (foldedAnswer.includes(foldedSentence)) {
    // Name the character that differed, so the finding is a fact rather than a shrug.
    const at = firstDivergence(answer, REFUSAL_SENTENCE);
    const note = at >= 0
      ? `matched after folding; first raw difference at ${at}: `
        + `answer ${describeChar(answer[at])} vs pinned ${describeChar(REFUSAL_SENTENCE[at])}`
      : "matched after folding";
    return {
      match: "normalized", distance: 0, similarity, note,
    };
  }

  const { distance } = closestWindow(foldedAnswer, foldedSentence, tolerance);

  if (distance <= tolerance) {
    return {
      match: "tolerance",
      distance,
      similarity,
      note: `within ${distance} edit(s) of the pinned sentence after folding — NOT an exact pass`,
    };
  }

  return {
    match: "absent",
    distance,
    similarity,
    note: `no window within ${tolerance} edits; term overlap ${(similarity * 100).toFixed(0)}%`,
  };
};

// ---------------------------------------------------------------------------------------------
// Gate 2 — citation validity (§8a: >=95%)
// ---------------------------------------------------------------------------------------------

/**
 * `gpt-oss` emits citations as `【4†L1-L8】` or bare `【4】`: a 1-based index into the context it was
 * given, optionally with a line span. 168 of the 348 captured turns carry at least one.
 */
const CITATION_PATTERN = /【\s*(\d+)\s*(?:†\s*L(\d+)\s*(?:-\s*L?(\d+))?)?[^】]*】/g;

export interface CitationIssue {
  marker: string;
  reason: string;
}

export interface CitationResult {
  total: number;
  valid: number;
  issues: CitationIssue[];
}

/**
 * Do this answer's citation markers resolve to context that was actually supplied?
 *
 * **This decides resolution, not support.** Whether the cited passage *contains the claim* is a
 * judgement call and belongs to the LLM judge (§8b Tier 2). What is mechanically decidable — and
 * worth deciding, because it is unambiguously a fabrication — is a citation pointing at a document
 * index or a line range that does not exist. `【9】` when five chunks were supplied is an invented
 * source, whatever the sentence around it says.
 */
export const checkCitations = (turn: TurnEvidence): CitationResult => {
  const issues: CitationIssue[] = [];
  let total = 0;

  const matches = turn.answer.matchAll(CITATION_PATTERN);

  Array.from(matches).forEach((match) => {
    total += 1;
    const marker = match[0];
    const index = Number(match[1]);
    const chunk = turn.context[index - 1];

    if (index < 1 || chunk === undefined) {
      issues.push({
        marker,
        reason: `points at context #${index}, but ${turn.context.length} chunk(s) were supplied`,
      });
      return;
    }

    if (match[2] === undefined) {
      return;
    }

    const lines = chunk.text.split("\n").length;
    const from = Number(match[2]);
    const to = match[3] === undefined ? from : Number(match[3]);

    if (from < 1 || to > lines) {
      issues.push({
        marker,
        reason: `cites lines ${from}-${to} of "${chunk.id}", which has ${lines}`,
      });
    }
  });

  return { total, valid: total - issues.length, issues };
};

// ---------------------------------------------------------------------------------------------
// Gate 3 — fabricated figures (§8a: zero, absolute)
// ---------------------------------------------------------------------------------------------

/** Numbers, with thousands separators and decimals. Signs are handled by the surrounding text. */
const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

/** Markdown ordinals (`1.`, `2)`) and citation markers are structure, not claims. */
const STRUCTURE = [/【[^】]*】/g, /^\s{0,3}\d+[.)]\s/gm, /^#{1,6}\s.*$/gm];

export interface FigureIssue {
  value: string;
  context: string;
  explained?: string;
}

export interface FigureResult {
  total: number;
  supported: number;
  issues: FigureIssue[];
}

const stripStructure = (text: string): string => STRUCTURE
  .reduce((acc, pattern) => acc.replace(pattern, " "), text);

const canonical = (value: string): string => value.replace(/,/g, "").replace(/\.0+$/, "");

/**
 * Is every numeric literal in this answer traceable to the material the model was given?
 *
 * §8a calls a fabricated figure "the failure mode that matters" in a water-quality tool, and makes
 * it a zero-tolerance gate — refusing is always available, so the slice is never an excuse.
 *
 * A figure counts as supported when its canonical digits appear anywhere in the supplied context
 * or a tool result. That is deliberately generous: this gate is here to catch invention, and a
 * false accusation costs more than a missed borderline case, since every finding is meant to be
 * read by a human.
 *
 * ponytail: digit-string containment plus a °C/°F check. It does not model unit algebra, so a
 * legitimately *derived* number — a mean the model computed, mg/L scaled to µg/L — is reported as
 * unexplained rather than passed. Upgrade path if that noise becomes the dominant finding: feed
 * `tool_calls` results in as a whitelist (the parameter is already here and empty for the bake-off
 * sweeps, which ran with `SENSOR_TOOL` off), then add a scaling check.
 */
export const checkFigures = (turn: TurnEvidence): FigureResult => {
  const source = normalizeForMatch([
    ...turn.context.map((chunk) => chunk.text),
    ...(turn.toolResults ?? []).map((result) => JSON.stringify(result)),
    ...(turn.grounding ?? []),
  ].join("\n"));

  // Both spellings, because thousands separators are not written consistently across the sources:
  // the system prompt says `0 to 1,500 µS/cm` and answers say `0-1500`. Stripping only the
  // answer's separators reported that range as fabricated — the same asymmetry in the other
  // direction would miss `200,000` quoted verbatim from a datasheet.
  const haystack = `${source}\n${source.replace(/,/g, "")}`;

  const supportedIn = (value: string): boolean => (
    haystack.includes(canonical(value)) || haystack.includes(value.toLowerCase())
  );

  /** The decoder normalises °C -> °F, so an answer may hold a number its context does not. */
  const explainedByConversion = (value: string): string | undefined => {
    const asNumber = Number(canonical(value));
    if (!Number.isFinite(asNumber)) {
      return undefined;
    }
    const candidates = [
      { label: "°C→°F", of: (asNumber - 32) * (5 / 9) },
      { label: "°F→°C", of: asNumber * (9 / 5) + 32 },
    ];
    return candidates.find(({ of }) => (
      [of.toFixed(0), of.toFixed(1), of.toFixed(2)].some((form) => haystack.includes(form))
    ))?.label;
  };

  const body = stripStructure(turn.answer);
  const found = Array.from(body.matchAll(NUMBER_PATTERN));
  const issues: FigureIssue[] = [];

  found.forEach((match) => {
    const value = match[0];
    if (supportedIn(value)) {
      return;
    }
    const start = Math.max(0, (match.index ?? 0) - 40);
    issues.push({
      value,
      context: body
        .slice(start, (match.index ?? 0) + value.length + 40)
        .replace(/\s+/g, " ")
        .trim(),
      explained: explainedByConversion(value),
    });
  });

  return { total: found.length, supported: found.length - issues.length, issues };
};
