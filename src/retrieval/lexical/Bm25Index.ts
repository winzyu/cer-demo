import { readCorpus } from "../../ingestion/ingest";

/**
 * An in-process Okapi BM25 index over the corpus chunks.
 *
 * **Why lexical retrieval exists again.** The legacy FastAPI service fused dense vectors with
 * Postgres full-text search via RRF (`docs/migration/MIGRATION_SPEC.md` §7). The migration dropped
 * the lexical half because Firestore has no full-text search, and that was recorded as a known
 * regression (`docs/RETRIEVAL_BAKEOFF.md` §4b, the "dead lexical branch" finding).
 *
 * The blocker was infrastructural and no longer applies. The corpus is 393 chunks / ~876K
 * characters — an inverted index over it is a few megabytes of `Map`, built in tens of
 * milliseconds, with no service to run and nothing to keep in sync beyond `corpus.json` itself.
 * The same argument that makes `local-vector` viable makes this viable.
 *
 * **What it is expected to fix.** `local-vector`'s MRR is flat from k=5 to k=50 (0.539 → 0.559,
 * `docs/RETRIEVAL_EVAL.md` §3): depth buys recall and no ranking at all, which is the signature of
 * a retriever limited by its *ordering*. Meanwhile the `acronym-exact-token` class sits at 62.5% —
 * rare surface forms (`NTU` vs `FNU`, `KCl` creep, `EC` vs specific conductance, `μS/cm`) are
 * exactly what a 768-dimension sentence embedding smooths away and what term matching nails.
 *
 * This class ranks; it does not fuse. Combining it with the dense arm is `RrfFusionAdapter`'s job,
 * so each half stays independently measurable.
 */

/**
 * Okapi BM25 free parameters, at the values the original TREC experiments settled on and that
 * Lucene, Elasticsearch and rank_bm25 all still ship as defaults.
 *
 * `k1 = 1.2` sets how fast term-frequency saturates: a chunk mentioning `turbidity` eight times is
 * more relevant than one mentioning it twice, but not four times more. `b = 0.75` sets how hard
 * long documents are penalised. Both are left at the defaults deliberately — chunks here are
 * already length-normalised by the ingest chunker (`src/ingestion/chunk.ts`), so the length spread
 * BM25 is correcting for is small, and tuning two parameters against 99 labelled queries would fit
 * the label set rather than the corpus. They are constructor options so a sweep is possible; they
 * are not tuned by default.
 */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/** One indexable unit: a corpus chunk, already paired with the citation source. */
export interface Bm25Document {
  id: string;
  /** `sourceUrl ?? filename`, matching what every other arm puts on a citation. */
  source: string;
  text: string;
}

export interface Bm25Hit extends Bm25Document {
  /** BM25 score, higher is better. Unbounded — comparable within a query, never across queries. */
  score: number;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
}

/**
 * A token run: starts on a letter or digit, then allows the punctuation that carries meaning
 * *inside* a technical token — `/` in `μS/cm` and `mg/L`, `.` in `6.5` and `A6.4`, `-` in
 * `9-A6.4`, `°` and `%` in `25°C` and `100%`.
 *
 * **This regex is the whole reason the arm helps.** The obvious tokenizer — lowercase, strip
 * everything non-alphanumeric, split on whitespace — turns `μS/cm` into `s` + `cm` and `mg/L` into
 * `mg` + `l`, i.e. it destroys precisely the rare exact tokens that lexical retrieval exists to
 * catch. Unicode property escapes rather than `[a-z0-9]` for the same reason: `μ` is a letter and
 * has to survive, and `\w` would drop it.
 */
const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}%°/._+-]*/gu;

/** Punctuation that is only ever *trailing* noise: `mg/L.` and `6.5,` end sentences, not tokens. */
const TRAILING_NOISE = /[./_+-]+$/;

/** Where a compound token is also indexed by its parts. Not `.` — splitting `6.5` loses it. */
const COMPOUND_SEPARATOR = /[/_-]/;

/**
 * Case-folds and splits text into index terms.
 *
 * Three decisions worth stating, because each has an obvious alternative that is worse here:
 *
 * - **NFKC first.** The corpus writes micro as U+03BC (`μS/cm`, 201 occurrences) while a keyboard
 *   and most PDFs emit U+00B5 (`µ`). They are visually identical and compare unequal; NFKC folds
 *   the second onto the first, so a query typed either way matches. It also normalises `℃`,
 *   ligatures and full-width forms for free.
 * - **Lowercasing is kept.** It costs nothing that matters — `KCl` and `kcl` fold to the same term
 *   on *both* sides of the query, so exact-token matching is preserved — while a case-sensitive
 *   index would miss `ntu` typed by an operator in a hurry.
 * - **Compounds are indexed whole *and* in parts.** `μs/cm` yields `μs/cm`, `μs`, `cm`. The whole
 *   form is rare, so BM25's IDF weights it heavily and an exact unit match wins; the parts keep a
 *   query saying "microsiemens per cm" from missing entirely. Single-character parts are dropped:
 *   the `l` in `mg/l` matches everywhere and means nothing.
 *
 * There is deliberately **no stemming and no stopword list**. Stemming trades exact-token fidelity
 * — the one thing this arm is here to provide — for recall the dense arm already supplies, and
 * BM25's IDF term drives a word appearing in every chunk to ~0 weight on its own, which is what a
 * stopword list is for.
 */
