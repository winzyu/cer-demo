import type { Request } from "express";
import type { QuotaConfig } from "../../src/config";
import { InMemoryQuotaStore } from "../../src/quota/InMemoryQuotaStore";
import { windowStartFor } from "../../src/quota/QuotaStore";
import type { QuotaStore } from "../../src/quota/QuotaStore";
import {
  QuotaService,
  quotaErrorCode,
  quotaErrorMessage,
} from "../../src/quota/QuotaService";
import type { QuotaRefusal } from "../../src/quota/QuotaService";
import { quotaKeyFor, quotaSubjectFor } from "../../src/quota/quotaKey";
import { setVerifiedIdentity } from "../../src/utils/serviceIdentity";

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
  reports: "unlimited",
  windowMs: HOUR_MS,
  windowLabel: "1h",
  scope: "caller",
  store: "memory",
  warnAt: 0.2,
  ...over,
});

/** Runs `step` `n` times in order; the store is async, so a `forEach` would not wait. */
const times = async (n: number, step: () => Promise<void>): Promise<void> => {
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await step();
  }
};

/** A service whose clock the test drives — window rollover is the part worth pinning. */
const serviceFor = (over: Partial<QuotaConfig> = {}): QuotaService => {
  const resolved = policy(over);
  return new QuotaService(resolved, new InMemoryQuotaStore(resolved.windowMs));
};

const KEY = "token:abc";

/** Spends `n` requests, asserting each was admitted. */
const spendRequests = (service: QuotaService, n: number, nowMs: number): Promise<void> => (
  times(n, async () => {
    expect((await service.check(KEY, nowMs)).allowed).toBe(true);
    await service.recordRequest(KEY, nowMs);
  })
);

describe("QuotaService — unlimited", () => {
  it("admits everything and counts nothing when QUERY_QUOTA is off", async () => {
    // The shipped default. Every method must be inert, not merely permissive: a disabled quota
    // that still counted would start refusing the moment somebody flipped the switch on a
    // long-running process, using numbers accumulated while the gate was supposedly off.
    const service = serviceFor({ enabled: false, requests: 1, tokens: 1 });

    await times(50, async () => {
      expect((await service.check(KEY)).allowed).toBe(true);
      await service.recordRequest(KEY);
      await service.recordTokens(KEY, 10_000);
    });

    expect(service.enabled).toBe(false);
    expect((await service.usage(KEY))).toMatchObject({ requests: 0, tokens: 0 });
  });

  it("admits everything when enabled but both dimensions are unlimited", async () => {
    const service = serviceFor();

    await times(50, async () => {
      expect((await service.check(KEY)).allowed).toBe(true);
      await service.recordRequest(KEY);
      await service.recordTokens(KEY, 10_000);
    });

    // Counted, unlike the disabled case above — the numbers are real, nothing is refused.
    expect((await service.usage(KEY))).toMatchObject({ requests: 50, tokens: 500_000 });
  });
});

describe("QuotaService — request-count limit", () => {
  it("admits exactly `limit` requests, then refuses", async () => {
    const service = serviceFor({ requests: 3 });
    const now = 10 * HOUR_MS;

    await spendRequests(service, 3, now);

    const decision = (await service.check(KEY, now));
    expect(decision.allowed).toBe(false);
    const refusal = decision as QuotaRefusal;
    expect(refusal.dimension).toBe("requests");
    expect(refusal.limit).toBe(3);
    expect(refusal.used).toBe(3);
  });

  it("refuses at the ceiling rather than one past it", async () => {
    // `>=`, not `>`. A `>` comparison silently grants limit+1 of everything, which is the kind
    // of off-by-one that only shows up as "the 3-message tier hands out 4 messages".
    const service = serviceFor({ requests: 1 });
    await spendRequests(service, 1, 0);
    expect((await service.check(KEY, 0)).allowed).toBe(false);
  });

  it("refuses every request when the limit is 0", async () => {
    const service = serviceFor({ requests: 0 });
    expect((await service.check(KEY, 0)).allowed).toBe(false);
  });

  it("keeps separate buckets per key", async () => {
    const service = serviceFor({ requests: 1 });
    await spendRequests(service, 1, 0);

    expect((await service.check(KEY, 0)).allowed).toBe(false);
    expect((await service.check("token:other", 0)).allowed).toBe(true);
  });

  it("reports a Retry-After that lands on the window boundary", async () => {
    const service = serviceFor({ requests: 1, windowMs: HOUR_MS, windowLabel: "1h" });
    const now = HOUR_MS * 5 + 1_800_000; // half an hour into a window
    await spendRequests(service, 1, now);

    const refusal = (await service.check(KEY, now)) as QuotaRefusal;
    expect(refusal.resetAtMs).toBe(HOUR_MS * 6);
    expect(refusal.retryAfterSeconds).toBe(1800);
  });
});

