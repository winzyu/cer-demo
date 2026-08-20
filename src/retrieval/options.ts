import type { GetContextOptions } from "../types/retrieval.types";

/**
 * Top-k bounds carried over from the legacy service so retrieval behavior stays
 * comparable across the migration (docs/migration/MIGRATION_SPEC.md §7: default 5,
 * caller-capped 1–10).
 */
export const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 10;

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
