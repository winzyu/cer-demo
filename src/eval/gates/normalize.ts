/**
 * Text normalisation and distance helpers for the §8a gate checker.
 *
 * **Why this is not just `===`.** The refusal gate compares a model answer against
 * `REFUSAL_SENTENCE`, a constant pinned character-for-character because behaviour depends on its
 * exact text. Measured against the captured transcripts, an exact comparison **fails on an answer
 * that is a perfect refusal**: the model emits `water‑quality` with U+2011 NON-BREAKING HYPHEN
 * where the constant has U+002D HYPHEN-MINUS. One character, visually identical, unequal as
 * strings — the same failure mode `Bm25Index.tokenize` documents for U+03BC vs U+00B5.
 *
 * **And NFKC alone does not fix it.** NFKC folds U+2011 to U+2010 HYPHEN, *not* to U+002D, so the
 * comparison still fails after normalising. The dash and quote classes have to be folded
 * explicitly. That is the whole reason this file exists rather than a one-line `.normalize()`.
 */
import { tokenize } from "../../retrieval/lexical/Bm25Index";

/** Folded to U+002D. U+2212 is the maths minus; the rest are the dash/hyphen block. */
const DASH_CLASS = /[\u2010-\u2015\u2212\u2E3A\u2E3B\uFE58\uFE63\uFF0D]/g;

/** Folded to `'`. Typographic apostrophes are what a model emits for `don't`. */
const SINGLE_QUOTE_CLASS = /[\u2018\u2019\u201A\u201B\u2032]/g;

/** Folded to `"`. */
const DOUBLE_QUOTE_CLASS = /[\u201C\u201D\u201E\u201F\u2033]/g;

/** Deleted outright: they render as nothing and only ever break a comparison. */
const INVISIBLE = /[\u00AD\u200B-\u200D\uFEFF]/g;

/** Collapsed to one space. `\s` misses NBSP and the thin/narrow spaces PDFs and models emit. */
const SPACE_CLASS = /[\s\u00A0\u2007\u2009\u200A\u202F\u3000]+/g;

/**
 * Canonical form for comparing two pieces of model or corpus text.
 *
 * Order matters: NFKC first (it folds µ→μ, ℃, ligatures and full-width forms for free), then the
 * classes NFKC leaves alone, then whitespace, then case.
 */
export const normalizeForMatch = (text: string): string => text
  .normalize("NFKC")
  .replace(INVISIBLE, "")
  .replace(DASH_CLASS, "-")
  .replace(SINGLE_QUOTE_CLASS, "'")
  .replace(DOUBLE_QUOTE_CLASS, "\"")
  .replace(SPACE_CLASS, " ")
  .trim()
  .toLowerCase();

/**
 * Levenshtein distance, abandoned as soon as it provably exceeds `cutoff`.
 *
 * The cutoff is not an optimisation detail — it is what keeps this honest. Without it the function
 * invites "how close is close enough" reasoning over a pre-registered absolute gate. With it the
 * only question it can answer is "is this within N edits", which is the only question being asked.
 *
 * ponytail: full O(mn) matrix over two rows. The strings are one sentence; a Myers bit-vector
 * implementation would be faster and much harder to read for no measurable gain here.
 */
export const editDistance = (a: string, b: string, cutoff = Number.MAX_SAFE_INTEGER): number => {
  if (a === b) {
    return 0;
  }
  if (Math.abs(a.length - b.length) > cutoff) {
    return cutoff + 1;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      const best = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
      current.push(best);
      rowMin = Math.min(rowMin, best);
    }

    if (rowMin > cutoff) {
      return cutoff + 1;
    }
    previous = current;
  }

  return previous[b.length];
};

/**
 * The best `needle`-length window of `haystack` by edit distance, and where it starts.
 *
 * The refusal sentence is one sentence inside a longer answer, so a whole-string distance would be
 * dominated by the surrounding text and mean nothing. Scanning windows asks the question actually
 * being asked: *does this sentence appear somewhere in there, near enough?*
 *
 * ponytail: O(answer x sentence) with a per-window cutoff. Answers are a few thousand characters
 * and the sentence is ~150, so this is milliseconds. A suffix-automaton approach would be the
 * upgrade if either ever grew by orders of magnitude.
 */
export const closestWindow = (
  haystack: string,
  needle: string,
  cutoff: number,
): { distance: number; index: number } => {
  if (needle === "") {
    return { distance: 0, index: 0 };
  }

  let best = { distance: cutoff + 1, index: -1 };

  // Windows are sized needle.length +/- cutoff so an answer that inserts or drops characters can
  // still be found; a fixed-width scan would miss a refusal that gained a word.
  for (let start = 0; start <= haystack.length; start += 1) {
    for (let width = needle.length - cutoff; width <= needle.length + cutoff; width += 1) {
      const fits = width >= 0 && start + width <= haystack.length;
      const distance = fits
        ? editDistance(haystack.slice(start, start + width), needle, cutoff)
        : cutoff + 1;
      if (distance < best.distance) {
        best = { distance, index: start };
        if (distance === 0) {
          return best;
        }
      }
    }
  }

  return best;
};

/**
 * Jaccard overlap of the two texts' index terms, in [0, 1]. **Diagnostic only.**
 *
 * It exists so a failing turn can be read at a glance — 0.98 means "the model paraphrased one
 * word", 0.20 means "it answered instead of refusing", and those want different responses from a
 * human. It never decides a gate: a tuned similarity threshold on an absolute pre-registered gate
 * would make the verdict depend on a constant nobody pre-registered.
 */
export const tokenSimilarity = (a: string, b: string): number => {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  let shared = 0;
  left.forEach((term) => {
    if (right.has(term)) {
      shared += 1;
    }
  });

  return shared / (left.size + right.size - shared);
};

/** Index of the first differing character, or -1. Points a human straight at the codepoint. */
export const firstDivergence = (a: string, b: string): number => {
  const limit = Math.min(a.length, b.length);
  for (let i = 0; i < limit; i += 1) {
    if (a[i] !== b[i]) {
      return i;
    }
  }
  return a.length === b.length ? -1 : limit;
};

/** `U+2011 '‑'` — for naming the character that broke a comparison in a log line. */
export const describeChar = (ch: string | undefined): string => (
  ch === undefined ? "(end of string)" : `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} ${JSON.stringify(ch)}`
);
