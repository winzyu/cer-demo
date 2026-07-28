/**
 * The retrieval seam. Every strategy — stub, direct-feed, or vector RAG — implements
 * `RetrievalAdapter`, and everything downstream (`POST /chat`, prompt assembly) depends
 * only on this contract.
 *
 * Defined before any real retrieval exists on purpose: the Phase N2 bake-off
 * (docs/RETRIEVAL_BAKEOFF.md) compares strategies by swapping implementations behind
 * this interface, so the interface must not leak any one strategy's assumptions.
 * Notably there is no `embedding`, `vector`, or `distance` here — a direct-feed adapter
 * has none of those, and `score` is optional for exactly that reason.
 */

/** A unit of context handed to the model. `source` is what a citation points at. */
export interface Chunk {
  id: string;
  text: string;
  source: string;
  /** Relevance, when the strategy ranks. Absent for unranked strategies (e.g. direct-feed). */
  score?: number;
}

export interface GetContextOptions {
  /** Upper bound on returned chunks. Clamped to MAX_TOP_K; see options.ts. */
  topK?: number;
}

export interface RetrievalAdapter {
  /** Registry key, and the value `DEFAULT_RETRIEVAL` / a request override selects by. */
  readonly mode: string;
  getContext(query: string, opts?: GetContextOptions): Promise<Chunk[]>;
}
