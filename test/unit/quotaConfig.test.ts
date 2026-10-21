import type { Config } from "../../src/config";

const QUOTA_VARS = [
  "QUERY_QUOTA",
  "QUERY_QUOTA_REQUESTS",
  "QUERY_QUOTA_TOKENS",
  "QUERY_QUOTA_REPORTS",
  "QUERY_QUOTA_WINDOW",
  "QUERY_QUOTA_SCOPE",
  "QUERY_QUOTA_STORE",
  "QUERY_QUOTA_WARN_AT",
  "CER_RAG_SERVICE_KEY",
  "LLM_MAX_CONCURRENT",
  "NODE_ENV",
];

/**
 * `config` is frozen at import, so a different environment means a fresh module graph. The
 * quota variables are cleared first: `setupEnv.ts` blocks the developer's `.env` file but not
 * variables they exported into the shell, and a stray `QUERY_QUOTA=true` would otherwise decide
 * these assertions.
 */
const loadConfigWith = (env: Record<string, string>): Config => {
  jest.resetModules();
  QUOTA_VARS.forEach((name) => { delete process.env[name]; });
  Object.entries(env).forEach(([key, value]) => { process.env[key] = value; });
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  return (require("../../src/config") as { config: Config }).config;
};

const expectLoadFailure = (env: Record<string, string>, pattern: RegExp): void => {
  expect(() => loadConfigWith(env)).toThrow(pattern);
};

// Restored rather than deleted: `NODE_ENV` is Jest's own `test`, and other suites read it.
const ORIGINAL_ENV = Object.fromEntries(QUOTA_VARS.map((name) => [name, process.env[name]]));

afterAll(() => {
  QUOTA_VARS.forEach((name) => {
    const original = ORIGINAL_ENV[name];
    if (original === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = original;
    }
  });
  jest.resetModules();
});

describe("quota configuration defaults", () => {
  it("is off and unlimited on a fresh checkout", () => {
    // Requirement, not an observation: a new gate that starts refusing requests without anyone
    // opting in would invalidate a bake-off capture and read as a product bug.
    const { quota } = loadConfigWith({});

    expect(quota.enabled).toBe(false);
    expect(quota.requests).toBe("unlimited");
    expect(quota.tokens).toBe("unlimited");
    expect(quota.reports).toBe("unlimited");
    expect(quota.scope).toBe("caller");
    expect(quota.windowMs).toBe(30 * 86_400_000);
    expect(quota.windowLabel).toBe("30d");
  });

  it("treats an empty value as unset rather than as a limit", () => {
    const { quota } = loadConfigWith({
      QUERY_QUOTA_REQUESTS: "",
      QUERY_QUOTA_TOKENS: "   ",
      QUERY_QUOTA_WINDOW: "",
    });

    expect(quota.requests).toBe("unlimited");
    expect(quota.tokens).toBe("unlimited");
    expect(quota.windowLabel).toBe("30d");
  });
});

describe("quota limit parsing", () => {
  it("accepts the literal `unlimited`, case-insensitively", () => {
    const { quota } = loadConfigWith({
      QUERY_QUOTA_REQUESTS: "UNLIMITED",
      QUERY_QUOTA_TOKENS: "Unlimited",
    });

    expect(quota.requests).toBe("unlimited");
    expect(quota.tokens).toBe("unlimited");
  });

  it("accepts non-negative integers, including 0 as a kill switch", () => {
    const { quota } = loadConfigWith({
      QUERY_QUOTA_REQUESTS: "2",
      QUERY_QUOTA_TOKENS: "0",
      QUERY_QUOTA_REPORTS: "3",
    });

    expect(quota.requests).toBe(2);
    expect(quota.tokens).toBe(0);
    expect(quota.reports).toBe(3);
  });

  it("REJECTS other spellings of `no limit` instead of guessing", () => {
    // The whole point of a literal keyword. Reading "none" or "-1" as unlimited would hand an
    // unbounded deployment to somebody who was trying to bound one.
    expectLoadFailure({ QUERY_QUOTA_REQUESTS: "none" }, /QUERY_QUOTA_REQUESTS must be "unlimited"/);
    expectLoadFailure({ QUERY_QUOTA_REQUESTS: "off" }, /QUERY_QUOTA_REQUESTS/);
    expectLoadFailure({ QUERY_QUOTA_REQUESTS: "-1" }, /QUERY_QUOTA_REQUESTS/);
    expectLoadFailure({ QUERY_QUOTA_TOKENS: "1.5" }, /QUERY_QUOTA_TOKENS/);
    expectLoadFailure({ QUERY_QUOTA_REPORTS: "none" }, /QUERY_QUOTA_REPORTS/);
  });
});

