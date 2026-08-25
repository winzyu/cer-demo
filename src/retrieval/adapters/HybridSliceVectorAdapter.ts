import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../types/retrieval.types";
import { DIRECT_FEED_SLICE } from "../../ingestion/corpus";
import { resolveTopK } from "../options";

/**
 * The `hybrid-slice-vector` arm: the operator tier always, plus dense retrieval over everything
 * else.
 *
 * **Why this shape, and why it was not obvious.** Measured on the retrieval harness
 * (`docs/RETRIEVAL_EVAL.md`), the two existing arms fail in opposite directions:
 *
 * - `firestore-direct` has the best recall on the question set (74.9%) because the ◆G9 slice is
 *   *curated* — but it cannot rank (MRR 0.337) and scores **2.4% on `deep-in-manual`**, because
 *   that material is outside the slice by construction.
 * - `local-vector` ranks far better (MRR 0.539) and reaches the manuals, but at an equal context
 *   budget of ~16 chunks it retrieves *worse overall* (~60%) than the curated slice does.
 *
 * The curated slice beating dense retrieval at equal cost is the finding that motivates this
 * adapter. It says the slice is not a weak baseline to be replaced; it is a strong prior that
 * dense retrieval should be *added to* rather than swapped for. The Phase N2 exit criteria
 * anticipated exactly this — "a split outcome is a legitimate result: direct-feed the small
 * authoritative tier, RAG the long manuals" (`docs/timeline.md`) — and the adapter registry was
 * built to compose it without a rewrite.
 *
 * It also preserves a property neither the pure-vector arm nor a top-k reranker can guarantee:
 * **the operator's source-of-truth is always in the prompt.** The system prompt's authoritative
 * ranges outrank any document, and several `precedence` fixtures turn on the model seeing the
 * operator reference alongside a manual that disagrees with it. A vector arm can rank that
 * reference out of the top k; this one structurally cannot.
 *
 * The cost is the slice's tokens on every request (~9.4K), which is exactly what direct-feed
 * already pays and what its 99% prompt-cache hit rate makes cheap.
 */
export class HybridSliceVectorAdapter implements RetrievalAdapter {
  readonly mode: string;

  private readonly slice: RetrievalAdapter;

  private readonly vector: RetrievalAdapter;

  private readonly sliceFilenames: readonly string[];

  /**
   * `mode` is a parameter because the same composition is registered twice — once over the dense
   * arm, once over the dense+lexical fusion — and a hard-coded mode would make the second
   * registration throw on the duplicate-name guard in `RetrievalRegistry`.
   */
  constructor(
    slice: RetrievalAdapter,
    vector: RetrievalAdapter,
    sliceFilenames: readonly string[] = DIRECT_FEED_SLICE,
    mode = "hybrid-slice-vector",
  ) {
    this.slice = slice;
    this.vector = vector;
    this.sliceFilenames = sliceFilenames;
    this.mode = mode;
  }

  async getContext(query: string, opts?: GetContextOptions): Promise<Chunk[]> {
    // Same degenerate-case guard as every other adapter, so the arms stay comparable.
    if (query.trim() === "" || resolveTopK(opts) === 0) {
      return [];
    }

    const [sliceChunks, vectorChunks] = await Promise.all([
      this.slice.getContext(query, opts),
      this.vector.getContext(query, opts),
    ]);

    // Drop vector hits that are already covered by the slice. Without this the arm pays twice for
    // the operator tier: once as whole documents, again as individual chunks ranked into the top
    // k — spending retrieval slots on text the model already has, which is the one thing a
    // limited context budget cannot afford.
    const covered = new Set(this.sliceFilenames);
    const fromManuals = vectorChunks.filter((chunk) => !covered.has(chunk.source)
      && !this.sliceFilenames.some((filename) => chunk.id.startsWith(filename)));

    // Slice first: it is the authoritative tier, and prompt order is the only ranking signal the
    // model gets from an unranked block.
    return [...sliceChunks, ...fromManuals];
  }
}
