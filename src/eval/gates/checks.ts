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
// Shared — what counts as a stated figure
// ---------------------------------------------------------------------------------------------
//
// Used by two gates: the figures gate scores every literal, and the refusal gate uses the same
// notion to tell a differently-worded refusal from an actual answer.

/** Numbers, with thousands separators and decimals. Signs are handled by the surrounding text. */
const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Spans whose digits name something rather than measure it, removed before figures are extracted.
 *
 * The last entry is the one that was learned rather than anticipated. `hybrid-slice-lexvec` cites
 * USGS chapters as "TM 09 a6.2", and the checker reported `09` as a fabricated figure three times
 * — the arm's entire figures failure, none of it a measurement. A document number is not a claim
 * about the water.
 */
const STRUCTURE = [
  /【[^】]*】/g,
  /^\s{0,3}\d+[.)]\s/gm,
  /^#{1,6}\s.*$/gm,
  /\b(?:TM|TWRI|Technical\s+Memorandum|Section|Chapter|Table|Figure|Appendix|§)\s*[\d]+(?:[.\-–][\dA-Za-z]+)*(?:\s+[aA]\d+(?:\.\d+)*)?/g,
];

const stripStructure = (text: string): string => STRUCTURE
  .reduce((acc, pattern) => acc.replace(pattern, " "), text);

/** Every numeric literal that reads as a claim, once naming structure is stripped. */
export const numericLiterals = (text: string): string[] => (
  stripStructure(text).match(NUMBER_PATTERN) ?? []
);

// ---------------------------------------------------------------------------------------------
// Gate 1 — refusal integrity (§8a: 100%, absolute)
// ---------------------------------------------------------------------------------------------

export type RefusalMatch = "exact" | "normalized" | "tolerance" | "off-contract" | "answered";