describe("quota window parsing", () => {
  it("converts each unit suffix to milliseconds", () => {
    expect(loadConfigWith({ QUERY_QUOTA_WINDOW: "45s" }).quota.windowMs).toBe(45_000);
    expect(loadConfigWith({ QUERY_QUOTA_WINDOW: "30m" }).quota.windowMs).toBe(1_800_000);
    expect(loadConfigWith({ QUERY_QUOTA_WINDOW: "24h" }).quota.windowMs).toBe(86_400_000);
    expect(loadConfigWith({ QUERY_QUOTA_WINDOW: "7d" }).quota.windowMs).toBe(604_800_000);
    expect(loadConfigWith({ QUERY_QUOTA_WINDOW: "4w" }).quota.windowMs).toBe(4 * 604_800_000);
  });

  it("keeps the operator's spelling for logs and error prose", () => {
    expect(loadConfigWith({ QUERY_QUOTA_WINDOW: "7D" }).quota.windowLabel).toBe("7d");
  });

  it("REJECTS a bare number, so the unit can never be implied", () => {
    expectLoadFailure({ QUERY_QUOTA_WINDOW: "604800000" }, /unit suffix/);
    expectLoadFailure({ QUERY_QUOTA_WINDOW: "7" }, /unit suffix/);
  });

  it("rejects an unknown unit, a zero window, and junk", () => {
    expectLoadFailure({ QUERY_QUOTA_WINDOW: "7y" }, /QUERY_QUOTA_WINDOW/);
    expectLoadFailure({ QUERY_QUOTA_WINDOW: "0d" }, /greater than zero/);
    expectLoadFailure({ QUERY_QUOTA_WINDOW: "a week" }, /QUERY_QUOTA_WINDOW/);
  });
});

describe("quota scope parsing", () => {
  it("accepts the two supported scopes", () => {
    expect(loadConfigWith({ QUERY_QUOTA_SCOPE: "global" }).quota.scope).toBe("global");
    expect(loadConfigWith({ QUERY_QUOTA_SCOPE: "caller" }).quota.scope).toBe("caller");
  });

  it("rejects a scope this service cannot actually key on", () => {
    // `org` is the obvious thing to reach for — the upstream backend has an org counter. This
    // service cannot resolve a caller's organization without a backend round-trip it never
    // makes, so the value is refused rather than silently degraded to something else.
    expectLoadFailure({ QUERY_QUOTA_SCOPE: "org" }, /QUERY_QUOTA_SCOPE must be one of/);
    expectLoadFailure({ QUERY_QUOTA_SCOPE: "user" }, /QUERY_QUOTA_SCOPE/);
  });
});

describe("the upstream policy is expressible", () => {
  it("encodes Gilligan's free tier without a code change", () => {
    // `GilliganService.checkQuota`: fewer than 2 messages by this user in the last week.
    // Reproducing the exact numbers here is the point of the whole feature — see .env.example.
    const { quota } = loadConfigWith({
      QUERY_QUOTA: "true",
      QUERY_QUOTA_REQUESTS: "2",
      QUERY_QUOTA_WINDOW: "7d",
      QUERY_QUOTA_SCOPE: "caller",
    });

    expect(quota).toMatchObject({
      enabled: true, requests: 2, windowLabel: "7d", scope: "caller", tokens: "unlimited",
    });
  });

  it("reports every bad quota variable in one failure, not one per run", () => {
    // The repo's collect-then-throw rule (config `errors[]`): fixing a bad `.env` should take
    // one edit, not one edit per restart. Order within the message is not part of the contract.
    let message = "";
    try {
      loadConfigWith({
        QUERY_QUOTA_REQUESTS: "lots",
        QUERY_QUOTA_WINDOW: "soon",
        QUERY_QUOTA_SCOPE: "org",
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("QUERY_QUOTA_REQUESTS");
    expect(message).toContain("QUERY_QUOTA_WINDOW");
    expect(message).toContain("QUERY_QUOTA_SCOPE");
  });
});

describe("release settings (release plan S2-S4)", () => {
  const KEY = "k".repeat(32);

  it("defaults to the in-memory store, a 20% warning, 8 model calls and no service key", () => {
    const config = loadConfigWith({});
    expect(config.quota.store).toBe("memory");
    expect(config.quota.warnAt).toBe(0.2);
    expect(config.fireworks.maxConcurrent).toBe(8);
    expect(config.fireworks.queueTimeoutMs).toBe(20_000);
    expect(config.serviceAuth.key).toBeUndefined();
  });

  it("accepts the release quota: 20 questions, 5 reports, 1,000,000 tokens a UTC day in Firestore", () => {
    const config = loadConfigWith({
      QUERY_QUOTA: "true",
      QUERY_QUOTA_REQUESTS: "20",
      QUERY_QUOTA_REPORTS: "5",
      QUERY_QUOTA_TOKENS: "1000000",
      QUERY_QUOTA_WINDOW: "1d",
      QUERY_QUOTA_STORE: "firestore",
      CER_RAG_SERVICE_KEY: KEY,
    });
    expect(config.quota).toMatchObject({
      enabled: true, requests: 20, reports: 5, tokens: 1_000_000, windowMs: 86_400_000, store: "firestore",
    });
    expect(config.serviceAuth.key).toBe(KEY);
  });

  it("refuses the Firestore store with a window other than one day", () => {
    expectLoadFailure({ QUERY_QUOTA_STORE: "firestore", QUERY_QUOTA_WINDOW: "7d" }, /QUERY_QUOTA_WINDOW=1d/);
  });

  it("refuses a short service key, a warning fraction outside 0-1, and no model-call slots", () => {
    expectLoadFailure({ CER_RAG_SERVICE_KEY: "short" }, /at least 32 characters/);
    expectLoadFailure({ QUERY_QUOTA_WARN_AT: "1.5" }, /QUERY_QUOTA_WARN_AT/);
    expectLoadFailure({ LLM_MAX_CONCURRENT: "0" }, /LLM_MAX_CONCURRENT/);
  });

  it("refuses to boot in production without the service key", () => {
    expectLoadFailure({ NODE_ENV: "production" }, /CER_RAG_SERVICE_KEY must be set in production/);
    expect(loadConfigWith({ NODE_ENV: "production", CER_RAG_SERVICE_KEY: KEY }).isProduction).toBe(true);
  });
});