describe("QuotaService — token limit", () => {
  it("admits until recorded tokens reach the ceiling, then refuses", async () => {
    const service = serviceFor({ tokens: 1000 });

    expect((await service.check(KEY, 0)).allowed).toBe(true);
    await service.recordTokens(KEY, 400, 0);
    expect((await service.check(KEY, 0)).allowed).toBe(true);
    await service.recordTokens(KEY, 400, 0);
    expect((await service.check(KEY, 0)).allowed).toBe(true);

    // The answer that crosses the line is allowed to finish — cost is only known afterwards.
    await service.recordTokens(KEY, 400, 0);
    const refusal = (await service.check(KEY, 0)) as QuotaRefusal;
    expect(refusal.allowed).toBe(false);
    expect(refusal.dimension).toBe("tokens");
    expect(refusal.limit).toBe(1000);
    expect(refusal.used).toBe(1200);
  });

  it("ignores an absent or non-finite token count instead of charging zero", async () => {
    // `LlmUsage.totalTokens` is optional: some providers omit it. "Not reported" and "free" are
    // different facts, and collapsing them would let a provider that omits usage run unbounded
    // *and* look like it answered for nothing.
    const service = serviceFor({ tokens: 100 });

    await service.recordTokens(KEY, undefined, 0);
    await service.recordTokens(KEY, Number.NaN, 0);
    await service.recordTokens(KEY, Number.POSITIVE_INFINITY, 0);

    expect((await service.usage(KEY, 0)).tokens).toBe(0);
    expect((await service.check(KEY, 0)).allowed).toBe(true);
  });
});

describe("QuotaService — dimensions are independent", () => {
  it("enforces requests while tokens are unlimited", async () => {
    const service = serviceFor({ requests: 2, tokens: "unlimited" });

    await spendRequests(service, 2, 0);
    await service.recordTokens(KEY, 10_000_000, 0);

    const refusal = (await service.check(KEY, 0)) as QuotaRefusal;
    expect(refusal.dimension).toBe("requests");
  });

  it("enforces tokens while requests are unlimited", async () => {
    const service = serviceFor({ requests: "unlimited", tokens: 50 });

    await spendRequests(service, 500, 0);
    expect((await service.check(KEY, 0)).allowed).toBe(true);

    await service.recordTokens(KEY, 50, 0);
    const refusal = (await service.check(KEY, 0)) as QuotaRefusal;
    expect(refusal.dimension).toBe("tokens");
  });

  it("names the request dimension first when both are exhausted at once", async () => {
    // Documented precedence, not an accident: an operator raising a ceiling should be pointed at
    // the cheaper, more legible one first.
    const service = serviceFor({ requests: 1, tokens: 1 });
    await spendRequests(service, 1, 0);
    await service.recordTokens(KEY, 1, 0);

    expect(((await service.check(KEY, 0)) as QuotaRefusal).dimension).toBe("requests");
  });
});

describe("QuotaService - report limit", () => {
  it("admits exactly `limit` reports, then refuses with the report dimension", async () => {
    const service = serviceFor({ reports: 2 });
    await service.recordReport(KEY, 0);
    expect((await service.checkReport(KEY, 0)).allowed).toBe(true);
    await service.recordReport(KEY, 0);

    const decision = (await service.checkReport(KEY, 0));
    expect(decision).toMatchObject({ allowed: false, dimension: "reports", limit: 2, used: 2 });
    if (!decision.allowed) {
      expect(quotaErrorCode(decision)).toBe("quota_reports_exceeded");
      expect(quotaErrorMessage(decision)).toMatch(/^Report quota exceeded: 2 of 2 reports used/);
    }
  });

  it("keeps reports and chat independent in both directions", async () => {
    const service = serviceFor({ requests: 1, reports: 1 });

    // Questions spent: a report still downloads, and recording it charges no question.
    await spendRequests(service, 1, 0);
    expect((await service.check(KEY, 0)).allowed).toBe(false);
    expect((await service.checkReport(KEY, 0)).allowed).toBe(true);

    const other = serviceFor({ requests: 1, reports: 1 });
    await other.recordReport(KEY, 0);
    expect((await other.checkReport(KEY, 0)).allowed).toBe(false);
    expect((await other.check(KEY, 0)).allowed).toBe(true);
    expect((await other.usage(KEY, 0))).toMatchObject({ requests: 0, reports: 1 });
  });

  it("counts nothing while QUERY_QUOTA is off", async () => {
    const service = serviceFor({ enabled: false, reports: 0 });
    await service.recordReport(KEY, 0);

    expect((await service.checkReport(KEY, 0)).allowed).toBe(true);
    expect((await service.usage(KEY, 0)).reports).toBe(0);
  });
});

