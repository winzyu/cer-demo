import type { Firestore } from "@google-cloud/firestore";
import {
  QuotaDelta, QuotaStore, QuotaSubject, QuotaUsage, windowStartFor,
} from "./QuotaStore";

/** Collection approved in the Firestore framework table (stakeholder item 23). */
export const USAGE_COLLECTION = "gilligan_usage";

const DAY_MS = 86_400_000;

/**
 * The stored shape, one document per user per UTC day. Field names are the framework table's:
 * `questions` is what `QuotaUsage` calls `requests`, because it is the word the dashboard shows.
 */
export interface UsageDocument {
  userId: string;
  organizationId: string | null;
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  questions: number;
  reports: number;
  tokens: number;
  /** Also the field a Firestore TTL policy can expire on (90 days in the framework doc). */
  updatedAt: Date;
}

/** `YYYY-MM-DD` of the UTC day containing `nowMs`. */
export const utcDay = (nowMs: number): string => new Date(windowStartFor(nowMs, DAY_MS))
  .toISOString()
  .slice(0, 10);

/**
 * `user:abc` -> `abc`. Keys that are not a verified user (a token hash, an IP, `global`) keep
 * their prefix so they cannot collide with a user id.
 */
const userIdOf = ({ key, userId }: Pick<QuotaSubject, "key" | "userId">): string => (
  userId ?? (key.startsWith("user:") ? key.slice("user:".length) : key)
);

/**
 * Document ids may not contain `/`, and `.`/`..` are reserved; percent-encoding covers both and
 * leaves ordinary ids readable in the console.
 */
export const usageDocId = (key: string, nowMs: number): string => (
  `${encodeURIComponent(userIdOf({ key })).replace(/\./g, "%2E")}_${utcDay(nowMs)}`
);

const count = (value: unknown): number => (
  typeof value === "number" && Number.isFinite(value) ? value : 0
);

/**
 * Quota counters in Firestore (release plan S3).
 *
 * ## What this fixes over the in-memory store
 *
 * Counters survive a redeploy, are shared by every instance, and are keyed by the user the CER
 * server vouched for rather than a token hash, so a fresh login no longer brings a fresh
 * allowance (`quotaKey.ts`).
 *
 * ## Why a transaction
 *
 * Each record reads the day's document and writes it back inside `runTransaction`, so two answers
 * finishing at once both land and the document is created with its labels on first use. Firestore
 * retries a contended transaction itself. The check in `quotaGuard` is still a separate read, so a
 * user with several questions in flight at the moment they hit the ceiling can overshoot by those
 * few; the per-user daily limits make that bounded and small.
 *
 * ## Windows
 *
 * UTC days only: the document id carries the day, so a new day is a new document and there is no
 * rollover logic to get wrong. `config` refuses `QUERY_QUOTA_STORE=firestore` with any other
 * window.
 */
export class FirestoreQuotaStore implements QuotaStore {
  private readonly db: Firestore;

  private readonly collection: string;

  constructor(db: Firestore, collection: string = USAGE_COLLECTION) {
    this.db = db;
    this.collection = collection;
  }

  async read(key: string, nowMs: number): Promise<QuotaUsage> {
    const snapshot = await this.db.collection(this.collection).doc(usageDocId(key, nowMs)).get();
    const data = snapshot.exists ? snapshot.data() : undefined;
    const windowStartMs = windowStartFor(nowMs, DAY_MS);
    return {
      requests: count(data?.questions),
      tokens: count(data?.tokens),
      reports: count(data?.reports),
      windowStartMs,
      windowEndMs: windowStartMs + DAY_MS,
    };
  }

  async record(subject: QuotaSubject, delta: QuotaDelta, nowMs: number): Promise<void> {
    const ref = this.db.collection(this.collection).doc(usageDocId(subject.key, nowMs));
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists ? snapshot.data() : undefined;
      const next: UsageDocument = {
        userId: userIdOf(subject),
        // A user moved between organizations keeps the day's count; the latest organization wins.
        organizationId: subject.organizationId
          ?? (current?.organizationId as string | null | undefined) ?? null,
        day: utcDay(nowMs),
        questions: count(current?.questions) + (delta.requests ?? 0),
        reports: count(current?.reports) + (delta.reports ?? 0),
        tokens: count(current?.tokens) + (delta.tokens ?? 0),
        updatedAt: new Date(nowMs),
      };
      transaction.set(ref, next);
    });
  }
}
