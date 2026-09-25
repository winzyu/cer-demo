import type { Firestore } from "@google-cloud/firestore";
import {
  FirestoreQuotaStore, USAGE_COLLECTION, usageDocId, utcDay,
} from "../../src/quota/FirestoreQuotaStore";

/**
 * The store's own logic against a minimal in-memory stand-in for the Firestore client.
 * This is not the proof that it works against Firestore; that is
 * `test/integration/firestoreQuotaStore.emulator.test.ts`, which runs against the emulator.
 */

const DAY_MS = 86_400_000;
const NOON_SEP_25 = Date.UTC(2026, 8, 25, 12);

/** Just the calls the store makes: collection().doc().get() and runTransaction(get, set). */
const fakeDb = () => {
  const docs = new Map<string, Record<string, unknown>>();
  const snapshot = (id: string) => ({
    exists: docs.has(id),
    data: () => (docs.has(id) ? { ...docs.get(id) } : undefined),
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }),
    }),
    runTransaction: async (fn: (t: unknown) => Promise<void>) => fn({
      get: async (ref: { path: string }) => snapshot(ref.path),
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        docs.set(ref.path, data);
      },
    }),
  };
  return { db: db as unknown as Firestore, docs };
};

describe("usage document naming", () => {
  it("uses the UTC day, so a user's day turns over at midnight UTC", () => {
    expect(utcDay(NOON_SEP_25)).toBe("2026-09-25");
    expect(utcDay(Date.UTC(2026, 8, 25, 23, 59, 59, 999))).toBe("2026-09-25");
    expect(utcDay(Date.UTC(2026, 8, 26))).toBe("2026-09-26");
  });

  it("is one document per user per day", () => {
    expect(usageDocId("user:u-1", NOON_SEP_25)).toBe("u-1_2026-09-25");
    expect(usageDocId("user:u-1", NOON_SEP_25 + DAY_MS)).toBe("u-1_2026-09-26");
  });

  it("encodes characters Firestore does not allow in an id, and keeps other keys distinct", () => {
    expect(usageDocId("user:a/b", NOON_SEP_25)).toBe("a%2Fb_2026-09-25");
    expect(usageDocId("user:..", NOON_SEP_25)).toBe("%2E%2E_2026-09-25");
    expect(usageDocId("token:abc", NOON_SEP_25)).toBe("token%3Aabc_2026-09-25");
  });
});

describe("FirestoreQuotaStore logic", () => {
  it("reads an unknown user as zero, bounded by the UTC day", async () => {
    const { db } = fakeDb();
    const usage = await new FirestoreQuotaStore(db).read("user:u-1", NOON_SEP_25);

    expect(usage).toEqual({
      requests: 0,
      tokens: 0,
      reports: 0,
      windowStartMs: Date.UTC(2026, 8, 25),
      windowEndMs: Date.UTC(2026, 8, 26),
    });
  });

  it("writes the framework table's fields and accumulates each dimension", async () => {
    const { db, docs } = fakeDb();
    const store = new FirestoreQuotaStore(db);
    const subject = { key: "user:u-1", userId: "u-1", organizationId: "org-1" };

    await store.record(subject, { requests: 1 }, NOON_SEP_25);
    await store.record(subject, { tokens: 1234 }, NOON_SEP_25);
    await store.record(subject, { reports: 1 }, NOON_SEP_25 + 1000);

    expect(docs.get(`${USAGE_COLLECTION}/u-1_2026-09-25`)).toEqual({
      userId: "u-1",
      organizationId: "org-1",
      day: "2026-09-25",
      questions: 1,
      reports: 1,
      tokens: 1234,
      updatedAt: new Date(NOON_SEP_25 + 1000),
    });
    expect(await store.read("user:u-1", NOON_SEP_25)).toMatchObject({
      requests: 1, tokens: 1234, reports: 1,
    });
  });

  it("starts the next UTC day from zero in a new document", async () => {
    const { db, docs } = fakeDb();
    const store = new FirestoreQuotaStore(db);
    await store.record({ key: "user:u-1" }, { requests: 20 }, NOON_SEP_25);

    expect((await store.read("user:u-1", NOON_SEP_25 + DAY_MS)).requests).toBe(0);
    expect(docs.size).toBe(1);
  });

  it("keeps the recorded organization when a later record has none", async () => {
    const { db, docs } = fakeDb();
    const store = new FirestoreQuotaStore(db);
    await store.record({ key: "user:u-1", organizationId: "org-1" }, { requests: 1 }, NOON_SEP_25);
    await store.record({ key: "user:u-1" }, { tokens: 5 }, NOON_SEP_25);

    expect(docs.get(`${USAGE_COLLECTION}/u-1_2026-09-25`)?.organizationId).toBe("org-1");
  });
});
