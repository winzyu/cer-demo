/**
 * The price sheet the bake-off's cost comparison runs on (`RETRIEVAL_BAKEOFF.md` §1b).
 *
 * **Prices are data with a date on them, not constants.** The Fireworks serverless catalogue and
 * its rates rotate, so every figure here carries the date it was read and the page it came from.
 * A cost conclusion computed from an undated price sheet cannot be audited later, and ◆G7 is
 * supposed to be decided by numbers someone can check.
 *
 * Re-read the sources and bump `PRICES_READ_ON` before publishing `RETRIEVAL_COMPARISON.md`.
 */

/** The date every figure in this file was read from its source page. */
export const PRICES_READ_ON = "2026-08-03";

export const PRICE_SOURCES = {
  fireworksServerless: "https://docs.fireworks.ai/serverless/pricing",
  fireworksCaching: "https://docs.fireworks.ai/guides/prompt-caching",
  firestore: "https://cloud.google.com/firestore/pricing",
} as const;

/** USD per 1M tokens. */
export interface TokenPrices {
  input: number;
  /** Input served from the prompt cache. */
  cachedInput: number;
  output: number;
}

/**
 * Chat models, USD per 1M tokens.
 *
 * **The cached-input column is the whole ballgame** and it is *not* a uniform discount:
 * `gpt-oss-20b` caches at 50% off, `gpt-oss-120b` at ~90.7% off. Direct-feed's entire cost case
 * rests on that discount, so the two models rank the arms differently — see
 * `RETRIEVAL_BAKEOFF.md` §1b. Fireworks documents 50% only as a *default*; per-model rates are
 * authoritative, which is why they are recorded individually here rather than derived.
 */
export const CHAT_PRICES: Record<string, TokenPrices> = {
  "accounts/fireworks/models/gpt-oss-20b": { input: 0.07, cachedInput: 0.035, output: 0.30 },
  "accounts/fireworks/models/gpt-oss-120b": { input: 0.15, cachedInput: 0.014, output: 0.60 },
};

/**
 * Embedding models, USD per 1M input tokens.
 *
 * Fireworks prices embeddings by parameter count, not by name: ≤150M is $0.008/1M and 150-350M is
 * $0.016/1M. `nomic-embed-text-v1.5` is 137M, so it falls in the cheaper tier.
 */
export const EMBEDDING_PRICES: Record<string, number> = {
  "nomic-ai/nomic-embed-text-v1.5": 0.008,
};

/**
 * Firestore Standard edition, us-central1. USD per 100,000 operations.
 *
 * Only reads matter for the bake-off — every arm's write volume is one seeding run. The
 * **"Always Free" quota is 50,000 reads/day** and applies to exactly **one database per project**
 * (the `(default)` one, which is what `FIRESTORE_DATABASE_ID` defaults to). A named database
 * would forfeit it — the caveat `RETRIEVAL_BAKEOFF.md` flagged, now confirmed.
 */
export const FIRESTORE_PRICES = {
  readsPer100k: 0.03,
  writesPer100k: 0.09,
  deletesPer100k: 0.01,
  freeReadsPerDay: 50_000,
} as const;

/**
 * A kNN query bills **one read per batch of up to 100 vector index entries scanned**, plus one
 * read per document returned. With ~305 chunks indexed that is `ceil(305/100) = 4` index reads
 * plus `topK` document reads — the figure the `firestore-vector` arm's cost depends on, and the
 * reason its read volume is a small multiple of its query volume rather than equal to it.
 */
export const FIRESTORE_VECTOR_INDEX_ENTRIES_PER_READ = 100;
