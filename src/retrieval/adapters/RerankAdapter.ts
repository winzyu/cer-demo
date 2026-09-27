import type { Reranker } from "../../services/RerankService";
import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../types/retrieval.types";
import { MAX_TOP_K, resolveTopK } from "../options";

/**
 * Reorders a deeper candidate pool from another adapter with a cross-encoder, then keeps the top k.
 *
 * Dense retrieval over the manuals reaches the right chunks but ranks them low: at k=20 the
 * `local-vector` pool holds 38.4% of labelled chunks, at 50 it holds 56.8%. A cross-encoder reads
 * the query and each chunk together, so it can promote chunks the embedding placed at rank 30-50.
 * Measured offline on the 90 frozen queries, reranking the top 50 into k=20 lifts
 * `hybrid-slice-vector` recall from 39.5% to 51.9% (`docs/EVAL_REBUILD.md`, "Reranker, offline").
 *
 * The pool is `MAX_TOP_K` by default because that is where the headroom was measured; a smaller
 * pool recovers less (45.5% from the top 30).
 */
export class RerankAdapter implements RetrievalAdapter {
  readonly mode: string;

  private readonly inner: RetrievalAdapter;

  private readonly reranker: Reranker;

  private readonly poolDepth: number;

  constructor(
    inner: RetrievalAdapter,
    reranker: Reranker,
    mode = "local-rerank",
    poolDepth = MAX_TOP_K,
  ) {
    this.inner = inner;
    this.reranker = reranker;
    this.mode = mode;
    this.poolDepth = poolDepth;
  }

  async getContext(query: string, opts?: GetContextOptions): Promise<Chunk[]> {
    // Same degenerate-case guards as every other adapter, so the arms stay comparable.
    const topK = resolveTopK(opts);
    if (query.trim() === "" || topK === 0) {
      return [];
    }

    const depth = Math.max(topK, this.poolDepth);
    const pool = await this.inner.getContext(query, { ...opts, topK: depth });
    const scores = await this.reranker.score(query, pool.map((chunk) => chunk.text));

    return pool
      .map((chunk, rank) => ({ chunk, rank, score: scores[rank] }))
      // Ties keep the inner adapter's order, so a ranking is reproducible across runs.
      .sort((a, b) => b.score - a.score || a.rank - b.rank)
      .slice(0, topK)
      // The cross-encoder's score replaces the inner one; a cosine is not comparable to it.
      .map(({ chunk, score }) => ({ ...chunk, score }));
  }
}
