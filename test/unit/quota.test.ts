import type { Request } from "express";
import type { QuotaConfig } from "../../src/config";
import { InMemoryQuotaStore } from "../../src/quota/InMemoryQuotaStore";
import { windowStartFor } from "../../src/quota/QuotaStore";
import {
  QuotaService,
  quotaErrorCode,
  quotaErrorMessage,
} from "../../src/quota/QuotaService";
import type { QuotaRefusal } from "../../src/quota/QuotaService";
import { quotaKeyFor } from "../../src/quota/quotaKey";

const HOUR_MS = 3_600_000;

/**
 * Policies are built here rather than read from `config`, so every assertion states the limits
 * it is asserting about. Reading the process environment instead would make this suite pass or
 * fail on whatever the developer last exported.
 */
const policy = (over: Partial<QuotaConfig> = {}): QuotaConfig => ({
  enabled: true,
  requests: "unlimited",
  tokens: "unlimited",
  windowMs: HOUR_MS,
  windowLabel: "1h",
  scope: "caller",
  ...over,
});

/** A service whose clock the test drives — window rollover is the part worth pinning. */
const serviceFor = (over: Partial<QuotaConfig> = {}): QuotaService => {
  const resolved = policy(over);
  return new QuotaService(resolved, new InMemoryQuotaStore(resolved.windowMs));
};

const KEY = "token:abc";

/** Spends `n` requests, asserting each was admitted. */
const spendRequests = (service: QuotaService, n: number, nowMs: number): void => {
  Array.from({ length: n }).forEach(() => {
    expect(service.check(KEY, nowMs).allowed).toBe(true);
    service.recordRequest(KEY, nowMs);
  });
};

describe("QuotaService — unlimited", () => {
  it("admits everything and counts nothing when QUERY_QUOTA is off", () => {
    // The shipped default. Every method must be inert, not merely permissive: a disabled quota
    // that still counted would start refusing the moment somebody flipped the switch on a
    // long-running process, using numbers accumulated while the gate was supposedly off.
    const service = serviceFor({ enabled: false, requests: 1, tokens: 1 });

    Array.from({ length: 50 }).forEach(() => {
      expect(service.check(KEY).allowed).toBe(true);
      service.recordRequest(KEY);
      service.recordTokens(KEY, 10_000);
    });

    expect(service.enabled).toBe(false);
    expect(service.usage(KEY)).toMatchObject({ requests: 0, tokens: 0 });
  });

  it("admits everything when enabled but both dimensions are unlimited", () => {
    const service = serviceFor();

    Array.from({ length: 50 }).forEach(() => {
      expect(service.check(KEY).allowed).toBe(true);
      service.recordRequest(KEY);
      service.recordTokens(KEY, 10_000);
    });

    // Counted, unlike the disabled case above — the numbers are real, nothing is refused.
    expect(service.usage(KEY)).toMatchObject({ requests: 50, tokens: 500_000 });
  });
});

describe("QuotaService — request-count limit", () => {
  it("admits exactly `limit` requests, then refuses", () => {
    const service = serviceFor({ requests: 3 });
    const now = 10 * HOUR_MS;

    spendRequests(service, 3, now);

    const decision = service.check(KEY, now);
    expect(decision.allowed).toBe(false);
    const refusal = decision as QuotaRefusal;
    expect(refusal.dimension).toBe("requests");
    expect(refusal.limit).toBe(3);
    expect(refusal.used).toBe(3);
  });

  it("refuses at the ceiling rather than one past it", () => {
    // `>=`, not `>`. A `>` comparison silently grants limit+1 of everything, which is the kind
    // of off-by-one that only shows up as "the 3-message tier hands out 4 messages".
    const service = serviceFor({ requests: 1 });
    spendRequests(service, 1, 0);
    expect(service.check(KEY, 0).allowed).toBe(false);
  });

  it("refuses every request when the limit is 0", () => {
    const service = serviceFor({ requests: 0 });
    expect(service.check(KEY, 0).allowed).toBe(false);
  });

  it("keeps separate buckets per key", () => {
    const service = serviceFor({ requests: 1 });
    spendRequests(service, 1, 0);

    expect(service.check(KEY, 0).allowed).toBe(false);
    expect(service.check("token:other", 0).allowed).toBe(true);
  });

  it("reports a Retry-After that lands on the window boundary", () => {
    const service = serviceFor({ requests: 1, windowMs: HOUR_MS, windowLabel: "1h" });
    const now = HOUR_MS * 5 + 1_800_000; // half an hour into a window
    spendRequests(service, 1, now);

    const refusal = service.check(KEY, now) as QuotaRefusal;
    expect(refusal.resetAtMs).toBe(HOUR_MS * 6);
    expect(refusal.retryAfterSeconds).toBe(1800);
  });
});