export const tokenize = (text: string): string[] => {
  const normalized = text.normalize("NFKC").toLowerCase();
  const terms: string[] = [];

  const matches = normalized.match(TOKEN_PATTERN) ?? [];
  matches.forEach((raw) => {
    const token = raw.replace(TRAILING_NOISE, "");
    if (token === "") {
      return;
    }
    terms.push(token);

    if (COMPOUND_SEPARATOR.test(token)) {
      token
        .split(COMPOUND_SEPARATOR)
        .filter((part) => part.length > 1)
        .forEach((part) => terms.push(part));
    }
  });

  return terms;
};

export class Bm25Index {
  private readonly k1: number;

  private readonly b: number;

  private readonly documents: Bm25Document[];

  /** term -> (document position -> term frequency). The inverted index. */
  private readonly postings = new Map<string, Map<number, number>>();

  /** Token count per document, positionally aligned with `documents`. */
  private readonly lengths: number[] = [];

  private readonly averageLength: number;

  constructor(documents: Bm25Document[], options: Bm25Options = {}) {
    if (documents.length === 0) {
      // Same rule as `LocalVectorAdapter`: an empty index ranks nothing and returns nothing, which
      // is indistinguishable from "the corpus has no answer". Setup problems must fail loudly.
      throw new Error("Cannot build a BM25 index over zero documents.");
    }

    this.k1 = options.k1 ?? BM25_K1;
    this.b = options.b ?? BM25_B;
    this.documents = [...documents];

    const seen = new Set<string>();
    this.documents.forEach((document, position) => {
      if (seen.has(document.id)) {
        // Two chunks under one id would let fusion count the same text twice and would make the
        // returned `id` ambiguous for a citation. Ingest only warns about a hash collision; here
        // it is unrecoverable, so it throws.
        throw new Error(`Duplicate chunk id "${document.id}" in the BM25 index.`);
      }
      seen.add(document.id);

      const terms = tokenize(document.text);
      this.lengths.push(terms.length);

      terms.forEach((term) => {
        let posting = this.postings.get(term);
        if (!posting) {
          posting = new Map<number, number>();
          this.postings.set(term, posting);
        }
        posting.set(position, (posting.get(position) ?? 0) + 1);
      });
    });

    const totalLength = this.lengths.reduce((sum, length) => sum + length, 0);
    this.averageLength = totalLength / this.documents.length;
  }

  /** Documents in the index. */
  get size(): number {
    return this.documents.length;
  }

  /** Distinct terms in the index. Exposed for tests and for a vocabulary sanity check. */
  get vocabularySize(): number {
    return this.postings.size;
  }

  /** How many documents contain `term`, after the same tokenisation the index used. */
  documentFrequency(term: string): number {
    return this.postings.get(term)?.size ?? 0;
  }

  /**
   * Robertson/Sparck Jones IDF in the `+1` form: `ln(1 + (N - df + 0.5) / (df + 0.5))`.
   *
   * The `+1` matters. The textbook form goes *negative* for a term in more than half the
   * documents, which lets a common word actively subtract from a chunk's score and can rank a
   * chunk below one that matched nothing. On a 393-chunk single-domain corpus where "water" and
   * "measurement" are near-universal, that is not a hypothetical. This variant — Lucene's — is
   * monotonically decreasing in `df` and floors at ~0 instead.
   */
  idf(term: string): number {
    const df = this.documentFrequency(term);
    if (df === 0) {
      return 0;
    }
    return Math.log(1 + (this.size - df + 0.5) / (df + 0.5));
  }

  /**
   * Ranks the index against `query` and returns the best `topK`.
   *
   * Query terms are deduplicated, so a term repeated in the query contributes once. The full
   * Okapi formula has a query-term-frequency factor for exactly that case; it is a no-op on
   * queries this short (a user asking "pH pH pH" is not a case worth modelling) and omitting it
   * keeps the score a plain sum over distinct matched terms.
   */
  search(query: string, topK: number): Bm25Hit[] {
    if (topK <= 0 || query.trim() === "") {
      return [];
    }

    const terms = [...new Set(tokenize(query))];
    const scores = new Map<number, number>();

    terms.forEach((term) => {
      const posting = this.postings.get(term);
      if (!posting) {
        return;
      }
      const weight = this.idf(term);

      posting.forEach((frequency, position) => {
        const normalizedLength = this.lengths[position] / this.averageLength;
        const denominator = frequency + this.k1 * (1 - this.b + this.b * normalizedLength);
        const contribution = (weight * frequency * (this.k1 + 1)) / denominator;
        scores.set(position, (scores.get(position) ?? 0) + contribution);
      });
    });

    return [...scores.entries()]
      .filter(([, score]) => score > 0)
      // Ties break by id, matching `LocalVectorAdapter`, so a ranking is reproducible across runs
      // and machines rather than depending on `Map` insertion order.
      .sort(([positionA, scoreA], [positionB, scoreB]) => scoreB - scoreA
        || this.documents[positionA].id.localeCompare(this.documents[positionB].id))
      .slice(0, topK)
      .map(([position, score]) => ({ ...this.documents[position], score }));
  }
}

/**
 * Reads the corpus artifact and flattens it into indexable chunks.
 *
 * Reads `corpus.json` rather than the embedding cache even though the cache holds the same
 * `{ id, source, text }` triple, because a lexical index must not depend on an embedding model
 * having been run: `npm run ingest` is enough to make this arm work, and a stale or missing
 * `data/embeddings/cache.json` is then only the dense arm's problem.
 */
export const loadBm25Documents = (corpusPath?: string): Bm25Document[] => {
  const corpus = readCorpus(corpusPath);

  const documents: Bm25Document[] = [];
  corpus.documents.forEach((document) => {
    const source = document.sourceUrl ?? document.filename;
    document.chunks.forEach((chunk) => {
      documents.push({ id: chunk.id, source, text: chunk.text });
    });
  });

  return documents;
};