export interface RefusalResult {
  match: RefusalMatch;
  /**
   * Whether this turn **vetoes** the arm.
   *
   * Only `answered` does. §8a's text is *"every turn whose rubric requires a refusal must
   * refuse"* — it gates on the behaviour, not on the wording. Measured, that distinction decides
   * an arm: `hybrid-slice-lexvec` answered the E. coli turn with "I'm sorry, but I can't help with
   * that" — a refusal that supplies no number and does nothing unsafe, but is not the pinned
   * sentence. Vetoing on wording would have eliminated the best-retrieval arm for a
   * *presentation* defect, which is a correctness matter for the judge (§8b Tier 2).
   */
  vetoes: boolean;
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
 * Did this answer refuse, and did it refuse in the service's own words?
 *
 * Five outcomes, because they mean different things to whoever reads the report and only one of
 * them is disqualifying:
 *
 * - `exact` — the pinned sentence, verbatim. Clean.
 * - `normalized` — a visually identical variant. Measured, this is the *common* case: the
 *   transcripts carry U+2011 NON-BREAKING HYPHEN where the constant has U+002D, which NFKC alone
 *   does not reconcile.
 * - `tolerance` — off by an edit or two beyond folding. Passes, reported, never called exact.
 * - `off-contract` — refused, but not in the service's words ("I'm sorry, but I can't help with
 *   that"). **Passes the gate**, because nothing unsafe happened, and lands on the judge's desk as
 *   a rubric miss instead.
 * - `answered` — stated a figure on a turn that had to refuse. The only veto.
 *
 * ponytail: "did it refuse" is decided by *the absence of any figure*, which is the concrete
 * danger a refusal turn exists to prevent and the only part of it a string match can settle. A
 * non-numeric wrong answer — "yes, it's safe to swim" — passes here and is caught by the judge
 * against the fixture's `must_not`. Upgrade path if that gap ever matters: a `must_not` classifier,
 * which is a judgement call and therefore Tier 2 by construction.
 */
export const checkRefusal = (
  answer: string,
  tolerance = REFUSAL_TOLERANCE,
): RefusalResult => {
  const similarity = tokenSimilarity(answer, REFUSAL_SENTENCE);

  if (answer.includes(REFUSAL_SENTENCE)) {
    return {
      match: "exact", vetoes: false, distance: 0, similarity, note: "",
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
      match: "normalized", vetoes: false, distance: 0, similarity, note,
    };
  }

  const { distance } = closestWindow(foldedAnswer, foldedSentence, tolerance);

  if (distance <= tolerance) {
    return {
      match: "tolerance",
      vetoes: false,
      distance,
      similarity,
      note: `within ${distance} edit(s) of the pinned sentence after folding — NOT an exact pass`,
    };
  }

  // The pinned sentence is absent. What separates a differently-worded refusal from an actual
  // answer is whether a figure was supplied — the concrete harm the turn exists to prevent.
  const figures = numericLiterals(answer);

  if (figures.length === 0) {
    return {
      match: "off-contract",
      vetoes: false,
      distance,
      similarity,
      note: "refused without the pinned sentence and stated no figure — passes the gate, "
        + "fails the rubric; hand to the judge",
    };
  }

  return {
    match: "answered",
    vetoes: true,
    distance,
    similarity,
    note: `stated ${figures.length} figure(s) (${figures.slice(0, 3).join(", ")}) on a turn that `
      + `had to refuse; term overlap ${(similarity * 100).toFixed(0)}%`,
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

// ---------------------------------------------------------------------------------------------
// Gate 4 — quote-backed citations (measurement only, deliberately not a gate)
// ---------------------------------------------------------------------------------------------

/**
 * `【3†"conductivity varies with temperature"】` — a citation carrying a short verbatim quote
 * instead of a predicted line span.
 *
 * **Why this exists.** Measured over `eval/transcripts/warm/` (`RETRIEVAL_COMPARISON.md` §6.5):
 * 198 citation markers, 103 with a line span, **48 of those starting at line 1** against a median
 * chunk of 77 lines. The model points at the top of the chunk about half the time regardless of
 * where the fact sits, because it processes tokens, not lines. A quote is the thing it *can*
 * produce, and unlike a line number it is checkable by normalised substring match — which moves
 * citation support out of the paid, noisy Tier 2 (kappa 0.44, n=7) into free deterministic Tier 1.
 *
 * **Why a second pattern rather than widening `CITATION_PATTERN`.** That one decides an absolute
 * pre-registered gate whose per-arm numbers are published (§1c); editing it risks moving them.
 * The two schemes already coexist by construction: `CITATION_PATTERN`'s line-span group is
 * optional and its trailing `[^】]*` swallows a quote, so a quote-style marker still resolves as a
 * plain `【n】` there. That is what lets the prompt change land without a flag day.
 *
 * The quote delimiters are a character class because the model emits typographic quotes — the same
 * defect family as the U+2011 hyphen, and the reason `normalize.ts` folds them.
 */
const QUOTE_CITATION_PATTERN = /【\s*(\d+)\s*†\s*["“”„‟″]([^】]*?)["“”„‟″]\s*】/g;

/**
 * Below this a quote stops being evidence. "pH" occurs in nearly every chunk in the corpus, so a
 * two-character quote matches whatever it is pointed at and proves nothing — the check would
 * report full support while measuring nothing.
 *
 * Counted as its own outcome rather than failed, and deliberately **not** a threshold: §8a
 * pre-registered three hard gates and this is not one of them. A tuned constant quietly deciding a
 * fourth is the mistake `REFUSAL_TOLERANCE` documents avoiding.
 */
export const MIN_QUOTE_CHARS = 12;

export interface QuoteIssue {
  marker: string;
  reason: string;
}

export interface QuoteResult {
  /** Quote-carrying markers seen. **Zero on every arm captured before the prompt change.** */
  total: number;
  /** Quotes found verbatim, after folding, in the chunk they cite. */
  supported: number;
  /** Quotes too short to be evidence. A subset of `issues`, split out because it wants a
   * different response: trivial quoting is a prompt-wording problem, a missing quote is a
   * fabrication. */
  short: number;
  /** Everything that is not `supported`, with the reason. */
  issues: QuoteIssue[];
}

/**
 * Does every quoted citation actually appear in the chunk it points at?
 *
 * **This decides support, which is precisely what `checkCitations` cannot.** That gate decides
 * *resolution* — whether `【9】` names a chunk that exists — and explicitly leaves "does the cited
 * passage contain the claim" to the judge. A verbatim quote collapses that judgement into a
 * substring match, so the part of groundedness that was Tier 2 becomes Tier 1.
 *
 * `normalizeForMatch` on both sides, never `===` and never a bare `.normalize()`: the corpus comes
 * from PDFs and the answer comes from a model, so they disagree on hyphens, quotes, µ vs μ and
 * whitespace without disagreeing on a single word.
 *
 * ponytail: substring containment, so a quote the model silently elides a clause from
 * ("A ... C" for "A B C") reads as unsupported. Upgrade path if that becomes the dominant finding:
 * reuse `closestWindow` with a small cutoff, the way `checkRefusal` already does.
 */
export const checkQuotes = (turn: TurnEvidence): QuoteResult => {
  const issues: QuoteIssue[] = [];
  let total = 0;
  let supported = 0;
  let short = 0;

  Array.from(turn.answer.matchAll(QUOTE_CITATION_PATTERN)).forEach((match) => {
    total += 1;
    const marker = match[0];
    const quote = match[2].trim();
    const chunk = turn.context[Number(match[1]) - 1];

    if (chunk === undefined) {
      issues.push({
        marker,
        reason: `quotes context #${match[1]}, but ${turn.context.length} chunk(s) were supplied`,
      });
      return;
    }

    if (quote.length < MIN_QUOTE_CHARS) {
      short += 1;
      issues.push({
        marker,
        reason: `quote is ${quote.length} chars, under ${MIN_QUOTE_CHARS} — too short to be evidence`,
      });
      return;
    }

    if (normalizeForMatch(chunk.text).includes(normalizeForMatch(quote))) {
      supported += 1;
      return;
    }

    issues.push({ marker, reason: `not found verbatim in "${chunk.id}"` });
  });

  return {
    total, supported, short, issues,
  };
};
