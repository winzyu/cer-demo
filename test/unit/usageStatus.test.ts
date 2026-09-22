import type { Request, Response } from "express";
import type { QuotaConfig } from "../../src/config";
import { InMemoryQuotaStore } from "../../src/quota/InMemoryQuotaStore";
import { QuotaService } from "../../src/quota/QuotaService";
import { quotaKeyFor } from "../../src/quota/quotaKey";
import { UsageController } from "../../src/controllers/UsageController";

const HOUR_MS = 3_600_000;

/** Stated per test rather than read from `config`, same reasoning as `quota.test.ts`. */
const policy = (over: Partial<QuotaConfig> = {}): QuotaConfig => ({
  enabled: true,
  requests: "unlimited",
  tokens: "unlimited",
  windowMs: HOUR_MS,
  windowLabel: "1h",
  scope: "caller",
  ...over,
});

const serviceFor = (over: Partial<QuotaConfig> = {}): QuotaService => {
  const resolved = policy(over);
  return new QuotaService(resolved, new InMemoryQuotaStore(resolved.windowMs));
};

const KEY = "token:abc";

/** Captures what the controller wrote, without an HTTP server. */
const responseSpy = () => {
  const body: { value?: unknown } = {};
  const json = jest.fn((payload: unknown): void => {
    body.value = payload;
  });
  // Typed up front rather than inferred: `status` returns the object it is a member of, so the
  // controller's `res.status(200).json(...)` chain works, and inference would be cyclic.
  const res: { status: jest.Mock; json: jest.Mock } = {
    status: jest.fn((): unknown => res),
    json,
  };
  return {
    res: res as unknown as Response, body, status: res.status, json,
  };
};

/** A request carrying a bearer token, which is what `quotaKeyFor` buckets on. */
const requestWithToken = (token: string): Request => (
  { headers: { authorization: `Bearer ${token}` } } as unknown as Request
);

/** The same derivation the controller and the gate use, so the test cannot drift from them. */
const quotaKeyOf = (token: string): string => quotaKeyFor(requestWithToken(token));

describe("QuotaService.status", () => {
  it("reports remaining against a finite request ceiling", () => {
    const service = serviceFor({ requests: 20 });
    service.recordRequest(KEY, 0);
    service.recordRequest(KEY, 0);

    const status = service.status(KEY, 0);

    expect(status.enabled).toBe(true);
    expect(status.requests).toEqual({ used: 2, limit: 20, remaining: 18 });
    expect(status.windowLabel).toBe("1h");
    expect(status.resetAtMs).toBe(HOUR_MS);
  });

  it("reports null limit and null remaining for an unlimited dimension", () => {
    const service = serviceFor({ requests: 20 });

    expect(service.status(KEY, 0).tokens).toEqual({ used: 0, limit: null, remaining: null });
  });

  it("reports null limits while the quota is off, so 'no ceiling' is not shown as 'none left'", () => {
    const service = serviceFor({ enabled: false, requests: 20 });

    const status = service.status(KEY, 0);

    expect(status.enabled).toBe(false);
    expect(status.requests).toEqual({ used: 0, limit: null, remaining: null });
  });

  it("floors remaining at zero when retrospective token accounting overshoots the ceiling", () => {
    // The answer that crosses the ceiling is allowed to finish, so `used` legitimately exceeds
    // `limit`. A negative remaining is not renderable, and this is the only path that produces one.
    const service = serviceFor({ tokens: 1_000 });
    service.recordTokens(KEY, 1_500, 0);

    expect(service.status(KEY, 0).tokens).toEqual({ used: 1_500, limit: 1_000, remaining: 0 });
  });

  it("rolls over with the window", () => {
    const service = serviceFor({ requests: 20 });
    service.recordRequest(KEY, 0);

    expect(service.status(KEY, HOUR_MS).requests).toEqual({ used: 0, limit: 20, remaining: 20 });
  });
});

describe("UsageController", () => {
  it("does not spend the allowance it reports", () => {
    // The defect this endpoint could easily have: a status call that counts itself, so a page
    // polling the remaining count burns the very allowance it is displaying.
    const service = serviceFor({ requests: 20 });
    const controller = new UsageController(service);
    const req = requestWithToken("abc");

    controller.getUsage(req, responseSpy().res);
    controller.getUsage(req, responseSpy().res);
    const { res, body } = responseSpy();
    controller.getUsage(req, res);

    expect((body.value as { questions: { used: number } }).questions.used).toBe(0);
  });

  it("serves the caller's own bucket, with the display names the dashboard reads", () => {
    const service = serviceFor({ requests: 20 });
    const controller = new UsageController(service);
    service.recordRequest(quotaKeyOf("abc"));

    const { res, body, status } = responseSpy();
    controller.getUsage(requestWithToken("abc"), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(body.value).toMatchObject({
      enabled: true,
      questions: { used: 1, limit: 20, remaining: 19 },
      window: "1h",
    });
    expect(Number.isNaN(Date.parse((body.value as { resetsAt: string }).resetsAt))).toBe(false);
  });

  it("buckets two different tokens separately", () => {
    const service = serviceFor({ requests: 20 });
    const controller = new UsageController(service);
    service.recordRequest(quotaKeyOf("abc"), Date.now());

    const { res, body } = responseSpy();
    controller.getUsage(requestWithToken("zzz"), res);

    expect((body.value as { questions: { used: number } }).questions.used).toBe(0);
  });
});
