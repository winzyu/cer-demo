import { config, UNLIMITED } from "../config";
import type { QuotaConfig, QuotaDimension, QuotaLimit } from "../config";
import type { ErrorCode } from "../utils/errors";
import { InMemoryQuotaStore } from "./InMemoryQuotaStore";
import type { QuotaStore, QuotaUsage } from "./QuotaStore";

/** The request may proceed. Carries the key so the caller records against the same bucket. */
export interface QuotaAllowed {
  allowed: true;
  key: string;
}

/** The request is refused, with every number needed to explain why without re-reading config. */
export interface QuotaRefusal {
  allowed: false;
  key: string;
  /** Which ceiling was hit. The two are independent — this names the one that actually bit. */
  dimension: QuotaDimension;
  limit: number;
  used: number;
  windowLabel: string;
  /** Epoch ms at which this key's counters reset. */
  resetAtMs: number;
  /** `resetAtMs` as whole seconds from now, floored at 1 — the `Retry-After` header value. */
  retryAfterSeconds: number;
}

export type QuotaDecision = QuotaAllowed | QuotaRefusal;

/** Distinct codes per dimension so a client can tell "too many questions" from "too expensive". */
const CODE_BY_DIMENSION: Readonly<Record<QuotaDimension, ErrorCode>> = {
  requests: "quota_requests_exceeded",
  tokens: "quota_tokens_exceeded",
};

export const quotaErrorCode = (refusal: QuotaRefusal): ErrorCode => (
  CODE_BY_DIMENSION[refusal.dimension]
);

/** Human prose for the refusal. Names the dimension, both numbers, the window, and the reset. */
export const quotaErrorMessage = (refusal: QuotaRefusal): string => {
  const noun = refusal.dimension === "requests" ? "chat requests" : "LLM tokens";
  return (
    `Query quota exceeded: ${refusal.used} of ${refusal.limit} ${noun} used in the current `
    + `${refusal.windowLabel} window. Quota resets at ${new Date(refusal.resetAtMs).toISOString()}.`
  );
};

/** `undefined` when the dimension is unlimited or still under its ceiling. */
const exceeded = (
  dimension: QuotaDimension,
  limit: QuotaLimit,
  used: number,
): { dimension: QuotaDimension; limit: number; used: number } | undefined => {
  if (limit === UNLIMITED) {
    return undefined;
  }
  // `>=`, not `>`: the check runs *before* the request, so a key that has spent its whole
  // allowance is done. `>` would hand out one extra of everything.
  return used >= limit ? { dimension, limit, used } : undefined;
};

/**
 * The quota policy: reads a key's usage, decides, and records what was spent.
 *
 * Split from `QuotaStore` on purpose — this file holds *what the limits mean*, that file holds
 * *where the numbers live*. The two dimensions are checked independently and either can be
 * `"unlimited"`, so `QUERY_QUOTA_REQUESTS=50` with tokens unlimited, or the reverse, or both, are
 * all first-class configurations rather than special cases.
 *
 * **Token accounting is retrospective, and that is not a bug to be fixed later.** A prompt's cost
 * is unknown until the provider answers, so the token ceiling is enforced against usage already
 * recorded: the request that crosses the line completes, and the next one is refused. The
 * overshoot is bounded by one answer's `LLM_MAX_TOKENS`. Refusing pre-emptively would require
 * estimating cost before the call, which trades a bounded overshoot for a systematic guess.
 */
export class QuotaService {
  private readonly policy: QuotaConfig;

  private readonly store: QuotaStore;

  constructor(
    policy: QuotaConfig = config.quota,
    store: QuotaStore = new InMemoryQuotaStore(policy.windowMs),
  ) {
    this.policy = policy;
    this.store = store;
  }

  /** `false` means nothing is counted and nothing is refused — see `QUERY_QUOTA`. */
  get enabled(): boolean {
    return this.policy.enabled;
  }

  /**
   * Decides whether `key` may make another chat request.
   *
   * Checked before the request runs, against usage already recorded. `requests` is evaluated
   * first, so when both ceilings are simultaneously exhausted the refusal names the request
   * count — the cheaper, more legible thing for an operator to raise.
   */
  check(key: string, nowMs: number = Date.now()): QuotaDecision {
    if (!this.policy.enabled) {
      return { allowed: true, key };
    }

    const usage = this.store.read(key, nowMs);
    const refusal = exceeded("requests", this.policy.requests, usage.requests)
      ?? exceeded("tokens", this.policy.tokens, usage.tokens);

    if (!refusal) {
      return { allowed: true, key };
    }

    return {
      allowed: false,
      key,
      ...refusal,
      windowLabel: this.policy.windowLabel,
      resetAtMs: usage.windowEndMs,
      // Floored at 1: a `Retry-After: 0` invites an immediate retry that is guaranteed to fail.
      retryAfterSeconds: Math.max(1, Math.ceil((usage.windowEndMs - nowMs) / 1000)),
    };
  }

  /**
   * Counts one admitted request.
   *
   * Called after validation rather than at the gate, so a malformed body — a 400 that never
   * reached retrieval or the model — does not burn somebody's weekly allowance.
   */
  recordRequest(key: string, nowMs: number = Date.now()): void {
    if (!this.policy.enabled) {
      return;
    }
    this.store.record(key, { requests: 1 }, nowMs);
  }

  /**
   * Adds an answer's token cost. `undefined` and non-finite values are dropped rather than
   * coerced: `LlmUsage.totalTokens` is optional because some providers omit it, and counting a
   * missing number as `0` is indistinguishable from a genuinely free answer.
   */
  recordTokens(key: string, tokens: number | undefined, nowMs: number = Date.now()): void {
    if (!this.policy.enabled || typeof tokens !== "number" || !Number.isFinite(tokens)) {
      return;
    }
    this.store.record(key, { tokens: Math.max(0, Math.round(tokens)) }, nowMs);
  }

  /** Current usage for a key. Exposed for diagnostics and tests, not used by the gate. */
  usage(key: string, nowMs: number = Date.now()): QuotaUsage {
    return this.store.read(key, nowMs);
  }

  /** Clears every counter. */
  reset(): void {
    this.store.reset();
  }
}
