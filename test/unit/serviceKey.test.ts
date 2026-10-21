import express from "express";
import request from "supertest";
import { errorHandler } from "../../src/middleware/errorHandler";
import { requireServiceKey } from "../../src/middleware/requireServiceKey";
import { quotaKeyFor, quotaSubjectFor } from "../../src/quota/quotaKey";
import app from "../../src/app";

/**
 * The check between the CER server and this service (release plan S2).
 *
 * Runbook §5's required evidence, at the application level: an authorized call, rejection without
 * the service credential, rejection of a wrong one, rejection of forged identity, and the caller's
 * own token still reaching the data path untouched.
 */

const KEY = "k".repeat(40);

/** A stand-in route that shows what the quota would key on and what token the tools would get. */
const appWith = (expectedKey: string | undefined) => {
  const probe = express();
  probe.use("/api/v1", requireServiceKey(expectedKey), (req, res) => {
    res.json({
      key: quotaKeyFor(req, "caller"),
      subject: quotaSubjectFor(req, "caller"),
      authorization: req.headers.authorization ?? null,
    });
  });
  probe.use(errorHandler);
  return probe;
};

describe("requireServiceKey with CER_RAG_SERVICE_KEY set", () => {
  const probe = appWith(KEY);

  it("admits the CER server and keys the quota on the user it names", async () => {
    const res = await request(probe)
      .get("/api/v1/usage")
      .set("x-cer-rag-service-key", KEY)
      .set("x-cer-rag-user-id", "user-1")
      .set("x-cer-rag-organization-id", "org-1")
      .set("authorization", "Bearer user-jwt");

    expect(res.status).toBe(200);
    expect(res.body.key).toBe("user:user-1");
    expect(res.body.subject).toEqual({ key: "user:user-1", userId: "user-1", organizationId: "org-1" });
    // The user's own token still reaches the device calls, so data scope is the caller's.
    expect(res.body.authorization).toBe("Bearer user-jwt");
  });

  it("accepts a user with no organization", async () => {
    const res = await request(probe)
      .get("/api/v1/usage")
      .set("x-cer-rag-service-key", KEY)
      .set("x-cer-rag-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(res.body.subject.organizationId).toBeNull();
  });

  it("refuses a call with no service key, even one naming a user", async () => {
    const res = await request(probe)
      .get("/api/v1/usage")
      .set("x-cer-rag-user-id", "user-1")
      .set("authorization", "Bearer user-jwt");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("service_key_invalid");
  });

  it.each([
    ["a wrong key of the same length", "x".repeat(40)],
    ["a prefix of the key", KEY.slice(0, 20)],
    ["the key with a character appended", `${KEY}k`],
  ])("refuses %s", async (_label, presented) => {
    const res = await request(probe)
      .get("/api/v1/usage")
      .set("x-cer-rag-service-key", presented)
      .set("x-cer-rag-user-id", "user-1");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("service_key_invalid");
  });

  it("does not echo the key in the refusal", async () => {
    const res = await request(probe).get("/api/v1/usage").set("x-cer-rag-service-key", "guess");
    expect(JSON.stringify(res.body)).not.toContain(KEY);
    expect(JSON.stringify(res.body)).not.toContain("guess");
  });

  it.each([
    ["no user id", {}],
    ["an empty user id", { "x-cer-rag-user-id": "" }],
    ["a user id with a slash and spaces", { "x-cer-rag-user-id": "a b/c" }],
    ["an over-long user id", { "x-cer-rag-user-id": "u".repeat(129) }],
    ["a malformed organization id", { "x-cer-rag-user-id": "user-1", "x-cer-rag-organization-id": "o g" }],
  ])("refuses the right key with %s", async (_label, headers) => {
    const res = await request(probe)
      .get("/api/v1/usage")
      .set("x-cer-rag-service-key", KEY)
      .set(headers as Record<string, string>);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("service_identity_required");
  });
});

describe("requireServiceKey with CER_RAG_SERVICE_KEY unset (local runs)", () => {
  const probe = appWith(undefined);

  it("admits any caller and ignores identity headers nobody verified", async () => {
    const res = await request(probe)
      .get("/api/v1/usage")
      .set("x-cer-rag-user-id", "forged")
      .set("authorization", "Bearer user-jwt");

    expect(res.status).toBe(200);
    expect(res.body.key).toMatch(/^token:/);
  });
});

describe("the real app with CER_RAG_SERVICE_KEY set", () => {
  // Config is read once at import, so the app is loaded fresh with the key in the environment.
  let keyed: typeof app;
  beforeAll(() => {
    process.env.CER_RAG_SERVICE_KEY = KEY;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      keyed = require("../../src/app").default;
    });
  });
  afterAll(() => {
    delete process.env.CER_RAG_SERVICE_KEY;
  });

  it("guards every API route", async () => {
    const usage = await request(keyed).get("/api/v1/usage");
    const chat = await request(keyed).post("/api/v1/chat").send({ query: "hi" });
    const reports = await request(keyed).post("/api/v1/reports").send({});

    [usage, chat, reports].forEach((res) => {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("service_key_invalid");
    });
  });

  it("answers the CER server's usage call", async () => {
    const res = await request(keyed)
      .get("/api/v1/usage")
      .set("x-cer-rag-service-key", KEY)
      .set("x-cer-rag-user-id", "user-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("nearLimit");
  });

  it("keeps /health open so probes still work", async () => {
    const res = await request(keyed).get("/health");
    expect(res.status).not.toBe(401);
  });

  it("leaves the default app, with no key, open as before", async () => {
    const res = await request(app).get("/api/v1/usage");
    expect(res.status).toBe(200);
  });
});
