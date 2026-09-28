import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../types/retrieval.types";

/**
 * A diagnostic arm: the labelled gold chunks, then what a real arm retrieved, duplicates removed.
 *
 * Gold context sets the ceiling and a real arm falls short of it; this arm splits the shortfall.
 * If answers here score near gold, the gap is passages the real arm misses. If they fall toward
 * the real arm, the extra retrieved chunks are what hurts. Gold goes first so every gold chunk is
 * present whatever the arm ranked; the real arm's order is kept after it.
 *
 * Evaluation only: the gold half looks context up by labelled query and throws on any other.
 */
export class GoldPlusRetrievedAdapter implements RetrievalAdapter {
  readonly mode: string;

  private readonly gold: RetrievalAdapter;

  private readonly retrieved: RetrievalAdapter;

  constructor(gold: RetrievalAdapter, retrieved: RetrievalAdapter, mode: string) {
    this.gold = gold;
    this.retrieved = retrieved;
    this.mode = mode;
  }

  async getContext(query: string, opts?: GetContextOptions): Promise<Chunk[]> {
    const [gold, retrieved] = await Promise.all([
      this.gold.getContext(query, opts),
      this.retrieved.getContext(query, opts),
    ]);
    const goldIds = new Set(gold.map((chunk) => chunk.id));
    return [...gold, ...retrieved.filter((chunk) => !goldIds.has(chunk.id))];
  }
}
