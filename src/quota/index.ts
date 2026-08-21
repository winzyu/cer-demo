import { QuotaService } from "./QuotaService";

export { QuotaService } from "./QuotaService";
export { quotaErrorCode, quotaErrorMessage } from "./QuotaService";
export type { QuotaAllowed, QuotaDecision, QuotaRefusal } from "./QuotaService";
export { InMemoryQuotaStore } from "./InMemoryQuotaStore";
export { windowStartFor } from "./QuotaStore";
export type { QuotaDelta, QuotaStore, QuotaUsage } from "./QuotaStore";
export { quotaKeyFor } from "./quotaKey";

/**
 * The composition root: one service, one store, for the process.
 *
 * A singleton because the counters *are* the shared state — a per-request instance would count
 * each request against an empty map and never refuse anything. Swapping the in-process store for
 * a durable one is a second constructor argument here and nothing else.
 */
export const quotaService = new QuotaService();
