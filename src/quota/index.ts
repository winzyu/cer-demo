import { config } from "../config";
import { getFirestore } from "../config/database";
import { FirestoreQuotaStore } from "./FirestoreQuotaStore";
import { InMemoryQuotaStore } from "./InMemoryQuotaStore";
import { QuotaService } from "./QuotaService";
import type { QuotaStore } from "./QuotaStore";

export { QuotaService } from "./QuotaService";
export { quotaErrorCode, quotaErrorMessage } from "./QuotaService";
export type {
  QuotaAllowed, QuotaDecision, QuotaDimensionStatus, QuotaRefusal, QuotaStatus,
} from "./QuotaService";
export { InMemoryQuotaStore } from "./InMemoryQuotaStore";
export { FirestoreQuotaStore, USAGE_COLLECTION } from "./FirestoreQuotaStore";
export { windowStartFor } from "./QuotaStore";
export type {
  QuotaDelta, QuotaStore, QuotaSubject, QuotaUsage,
} from "./QuotaStore";
export { quotaKeyFor, quotaSubjectFor } from "./quotaKey";

/**
 * `QUERY_QUOTA_STORE` picks where counters live. The Firestore client is lazy and opens no
 * connection until the first read, so choosing it here never needs credentials at boot.
 */
const storeFor = (): QuotaStore => (
  config.quota.store === "firestore"
    ? new FirestoreQuotaStore(getFirestore())
    : new InMemoryQuotaStore(config.quota.windowMs)
);

/**
 * The composition root: one service, one store, for the process.
 *
 * A singleton because the counters *are* the shared state — a per-request instance would count
 * each request against an empty map and never refuse anything.
 */
export const quotaService = new QuotaService(config.quota, storeFor());
