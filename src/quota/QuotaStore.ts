/**
 * The storage seam for quota counters.
 *
 * Deliberately tiny, and deliberately **not** an implementation detail of `QuotaService`. The
 * only implementation today is in-process (`InMemoryQuotaStore`), which is honest for a single
 * instance and wrong the moment there are two — see that file's header. Keeping the policy
 * (`QuotaService`) and the counting (`QuotaStore`) apart means swapping in Firestore or Redis
 * later is a new file plus one line at the composition root, not a rewrite of the gate.
 *
 * Every method takes `nowMs` explicitly rather than reading the clock itself. Window rollover is
 * the part most likely to be wrong, and a clock passed in is a clock a test can advance.
 */

/** What one key has spent inside the window containing the queried instant. */
export interface QuotaUsage {
  /** Chat requests admitted and recorded in this window. */
  requests: number;
  /** LLM tokens (`usage.totalTokens`) recorded in this window. */
  tokens: number;
  /** Inclusive start of the window, epoch ms. */
  windowStartMs: number;
  /** Exclusive end of the window — the instant the counters reset, epoch ms. */
  windowEndMs: number;
}

/** An increment. Both fields are optional so the two dimensions can be recorded separately. */
export interface QuotaDelta {
  requests?: number;
  tokens?: number;
}

export interface QuotaStore {
  /**
   * Usage for `key` in the window containing `nowMs`. Never throws and never returns
   * `undefined`: an unknown key has spent nothing, which is a usage of zero, not an error.
   */
  read(key: string, nowMs: number): QuotaUsage;
  /** Adds `delta` to `key`'s counters in the window containing `nowMs`. */
  record(key: string, delta: QuotaDelta, nowMs: number): void;
  /** Drops every counter. For tests and for an operator-triggered reset; not on any hot path. */
  reset(): void;
}

/**
 * Start of the fixed window containing `nowMs`, aligned to the Unix epoch.
 *
 * **Tumbling, not rolling.** Upstream's `checkQuota` mixes a rolling 7-day lookback (per user)
 * with a calendar month (per org); reproducing either needs per-event timestamps, which means
 * storing every event rather than two integers. Epoch-aligned buckets give every key the same
 * predictable reset instant and O(1) state, at two documented costs:
 *
 * - a caller can spend a full allowance either side of a boundary, so a burst of `2 x limit` is
 *   reachable across the seam;
 * - the boundary is epoch-aligned, so a `7d` window rolls over on **Thursday** 00:00 UTC, not on
 *   Sunday or on the caller's first request. Use `1d`/`24h` if that matters more than the length.
 */
export const windowStartFor = (nowMs: number, windowMs: number): number => (
  Math.floor(nowMs / windowMs) * windowMs
);
