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
  reports: "unlimited",
  windowMs: HOUR_MS,
  windowLabel: "1h",
  scope: "caller",
  store: "memory",
  warnAt: 0.2,
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

const spend = async (service: QuotaService, n: number, nowMs = 0): Promise<void> => {
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await service.recordRequest(KEY, nowMs);
  }
};

describe("QuotaService.status", () => {
  it("reports remaining against a finite request ceiling", async () => {
    const service = serviceFor({ requests: 20 });
    await spend(service, 2);

    const status = await service.status(KEY, 0);

    expect(status.enabled).toBe(true);
    expect(status.requests).toEqual({
      used: 2, limit: 20, remaining: 18, nearLimit: false,
    });
    expect(status.windowLabel).toBe("1h");
    expect(status.resetAtMs).toBe(HOUR_MS);
  });

  it("reports null limit and null remaining for an unlimited dimension", async () => {
    const service = serviceFor({ requests: 20 });

    expect((await service.status(KEY, 0)).tokens).toEqual({
      used: 0, limit: null, remaining: null, nearLimit: false,
    });
  });

  it("reports null limits while the quota is off, so 'no ceiling' is not shown as 'none left'", async () => {
    const service = serviceFor({ enabled: false, requests: 20 });

    const status = await service.status(KEY, 0);

    expect(status.enabled).toBe(false);
    expect(status.nearLimit).toBe(false);
    expect(status.requests).toEqual({
      used: 0, limit: null, remaining: null, nearLimit: false,
    });
  });

  it("floors remaining at zero when retrospective token accounting overshoots the ceiling", async () => {
    // The answer that crosses the ceiling is allowed to finish, so `used` legitimately exceeds
    // `limit`. A negative remaining is not renderable, and this is the only path that produces one.
    const service = serviceFor({ tokens: 1_000 });
    await service.recordTokens(KEY, 1_500, 0);

    expect((await service.status(KEY, 0)).tokens).toEqual({
      used: 1_500, limit: 1_000, remaining: 0, nearLimit: false,
    });
  });

  it("rolls over with the window", async () => {
    const service = serviceFor({ requests: 20 });
    await spend(service, 1);

    expect((await service.status(KEY, HOUR_MS)).requests).toEqual({
      used: 0, limit: 20, remaining: 20, nearLimit: false,
    });
  });
});

describe("QuotaService.status - nearLimit (release plan Q7)", () => {
  it("turns on when 20% of the questions remain, and not one question earlier", async () => {
    const service = serviceFor({ requests: 20 });

    await spend(service, 15);
    expect((await service.status(KEY, 0)).nearLimit).toBe(false);

    await spend(service, 1); // 4 of 20 left
    const status = await service.status(KEY, 0);
    expect(status.requests).toMatchObject({ remaining: 4, nearLimit: true });
    expect(status.nearLimit).toBe(true);
  });

  it("turns off again at zero, where the page shows 'limit reached' instead", async () => {
    const service = serviceFor({ requests: 20 });
    await spend(service, 20);

    const status = await service.status(KEY, 0);
    expect(status.requests).toMatchObject({ remaining: 0, nearLimit: false });
    expect(status.nearLimit).toBe(false);
  });

  it("rounds up so a small allowance still warns: 1 of 5 reports left", async () => {
    const service = serviceFor({ reports: 5 });
    await service.recordReport(KEY, 0);
    await service.recordReport(KEY, 0);
    await service.recordReport(KEY, 0);
    expect((await service.status(KEY, 0)).reports.nearLimit).toBe(false);

    await service.recordReport(KEY, 0);
    const status = await service.status(KEY, 0);
    expect(status.reports).toMatchObject({ remaining: 1, nearLimit: true });
    expect(status.nearLimit).toBe(true);
  });

  it("warns on tokens too, and follows QUERY_QUOTA_WARN_AT", async () => {
    const service = serviceFor({ tokens: 1_000_000, warnAt: 0.1 });
    await service.recordTokens(KEY, 890_000, 0);
    expect((await service.status(KEY, 0)).nearLimit).toBe(false);

    await service.recordTokens(KEY, 10_000, 0); // 100,000 left = 10%
    expect((await service.status(KEY, 0)).tokens.nearLimit).toBe(true);
  });

  it("never warns with QUERY_QUOTA_WARN_AT=0", async () => {
    const service = serviceFor({ requests: 2, warnAt: 0 });
    await spend(service, 1);
    expect((await service.status(KEY, 0)).nearLimit).toBe(false);
  });
});

