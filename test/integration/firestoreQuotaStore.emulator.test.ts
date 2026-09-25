import { Firestore } from "@google-cloud/firestore";
import type { QuotaConfig } from "../../src/config";
import { FirestoreQuotaStore, usageDocId } from "../../src/quota/FirestoreQuotaStore";
import { QuotaService } from "../../src/quota/QuotaService";

/**
 * `FirestoreQuotaStore` against the Firestore emulator (release plan S3, S6).
 *
 * Runs only when `FIRESTORE_EMULATOR_HOST` is set, and always against a `demo-` project, which
 * the emulator accepts and production never does, so this suite cannot write to a live database.
 * The `gilligan_usage` collection awaits the supervisor's approval (stakeholder item 23); until
 * then this is the only place the store writes.
 *
 *   firebase emulators:start --only firestore --project demo-cer   # listens on 127.0.0.1:8080
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx jest --runInBand \
 *     test/integration/firestoreQuotaStore.emulator.test.ts
 */

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const describeEmulator = emulator ? describe : describe.skip;

const NOON_SEP_25 = Date.UTC(2026, 8, 25, 12);
const DAY_MS = 86_400_000;

const releasePolicy: QuotaConfig = {
  enabled: true,
  requests: 20,
  reports: 5,
  tokens: 1_000_000,
  windowMs: DAY_MS,
  windowLabel: "1d",
  scope: "caller",
  store: "firestore",
  warnAt: 0.2,
};

describeEmulator(`FirestoreQuotaStore on the emulator (${emulator})`, () => {
  const db = new Firestore({ projectId: "demo-cer" });
  // A fresh collection per run, so reruns never see each other's counts.
  const collection = `gilligan_usage_test_${Date.now()}`;
  const store = new FirestoreQuotaStore(db, collection);
  const service = new QuotaService(releasePolicy, store);
  const alice = { key: "user:alice", userId: "alice", organizationId: "org-a" };

  afterAll(async () => {
    await db.recursiveDelete(db.collection(collection));
    await db.terminate();
  });

  it("creates the day's document with the framework fields on first use", async () => {
    await store.record(alice, { requests: 1, tokens: 1500 }, NOON_SEP_25);

    const snapshot = await db.collection(collection).doc(usageDocId("user:alice", NOON_SEP_25)).get();
    expect(snapshot.exists).toBe(true);
    const data = snapshot.data();
    expect(data).toMatchObject({
      userId: "alice", organizationId: "org-a", day: "2026-09-25", questions: 1, reports: 0, tokens: 1500,
    });
    expect(data?.updatedAt.toDate()).toEqual(new Date(NOON_SEP_25));
  });

  it("counts every one of many simultaneous records (the transaction)", async () => {
    const bob = { key: "user:bob", userId: "bob", organizationId: "org-b" };
    await Promise.all(Array.from({ length: 25 }, () => store.record(bob, { tokens: 100 }, NOON_SEP_25)));

    expect((await store.read("user:bob", NOON_SEP_25)).tokens).toBe(2500);
  });

  it("admits 20 questions a day, refuses the 21st, and resets at midnight UTC", async () => {
    const carol = { key: "user:carol", userId: "carol", organizationId: "org-a" };
    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await service.check(carol.key, NOON_SEP_25)).allowed).toBe(true);
      // eslint-disable-next-line no-await-in-loop
      await service.recordRequest(carol, NOON_SEP_25);
    }

    expect(await service.check(carol.key, NOON_SEP_25)).toMatchObject({
      allowed: false, dimension: "requests", limit: 20, used: 20,
    });
    expect((await service.check(carol.key, NOON_SEP_25 + DAY_MS)).allowed).toBe(true);
  });

  it("admits 5 reports a day and warns at the last one", async () => {
    const dave = { key: "user:dave", userId: "dave", organizationId: null };
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await service.recordReport(dave, NOON_SEP_25);
    }
    expect((await service.status(dave.key, NOON_SEP_25)).reports)
      .toMatchObject({ remaining: 1, nearLimit: true });

    await service.recordReport(dave, NOON_SEP_25);
    expect(await service.checkReport(dave.key, NOON_SEP_25))
      .toMatchObject({ allowed: false, dimension: "reports" });
  });

  it("refuses questions once 1,000,000 tokens are spent", async () => {
    const erin = { key: "user:erin", userId: "erin", organizationId: "org-a" };
    await service.recordTokens(erin, 1_000_000, NOON_SEP_25);

    expect(await service.check(erin.key, NOON_SEP_25))
      .toMatchObject({ allowed: false, dimension: "tokens" });
  });
});
