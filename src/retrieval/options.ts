import type { GetContextOptions } from "../types/retrieval.types";

/**
 * Top-k bounds.
 *
 * `DEFAULT_TOP_K` is the legacy value (`docs/migration/MIGRATION_SPEC.md` §7) and stays until
 * measurement says otherwise — it sets prompt size and cost on every request.
 *
 * **`MAX_TOP_K` was raised from 10 to 50 on 2026-08-24.** The old ceiling was legacy parity, never
 * a measured choice, and it was silently binding: `retrieval:eval --k=20` returned exactly the
 * k=10 numbers because `resolveTopK` clamped, which reads as "more depth does not help" when the
 * request simply never happened. The retrieval harness needs to see the recall/precision curve
 * past 10 to choose a default at all (`docs/RETRIEVAL_EVAL.md` §4a).
 *
 * This is a ceiling on what a caller may *request*, not a change to what they get by default. It
 * does raise the worst case a `DEBUG_RETRIEVAL` caller can ask for: 50 chunks is roughly 27K
 * prompt tokens on this corpus, so the cap is what keeps a request from being unbounded rather
 * than what keeps it small.
 */
export const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 50;

/**
 * Normalizes a caller's `topK` into the supported range. Returns 0 for a non-positive
 * request, which adapters treat as "return nothing" — the legacy guard, kept so every
 * adapter degrades identically instead of each inventing its own edge-case behavior.
 */
export const resolveTopK = (opts?: GetContextOptions): number => {
  const requested = opts?.topK ?? DEFAULT_TOP_K;
  if (requested <= 0) {
    return 0;
  }
  return Math.min(requested, MAX_TOP_K);
};
