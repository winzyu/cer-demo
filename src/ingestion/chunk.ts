import { createHash } from "crypto";

/**
 * Chunking and the quality filter, ported from `MIGRATION_SPEC.md` §5.1 steps 3–4.
 *
 * The constants are reproduced exactly. They are not tuning knobs to revisit casually: the
 * Phase N2 bake-off compares retrieval strategies, and changing chunk size mid-experiment would
 * change results for reasons unrelated to the strategy under test.
 */

export const CHUNK_SIZE_CHARS = 3200;
export const OVERLAP_CHARS = 400;

export const MIN_QUALITY_CHARS = 100;
export const MIN_ALPHA_RATIO = 0.5;

/** PDF furniture that survives extraction and carries no information. */
const BOILERPLATE = ["adobe acrobat", "acrobat reader", "click here to download"];

/** Separator priority for the recursive splitter — coarsest first. */
const SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

/**
 * Recursive character splitter. Splits on the coarsest separator that yields pieces within
 * the size limit, recursing into any piece still too large with the next separator down.
 */
const split = (text: string, size: number, separators: string[]): string[] => {
  if (text.length <= size) {
    return text.trim() === "" ? [] : [text];
  }

  const [separator, ...rest] = separators;

  // Last resort: no separator left, so cut on a hard character boundary.
  if (separator === undefined || separator === "") {
    const pieces: string[] = [];
    for (let i = 0; i < text.length; i += size) {
      pieces.push(text.slice(i, i + size));
    }
    return pieces;
  }

  const parts = text.split(separator);
  const merged: string[] = [];
  let current = "";

  parts.forEach((part) => {
    const candidate = current === "" ? part : current + separator + part;
    if (candidate.length <= size) {
      current = candidate;
      return;
    }
    if (current !== "") {
      merged.push(current);
    }
    // A single part can still exceed the limit — recurse with a finer separator.
    if (part.length > size) {
      merged.push(...split(part, size, rest));
      current = "";
    } else {
      current = part;
    }
  });

  if (current !== "") {
    merged.push(current);
  }

  return merged.filter((piece) => piece.trim() !== "");
};

/**
 * Splits text into overlapping chunks. Overlap is applied the legacy way — by prepending the
 * previous chunk's trailing `OVERLAP_CHARS` to each subsequent chunk — so a fact straddling a
 * boundary still appears whole in one of them.
 */
export const chunkText = (
  text: string,
  size = CHUNK_SIZE_CHARS,
  overlap = OVERLAP_CHARS,
): string[] => {
  const base = split(text, size, SEPARATORS);

  return base.map((piece, index) => {
    if (index === 0) {
      return piece;
    }
    const previous = base[index - 1];
    return previous.slice(-overlap) + piece;
  });
};

/** Fraction of characters that are letters — low values indicate tables, headers, or OCR noise. */
const alphaRatio = (text: string): number => {
  if (text.length === 0) {
    return 0;
  }
  const letters = text.replace(/[^a-zA-Z]/g, "").length;
  return letters / text.length;
};

export interface QualityOptions {
  /**
   * Whether to apply the alphabetic-ratio test.
   *
   * **Deliberate deviation from legacy parity** (`MIGRATION_SPEC.md` §5.1 step 4). The ratio test
   * exists to drop OCR noise and PDF furniture, but it cannot tell those apart from a *table* —
   * markdown tables in this corpus score 0.07–0.14 against a 0.5 threshold, so the legacy filter
   * discarded 15 of 23 chunks of the aquatic-life criteria table, the corpus's most authoritative
   * source of numeric thresholds.
   *
   * That matters beyond data loss: direct-feed consumes whole documents and keeps the table, while
   * the vector arms embed chunks and would lose most of it. Threshold questions would then be won
   * by direct-feed because of a filter bug, not because feeding beats retrieving — a confound
   * invisible in the final numbers. Disabled for `.md`/`.txt`, where a low ratio means structure
   * rather than noise; still applied to extracted and OCR'd PDF text, which is what it was for.
   */
  checkAlphaRatio?: boolean;
}

export const isQualityChunk = (
  text: string,
  { checkAlphaRatio = true }: QualityOptions = {},
): boolean => {
  if (text.length < MIN_QUALITY_CHARS) {
    return false;
  }
  if (checkAlphaRatio && alphaRatio(text) < MIN_ALPHA_RATIO) {
    return false;
  }
  const lower = text.toLowerCase();
  return !BOILERPLATE.some((phrase) => lower.includes(phrase));
};

export const filterChunks = (chunks: string[], options: QualityOptions = {}): string[] => chunks
  .filter((chunk) => isQualityChunk(chunk, options));

/**
 * Stable chunk identity.
 *
 * **Chunk ids used to be positional** — `<filename>__0007`, assigned by the Firestore seeder from
 * the array index. That is fine while the corpus is frozen and actively wrong once it is not:
 * inserting a paragraph into page 2 of a document shifts every id after it, so anything that
 * recorded "chunk 7 answers this question" now points at different text, silently. Retrieval
 * labels (`eval/retrieval-labels/`) are exactly that kind of record, and the corpus is expected
 * to churn as source-of-truth documents are replaced.
 *
 * So identity is derived from the chunk's own content instead of its position. An edit elsewhere
 * in the document leaves this chunk's id untouched; an edit to *this* chunk changes it, which is
 * the honest outcome — the labelled text no longer exists and the label should be re-checked
 * rather than silently re-pointed at something else.
 *
 * Two fields rather than one, because they answer different questions:
 *
 * - `contentHash` is the bare hash. It survives a **rename or re-tiering** of the document, and
 *   it is what detects the same passage appearing in two documents.
 * - `id` prefixes the filename. It is what addresses a chunk in a store, and keeping the filename
 *   in it means a collision between two documents that happen to share boilerplate produces two
 *   distinct records rather than one silently overwriting the other.
 *
 * Twelve hex characters is 48 bits. At corpus scale (hundreds of chunks) collision probability is
 * negligible, and `ingestCorpus` warns if one occurs anyway rather than trusting the arithmetic.
 */
export const CHUNK_ID_HASH_CHARS = 12;

/** Firestore ids cannot contain "/", and a readable prefix makes a seeded store browsable. */
export const filenameSlug = (filename: string): string => filename.replace(/[^a-zA-Z0-9._-]/g, "_");

export const contentHashOf = (text: string): string => createHash("sha256")
  .update(text, "utf8")
  .digest("hex")
  .slice(0, CHUNK_ID_HASH_CHARS);

export const chunkIdOf = (filename: string, text: string): string => (
  `${filenameSlug(filename)}__${contentHashOf(text)}`
);
