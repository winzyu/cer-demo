/**
 * Reciprocal Rank Fusion — the legacy hybrid retrieval's fusion step
 * (`MIGRATION_SPEC.md` §7 step 5).
 *
 * Kept as a pure function, separate from the adapter, because it is the one piece of the
 * `pgvector-rag` arm whose correctness can be established without a database. If the fusion is
 * subtly wrong the arm still returns plausible chunks, just worse ones — a failure that would be
 * read as "RAG loses to direct-feed" rather than as a bug, and would silently decide ◆G7.
 */

/** Legacy constant. Dampens the influence of top ranks so neither branch dominates outright. */
export const RRF_K = 60;

/** Each branch fetches this many candidates before fusion (`MIGRATION_SPEC.md` §7). */
export const HYBRID_FETCH = 20;

/**
 * One ranked list from one retrieval branch, best first. Only the order matters — RRF
 * deliberately ignores each branch's native score, which is what lets a cosine distance and a
 * `ts_rank_cd` score be combined at all.
 */
export type RankedList<T> = T[];

/**
 * Fuses ranked lists: `score(d) = Σ 1 / (RRF_K + rank + 1)`, summed over every list containing
 * `d`, with `rank` zero-based.
 *
 * The `+ 1` reproduces the legacy formula exactly. With zero-based ranks it makes the first
 * position contribute `1/61` rather than `1/60` — a difference too small to see in any single
 * result and large enough to change orderings across a whole eval set, which is precisely why
 * it is pinned rather than tidied up.
 *
 * Ties are broken by first appearance across the input lists, so fusion is deterministic; a
 * nondeterministic ranking would make cold and warm passes incomparable.
 */
export const fuseRrf = <T>(
  lists: RankedList<T>[],
  keyOf: (item: T) => string,
  topK: number,
  k: number = RRF_K,
): { item: T; score: number }[] => {
  if (topK <= 0) {
    return [];
  }

  const scores = new Map<string, number>();
  const items = new Map<string, T>();
  const firstSeen = new Map<string, number>();
  let order = 0;

  lists.forEach((list) => {
    list.forEach((item, rank) => {
      const key = keyOf(item);
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank + 1));
      if (!items.has(key)) {
        items.set(key, item);
        firstSeen.set(key, order);
        order += 1;
      }
    });
  });

  return [...scores.entries()]
    .sort(([keyA, scoreA], [keyB, scoreB]) => (
      scoreB - scoreA || (firstSeen.get(keyA) as number) - (firstSeen.get(keyB) as number)
    ))
    .slice(0, topK)
    .map(([key, score]) => ({ item: items.get(key) as T, score }));
};
