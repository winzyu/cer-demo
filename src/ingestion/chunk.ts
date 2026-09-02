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
   * Whether to apply the alphabetic-ratio test. **Off by default** — see below.
   *
   * **Deliberate deviation from legacy parity** (`MIGRATION_SPEC.md` §5.1 step 4). The ratio test
   * exists to drop OCR noise and PDF furniture, but it cannot tell those apart from a *table*: a
   * numeric grid is mostly digits, pipes and separators and scores far under the 0.5 threshold.
   *
   * **Measured on this corpus 2026-08-31, which is why the default is now `false`.** Running it
   * over all fifteen documents removed 42 numeric-table chunks and 17 table-of-contents dot
   * leaders, and **zero chunks of genuine OCR noise — the only thing it exists to catch**. 34 of
   * the 42 were the oxygen-solubility tables in `usgs-nfm-a6.2`, the corpus's authoritative source
   * for dissolved-oxygen threshold lookups.
   *
   * That matters beyond data loss: direct-feed consumes whole document text and kept those tables,
   * while every vector arm could not retrieve them at all. A threshold question about oxygen
   * solubility would then have scored as "feeding beats retrieving" when it was a filter setting —
   * a confound invisible in the final numbers (`EVAL_REBUILD.md` §2b).
   *
   * An earlier version exempted `.md`/`.txt`, where a low ratio means structure rather than noise.
   * The reasoning was right and **the condition matched nothing** — every document here is a PDF —
   * so the exemption was dead code and the filter ran on all fifteen. It is gone.
   *
   * The option survives as a deliberate escape hatch for a genuinely OCR-noisy document, should one
   * ever be added. **Nothing in this corpus is one**, so no caller sets it. It defaults to `false`
   * rather than `true` on purpose: the destructive state has to be asked for, because turning the
   * filter back on silently re-deletes those tables and re-derives nothing — chunk ids are content
   * derived, so the ids survive, and every retrieval label keyed to a dropped chunk goes dead
   * without a single test failing.
   */
  checkAlphaRatio?: boolean;
}

export const isQualityChunk = (
  text: string,
  { checkAlphaRatio = false }: QualityOptions = {},
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