describe("QuotaService — token limit", () => {
  it("admits until recorded tokens reach the ceiling, then refuses", () => {
    const service = serviceFor({ tokens: 1000 });

    expect(service.check(KEY, 0).allowed).toBe(true);
    service.recordTokens(KEY, 400, 0);
    expect(service.check(KEY, 0).allowed).toBe(true);
    service.recordTokens(KEY, 400, 0);
    expect(service.check(KEY, 0).allowed).toBe(true);

    // The answer that crosses the line is allowed to finish — cost is only known afterwards.
    service.recordTokens(KEY, 400, 0);
    const refusal = service.check(KEY, 0) as QuotaRefusal;
    expect(refusal.allowed).toBe(false);
    expect(refusal.dimension).toBe("tokens");
    expect(refusal.limit).toBe(1000);
    expect(refusal.used).toBe(1200);
  });

  it("ignores an absent or non-finite token count instead of charging zero", () => {
    // `LlmUsage.totalTokens` is optional: some providers omit it. "Not reported" and "free" are
    // different facts, and collapsing them would let a provider that omits usage run unbounded
    // *and* look like it answered for nothing.
    const service = serviceFor({ tokens: 100 });

    service.recordTokens(KEY, undefined, 0);
    service.recordTokens(KEY, Number.NaN, 0);
    service.recordTokens(KEY, Number.POSITIVE_INFINITY, 0);

    expect(service.usage(KEY, 0).tokens).toBe(0);
    expect(service.check(KEY, 0).allowed).toBe(true);
  });
});

describe("QuotaService — dimensions are independent", () => {
  it("enforces requests while tokens are unlimited", () => {
    const service = serviceFor({ requests: 2, tokens: "unlimited" });

    spendRequests(service, 2, 0);
    service.recordTokens(KEY, 10_000_000, 0);

    const refusal = service.check(KEY, 0) as QuotaRefusal;
    expect(refusal.dimension).toBe("requests");
  });

  it("enforces tokens while requests are unlimited", () => {
    const service = serviceFor({ requests: "unlimited", tokens: 50 });

    spendRequests(service, 500, 0);
    expect(service.check(KEY, 0).allowed).toBe(true);

    service.recordTokens(KEY, 50, 0);
    const refusal = service.check(KEY, 0) as QuotaRefusal;
    expect(refusal.dimension).toBe("tokens");
  });

  it("names the request dimension first when both are exhausted at once", () => {
    // Documented precedence, not an accident: an operator raising a ceiling should be pointed at
    // the cheaper, more legible one first.
    const service = serviceFor({ requests: 1, tokens: 1 });
    spendRequests(service, 1, 0);
    service.recordTokens(KEY, 1, 0);

    expect((service.check(KEY, 0) as QuotaRefusal).dimension).toBe("requests");
  });
});

describe("QuotaService — window rollover", () => {
  it("resets both dimensions at the window boundary", () => {
    const service = serviceFor({ requests: 2, tokens: 100, windowMs: HOUR_MS });
    const windowOne = 3 * HOUR_MS;

    spendRequests(service, 2, windowOne);
    service.recordTokens(KEY, 500, windowOne);
    expect(service.check(KEY, windowOne).allowed).toBe(false);

    // Still inside the same window at the last millisecond.
    expect(service.check(KEY, windowOne + HOUR_MS - 1).allowed).toBe(false);

    // First millisecond of the next one.
    const windowTwo = windowOne + HOUR_MS;
    expect(service.check(KEY, windowTwo).allowed).toBe(true);
    expect(service.usage(KEY, windowTwo)).toMatchObject({ requests: 0, tokens: 0 });
  });

  it("does not carry usage backwards into an earlier window", () => {
    const service = serviceFor({ requests: 1, windowMs: HOUR_MS });
    spendRequests(service, 1, 2 * HOUR_MS);

    expect(service.usage(KEY, 1 * HOUR_MS)).toMatchObject({ requests: 0 });
  });
});

