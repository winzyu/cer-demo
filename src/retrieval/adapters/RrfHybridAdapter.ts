import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../types/retrieval.types";
import { Bm25Index, loadBm25Documents } from "../lexical/Bm25Index";
import { resolveTopK } from "../options";

/** Conventional RRF constant (Cormack et al. 2009). See `RRF_K` note below. */
export const RRF_K = 60;

/**
 * How deep each arm is asked before fusion. Fusing two top-5 lists can only ever reorder 10
 * candidates; the whole point of fusion is that a chunk ranked 12th by one arm and 2nd by the
 * other should surface, and that is invisible unless both lists run deeper than the output.
 * The legacy hybrid fetched 20 per arm for the same reason (`MIGRATION_SPEC.md` §7).
 */
export const FUSION_DEPTH = 30;

/**
 * Reciprocal Rank Fusion of a lexical (BM25) arm and a dense (embedding) arm.
 *
 * **Why lexical came back.** The legacy FastAPI service was hybrid dense + Postgres full-text
 * fused with RRF. The migration dropped the lexical half because Firestore has no full-text
 * search, and `RETRIEVAL_BAKEOFF.md` §4b records that as a known regression — the "dead lexical
 * branch". At 393 chunks an in-process BM25 index is a few hundred kilobytes, so the constraint
 * that forced the regression no longer exists.
 *
 * **Why fusion rather than a weighted score blend.** BM25 scores are unbounded sums over matched
 * terms; cosine similarities live in [-1, 1]. Combining them numerically means inventing a scale
 * factor that has no principled value and silently re-tunes itself whenever the corpus changes.
 * RRF discards the magnitudes and uses only rank, so the two arms need no common scale — which is
 * exactly why it is the standard answer to this problem.
 *
 * **`RRF_K = 60` is the published default and is deliberately not tuned here.** Its effect is to
 * flatten the contribution of top ranks: at k=60 the gap between rank 1 and rank 2 is small, so a
 * chunk both arms rank *moderately* well beats one arm's confident outlier. Tuning it against the
 * same 99 labelled queries used to report the result would be fitting the constant to the test
 * set; if it is ever tuned, it needs a held-out split.
 */
export class RrfHybridAdapter implements RetrievalAdapter {
  readonly mode: string;

  private readonly dense: RetrievalAdapter;

  private readonly corpusPath?: string;

  /** Built on first use, not in the constructor, so registering the mode costs nothing. */
  private index?: Bm25Index;

  constructor(
    dense: RetrievalAdapter,
    mode = "local-hybrid",
    corpusPath: string | undefined = undefined,
  ) {
    this.dense = dense;
    this.mode = mode;
    this.corpusPath = corpusPath;
  }

  async getContext(query: string, opts?: GetContextOptions): Promise<Chunk[]> {
    // Same degenerate-case guards as every other adapter, so the arms stay comparable.
    const topK = resolveTopK(opts);
    if (query.trim() === "" || topK === 0) {
      return [];
    }

    const lexical = this.lexicalIndex().search(query, FUSION_DEPTH);
    const dense = await this.dense.getContext(query, { ...opts, topK: FUSION_DEPTH });

    const fused = new Map<string, { chunk: Chunk; score: number }>();

    const contribute = (chunk: Chunk, rank: number): void => {
      const existing = fused.get(chunk.id);
      const increment = 1 / (RRF_K + rank + 1);
      if (existing) {
        existing.score += increment;
      } else {
        fused.set(chunk.id, { chunk, score: increment });
      }
    };

    lexical.forEach((hit, rank) => contribute(
      { id: hit.id, text: hit.text, source: hit.source },
      rank,
    ));
    dense.forEach((chunk, rank) => contribute(chunk, rank));

    return [...fused.values()]
      // Ties break by id so a ranking is reproducible across runs, matching the other arms.
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, topK)
      // The fused score replaces each arm's own — they are not comparable to a cosine, and
      // reporting a cosine here would invite exactly that misreading.
      .map(({ chunk, score }) => ({ ...chunk, score }));
  }

  private lexicalIndex(): Bm25Index {
    if (!this.index) {
      this.index = new Bm25Index(loadBm25Documents(this.corpusPath));
    }
    return this.index;
  }
}
