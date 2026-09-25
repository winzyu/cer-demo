/**
 * The storage seam for quota counters.
 *
 * Deliberately tiny, and deliberately **not** an implementation detail of `QuotaService`. Two
 * implementations: in-process (`InMemoryQuotaStore`), for tests and local runs, and Firestore
 * (`FirestoreQuotaStore`), for a deployment; `QUERY_QUOTA_STORE` picks one at the composition
 * root. Keeping the policy (`QuotaService`) and the counting (`QuotaStore`) apart is what made the
 * second a new file rather than a rewrite of the gate.
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
  /** Report PDFs rendered and recorded in this window. */
  reports: number;
  /** Inclusive start of the window, epoch ms. */
  windowStartMs: number;
  /** Exclusive end of the window — the instant the counters reset, epoch ms. */
  windowEndMs: number;
}

/** An increment. Every field is optional so each dimension can be recorded separately. */
export interface QuotaDelta {
  requests?: number;
  tokens?: number;
  reports?: number;
}

/**
 * Who a record is for. `key` is the bucket (`quotaKeyFor`); the other two are labels a durable
 * store keeps beside the counters so a document names its user and organization. They are absent
 * when the service check is off and the key is a token hash, an IP or `global`.
 */
export interface QuotaSubject {
  key: string;
  userId?: string;
  organizationId?: string | null;
}

/**
 * Asynchronous because the durable implementation is a network call; the in-memory one resolves
 * at once. There is deliberately no `reset`: on a shared store it would clear every user's
 * counters, which is not an operation a request path should be able to reach.
 */
export interface QuotaStore {
  /**
   * Usage for `key` in the window containing `nowMs`. An unknown key has spent nothing, which is
   * a usage of zero, not an error. Rejects only when the store itself cannot be reached.
   */
  read(key: string, nowMs: number): Promise<QuotaUsage>;
  /** Adds `delta` to the subject's counters in the window containing `nowMs`. */
  record(subject: QuotaSubject, delta: QuotaDelta, nowMs: number): Promise<void>;
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
