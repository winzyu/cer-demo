import {
  QuotaDelta, QuotaStore, QuotaUsage, windowStartFor,
} from "./QuotaStore";

interface Bucket {
  windowStartMs: number;
  requests: number;
  tokens: number;
}

/**
 * Process-local quota counters: a `Map` of key → one window's two integers.
 *
 * ## What this is wrong about, stated plainly
 *
 * - **It resets on redeploy and on crash.** Every restart hands the whole fleet a fresh
 *   allowance. For a demo that is a mild annoyance; for a paid tier it is the whole gate.
 * - **It is per instance.** Two Cloud Run containers behind the same URL enforce two separate
 *   quotas, so the effective limit is `limit x instances` and which one a caller hits is a
 *   load-balancer decision. Anything that must actually bound spend needs a shared store.
 * - **It is not transactional.** Read-then-record has a gap; concurrent requests from one key
 *   can both pass a check that only one should have. Bounded by the concurrency of a single
 *   Node process against a single key, so it overshoots by a request or two, not by orders of
 *   magnitude.
 *
 * None of that blocks the immediate purpose — letting the team try limits and see them bite —
 * and the seam it sits behind (`QuotaStore`) is where a durable store lands when it stops being
 * acceptable. `docs/SPECS.md` §4a carries the same caveat where an operator will find it.
 */
export class InMemoryQuotaStore implements QuotaStore {
  private readonly windowMs: number;

  private readonly buckets = new Map<string, Bucket>();

  /**
   * Keys are caller-derived (a token hash or an IP), so their count is bounded by the callers,
   * not by us. Sweeping only when the map is large keeps the common path free of housekeeping
   * while stopping a long-lived process from retaining a bucket per IP seen since boot.
   */
  private static readonly SWEEP_THRESHOLD = 10_000;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  read(key: string, nowMs: number): QuotaUsage {
    const windowStartMs = windowStartFor(nowMs, this.windowMs);
    const bucket = this.buckets.get(key);
    // A bucket from a previous window is not this window's usage. It is left in place rather
    // than deleted here so `read` stays free of side effects; the sweep collects it.
    const live = bucket && bucket.windowStartMs === windowStartMs ? bucket : undefined;
    return {
      requests: live?.requests ?? 0,
      tokens: live?.tokens ?? 0,
      windowStartMs,
      windowEndMs: windowStartMs + this.windowMs,
    };
  }

  record(key: string, delta: QuotaDelta, nowMs: number): void {
    const windowStartMs = windowStartFor(nowMs, this.windowMs);
    const existing = this.buckets.get(key);
    const bucket = existing && existing.windowStartMs === windowStartMs
      ? existing
      : { windowStartMs, requests: 0, tokens: 0 };

    bucket.requests += delta.requests ?? 0;
    bucket.tokens += delta.tokens ?? 0;
    this.buckets.set(key, bucket);

    if (this.buckets.size > InMemoryQuotaStore.SWEEP_THRESHOLD) {
      this.sweep(windowStartMs);
    }
  }

  reset(): void {
    this.buckets.clear();
  }

  /** Drops buckets whose window has already closed — they can never be read again. */
  private sweep(currentWindowStartMs: number): void {
    this.buckets.forEach((bucket, key) => {
      if (bucket.windowStartMs < currentWindowStartMs) {
        this.buckets.delete(key);
      }
    });
  }
}