describe("InMemoryQuotaStore", () => {
  it("aligns windows to the epoch", () => {
    expect(windowStartFor(0, HOUR_MS)).toBe(0);
    expect(windowStartFor(HOUR_MS - 1, HOUR_MS)).toBe(0);
    expect(windowStartFor(HOUR_MS, HOUR_MS)).toBe(HOUR_MS);
  });

  it("reports an unknown key as zero usage with this window's bounds", () => {
    const store = new InMemoryQuotaStore(HOUR_MS);
    const usage = store.read("nobody", HOUR_MS * 4 + 5);

    expect(usage).toEqual({
      requests: 0,
      tokens: 0,
      windowStartMs: HOUR_MS * 4,
      windowEndMs: HOUR_MS * 5,
    });
  });

  it("accumulates the two dimensions independently and clears on reset", () => {
    const store = new InMemoryQuotaStore(HOUR_MS);
    store.record("k", { requests: 1 }, 0);
    store.record("k", { tokens: 42 }, 0);
    store.record("k", { requests: 1, tokens: 8 }, 0);

    expect(store.read("k", 0)).toMatchObject({ requests: 2, tokens: 50 });

    store.reset();
    expect(store.read("k", 0)).toMatchObject({ requests: 0, tokens: 0 });
  });
});

describe("quotaKeyFor", () => {
  const reqWith = (over: Partial<Request>): Request => ({
    headers: {},
    ...over,
  } as Request);

  it("collapses every caller into one bucket under global scope", () => {
    const a = quotaKeyFor(reqWith({ headers: { authorization: "Bearer aaa" } }), "global");
    const b = quotaKeyFor(reqWith({ ip: "10.0.0.1" }), "global");

    expect(a).toBe("global");
    expect(b).toBe("global");
  });

  it("keys on a hash of the bearer token, never the token itself", () => {
    const token = "super-secret-jwt";
    const key = quotaKeyFor(reqWith({ headers: { authorization: `Bearer ${token}` } }), "caller");

    expect(key).toMatch(/^token:[0-9a-f]{16}$/);
    expect(key).not.toContain(token);
  });

  it("gives the same token the same bucket and different tokens different buckets", () => {
    const one = quotaKeyFor(reqWith({ headers: { authorization: "Bearer aaa" } }), "caller");
    const same = quotaKeyFor(reqWith({ headers: { authorization: "Bearer aaa" } }), "caller");
    const other = quotaKeyFor(reqWith({ headers: { authorization: "Bearer bbb" } }), "caller");

    expect(same).toBe(one);
    expect(other).not.toBe(one);
  });

  it("falls back to the client IP, normalizing the IPv4-mapped form", () => {
    // `127.0.0.1` and `::ffff:127.0.0.1` are one caller; two buckets would double the allowance
    // depending on which socket family the connection happened to use.
    expect(quotaKeyFor(reqWith({ ip: "::ffff:127.0.0.1" }), "caller")).toBe("ip:127.0.0.1");
    expect(quotaKeyFor(reqWith({ ip: "127.0.0.1" }), "caller")).toBe("ip:127.0.0.1");
  });

  it("prefers the token over the IP when both are present", () => {
    const key = quotaKeyFor(
      reqWith({ headers: { authorization: "Bearer aaa" }, ip: "10.0.0.1" }),
      "caller",
    );
    expect(key).toMatch(/^token:/);
  });

  it("shares one bucket among callers with neither token nor IP", () => {
    // Not a per-request key: being unattributable must not buy an unlimited allowance.
    expect(quotaKeyFor(reqWith({}), "caller")).toBe("anonymous");
  });

  it("ignores a malformed Authorization header rather than keying on it", () => {
    expect(quotaKeyFor(reqWith({ headers: { authorization: "Bearer " }, ip: "10.0.0.1" }), "caller"))
      .toBe("ip:10.0.0.1");
  });
});

describe("refusal reporting", () => {
  const refuse = (over: Partial<QuotaConfig>): QuotaRefusal => {
    const service = serviceFor(over);
    spendRequests(service, 0, 0);
    return service.check(KEY, 0) as QuotaRefusal;
  };

  it("uses a distinct error code per dimension", () => {
    expect(quotaErrorCode(refuse({ requests: 0 }))).toBe("quota_requests_exceeded");
    expect(quotaErrorCode(refuse({ tokens: 0 }))).toBe("quota_tokens_exceeded");
  });

  it("states the dimension, both numbers, the window and the reset instant", () => {
    const service = serviceFor({ requests: 2, windowMs: HOUR_MS, windowLabel: "1h" });
    spendRequests(service, 2, 0);
    const message = quotaErrorMessage(service.check(KEY, 0) as QuotaRefusal);

    expect(message).toContain("2 of 2 chat requests");
    expect(message).toContain("1h window");
    expect(message).toContain(new Date(HOUR_MS).toISOString());
  });
});