describe("QuotaService — window rollover", () => {
  it("resets both dimensions at the window boundary", async () => {
    const service = serviceFor({ requests: 2, tokens: 100, windowMs: HOUR_MS });
    const windowOne = 3 * HOUR_MS;

    await spendRequests(service, 2, windowOne);
    await service.recordTokens(KEY, 500, windowOne);
    expect((await service.check(KEY, windowOne)).allowed).toBe(false);

    // Still inside the same window at the last millisecond.
    expect((await service.check(KEY, windowOne + HOUR_MS - 1)).allowed).toBe(false);

    // First millisecond of the next one.
    const windowTwo = windowOne + HOUR_MS;
    expect((await service.check(KEY, windowTwo)).allowed).toBe(true);
    expect((await service.usage(KEY, windowTwo))).toMatchObject({ requests: 0, tokens: 0 });
  });

  it("does not carry usage backwards into an earlier window", async () => {
    const service = serviceFor({ requests: 1, windowMs: HOUR_MS });
    await spendRequests(service, 1, 2 * HOUR_MS);

    expect((await service.usage(KEY, 1 * HOUR_MS))).toMatchObject({ requests: 0 });
  });
});

describe("InMemoryQuotaStore", () => {
  it("aligns windows to the epoch", async () => {
    expect(windowStartFor(0, HOUR_MS)).toBe(0);
    expect(windowStartFor(HOUR_MS - 1, HOUR_MS)).toBe(0);
    expect(windowStartFor(HOUR_MS, HOUR_MS)).toBe(HOUR_MS);
  });

  it("reports an unknown key as zero usage with this window's bounds", async () => {
    const store = new InMemoryQuotaStore(HOUR_MS);
    const usage = (await store.read("nobody", HOUR_MS * 4 + 5));

    expect(usage).toEqual({
      requests: 0,
      tokens: 0,
      reports: 0,
      windowStartMs: HOUR_MS * 4,
      windowEndMs: HOUR_MS * 5,
    });
  });

  it("accumulates the two dimensions independently and clears on reset", async () => {
    const store = new InMemoryQuotaStore(HOUR_MS);
    await store.record({ key: "k" }, { requests: 1 }, 0);
    await store.record({ key: "k" }, { tokens: 42 }, 0);
    await store.record({ key: "k" }, { requests: 1, tokens: 8 }, 0);

    expect((await store.read("k", 0))).toMatchObject({ requests: 2, tokens: 50 });

    store.reset();
    expect((await store.read("k", 0))).toMatchObject({ requests: 0, tokens: 0 });
  });
});

describe("QuotaService - an unreachable store", () => {
  const broken: QuotaStore = {
    read: () => Promise.reject(new Error("firestore down")),
    record: () => Promise.reject(new Error("firestore down")),
  };
  const service = new QuotaService(policy({ requests: 5 }), broken);

  it("fails the check and the question count closed, before any model spend", async () => {
    await expect(service.check(KEY, 0)).rejects.toThrow("firestore down");
    await expect(service.recordRequest(KEY, 0)).rejects.toThrow("firestore down");
  });

  it("never fails an answer or report that already exists over a lost count", async () => {
    await expect(service.recordTokens(KEY, 100, 0)).resolves.toBeUndefined();
    await expect(service.recordReport(KEY, 0)).resolves.toBeUndefined();
  });
});