describe("UsageController", () => {
  const next = jest.fn();

  it("does not spend the allowance it reports", async () => {
    // The defect this endpoint could easily have: a status call that counts itself, so a page
    // polling the remaining count burns the very allowance it is displaying.
    const service = serviceFor({ requests: 20 });
    const controller = new UsageController(service);
    const req = requestWithToken("abc");

    await controller.getUsage(req, responseSpy().res, next);
    await controller.getUsage(req, responseSpy().res, next);
    const { res, body } = responseSpy();
    await controller.getUsage(req, res, next);

    expect((body.value as { questions: { used: number } }).questions.used).toBe(0);
  });

  it("serves the caller's own bucket, with the display names the dashboard reads", async () => {
    const service = serviceFor({ requests: 20 });
    const controller = new UsageController(service);
    await service.recordRequest(quotaKeyOf("abc"));

    const { res, body, status } = responseSpy();
    await controller.getUsage(requestWithToken("abc"), res, next);

    expect(status).toHaveBeenCalledWith(200);
    expect(body.value).toMatchObject({
      enabled: true,
      nearLimit: false,
      questions: {
        used: 1, limit: 20, remaining: 19, nearLimit: false,
      },
      window: "1h",
    });
    expect(Number.isNaN(Date.parse((body.value as { resetsAt: string }).resetsAt))).toBe(false);
  });

  it("carries nearLimit for the dashboard's warning", async () => {
    const service = serviceFor({ requests: 5 });
    const controller = new UsageController(service);
    await service.recordRequest(quotaKeyOf("abc"));
    await service.recordRequest(quotaKeyOf("abc"));
    await service.recordRequest(quotaKeyOf("abc"));
    await service.recordRequest(quotaKeyOf("abc"));

    const { res, body } = responseSpy();
    await controller.getUsage(requestWithToken("abc"), res, next);

    expect(body.value).toMatchObject({
      nearLimit: true,
      questions: { remaining: 1, nearLimit: true },
    });
  });

  it("reports the report allowance beside the question allowance", async () => {
    const service = serviceFor({ requests: 20, reports: 3 });
    const controller = new UsageController(service);
    await service.recordReport(quotaKeyOf("abc"));

    const { res, body } = responseSpy();
    await controller.getUsage(requestWithToken("abc"), res, next);

    expect(body.value).toMatchObject({
      questions: { used: 0, limit: 20, remaining: 20 },
      reports: { used: 1, limit: 3, remaining: 2 },
    });
  });

  it("buckets two different tokens separately", async () => {
    const service = serviceFor({ requests: 20 });
    const controller = new UsageController(service);
    await service.recordRequest(quotaKeyOf("abc"), Date.now());

    const { res, body } = responseSpy();
    await controller.getUsage(requestWithToken("zzz"), res, next);

    expect((body.value as { questions: { used: number } }).questions.used).toBe(0);
  });

  it("passes a store failure to the error handler instead of answering", async () => {
    const failing = new QuotaService(policy({ requests: 20 }), {
      read: () => Promise.reject(new Error("firestore down")),
      record: () => Promise.resolve(),
    });
    const onError = jest.fn();
    const { res, status } = responseSpy();

    await new UsageController(failing).getUsage(requestWithToken("abc"), res, onError);

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "firestore down" }));
    expect(status).not.toHaveBeenCalled();
  });
});