describe("quotaKeyFor", () => {
  const reqWith = (over: Partial<Request>): Request => ({
    headers: {},
    ...over,
  } as Request);

  it("collapses every caller into one bucket under global scope", async () => {
    const a = quotaKeyFor(reqWith({ headers: { authorization: "Bearer aaa" } }), "global");
    const b = quotaKeyFor(reqWith({ ip: "10.0.0.1" }), "global");

    expect(a).toBe("global");
    expect(b).toBe("global");
  });

  it("keys on a hash of the bearer token, never the token itself", async () => {
    const token = "super-secret-jwt";
    const key = quotaKeyFor(reqWith({ headers: { authorization: `Bearer ${token}` } }), "caller");

    expect(key).toMatch(/^token:[0-9a-f]{16}$/);
    expect(key).not.toContain(token);
  });

  it("gives the same token the same bucket and different tokens different buckets", async () => {
    const one = quotaKeyFor(reqWith({ headers: { authorization: "Bearer aaa" } }), "caller");
    const same = quotaKeyFor(reqWith({ headers: { authorization: "Bearer aaa" } }), "caller");
    const other = quotaKeyFor(reqWith({ headers: { authorization: "Bearer bbb" } }), "caller");

    expect(same).toBe(one);
    expect(other).not.toBe(one);
  });

  it("falls back to the client IP, normalizing the IPv4-mapped form", async () => {
    // `127.0.0.1` and `::ffff:127.0.0.1` are one caller; two buckets would double the allowance
    // depending on which socket family the connection happened to use.
    expect(quotaKeyFor(reqWith({ ip: "::ffff:127.0.0.1" }), "caller")).toBe("ip:127.0.0.1");
    expect(quotaKeyFor(reqWith({ ip: "127.0.0.1" }), "caller")).toBe("ip:127.0.0.1");
  });

  it("prefers the token over the IP when both are present", async () => {
    const key = quotaKeyFor(
      reqWith({ headers: { authorization: "Bearer aaa" }, ip: "10.0.0.1" }),
      "caller",
    );
    expect(key).toMatch(/^token:/);
  });

  it("shares one bucket among callers with neither token nor IP", async () => {
    // Not a per-request key: being unattributable must not buy an unlimited allowance.
    expect(quotaKeyFor(reqWith({}), "caller")).toBe("anonymous");
  });

  it("ignores a malformed Authorization header rather than keying on it", async () => {
    expect(quotaKeyFor(reqWith({ headers: { authorization: "Bearer " }, ip: "10.0.0.1" }), "caller"))
      .toBe("ip:10.0.0.1");
  });

  it("keys on the user the CER server vouched for, ahead of the token", () => {
    // A fresh login is a fresh token; keyed on the user, it is not a fresh allowance.
    const req = reqWith({ headers: { authorization: "Bearer aaa" } });
    setVerifiedIdentity(req, { userId: "u-123", organizationId: "org-9" });

    expect(quotaKeyFor(req, "caller")).toBe("user:u-123");
    expect(quotaSubjectFor(req, "caller"))
      .toEqual({ key: "user:u-123", userId: "u-123", organizationId: "org-9" });
  });

  it("ignores identity headers nobody verified", () => {
    // Only `requireServiceKey` sets a verified identity; a header alone is anyone's claim.
    const req = reqWith({ headers: { "x-cer-rag-user-id": "u-123", authorization: "Bearer aaa" } });
    expect(quotaKeyFor(req, "caller")).toMatch(/^token:/);
    expect(quotaSubjectFor(req, "caller")).toEqual({ key: quotaKeyFor(req, "caller") });
  });

  it("does not label a global bucket with whichever user spent from it", () => {
    const req = reqWith({});
    setVerifiedIdentity(req, { userId: "u-123", organizationId: null });
    expect(quotaSubjectFor(req, "global")).toEqual({ key: "global" });
  });
});

describe("refusal reporting", () => {
  const refuse = async (over: Partial<QuotaConfig>): Promise<QuotaRefusal> => (
    (await serviceFor(over).check(KEY, 0)) as QuotaRefusal
  );

  it("uses a distinct error code per dimension", async () => {
    expect(quotaErrorCode(await refuse({ requests: 0 }))).toBe("quota_requests_exceeded");
    expect(quotaErrorCode(await refuse({ tokens: 0 }))).toBe("quota_tokens_exceeded");
  });

  it("states the dimension, both numbers, the window and the reset instant", async () => {
    const service = serviceFor({ requests: 2, windowMs: HOUR_MS, windowLabel: "1h" });
    await spendRequests(service, 2, 0);
    const message = quotaErrorMessage((await service.check(KEY, 0)) as QuotaRefusal);

    expect(message).toContain("2 of 2 chat requests");
    expect(message).toContain("1h window");
    expect(message).toContain(new Date(HOUR_MS).toISOString());
  });
});
