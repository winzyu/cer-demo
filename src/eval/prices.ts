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

/**
 * The date each figure below was read from its source page.
 *
 * **One date per source, not one date for the file**, because the three sources are not checked
 * the same way: the Fireworks pages are machine-readable and were re-read on 2026-08-26, while
 * the Firestore page is too long to retrieve in full and has to be confirmed by a human. A single
 * file-wide date would flatten that difference and let one unchecked source hide behind two
 * checked ones — the precise failure this constant exists to prevent.
 */
export const PRICES_READ_ON = {
  fireworksServerless: "2026-08-28",
  fireworksCaching: "2026-08-26",
  /**
   * Confirmed 2026-08-26 **by the user reading the page**, not by this tooling — the page is too
   * long to retrieve in full, so it cannot be re-checked the way the Fireworks pages can. All
   * three operation rates came back unchanged from the 2026-08-03 read. Recorded this way on
   * purpose: the provenance of a price is part of the price.
   */
  firestore: "2026-08-26",
} as const;

/** The oldest read date in the sheet — what a report must quote, since it bounds the whole. */
export const PRICES_OLDEST_READ_ON: string = Object.values(PRICES_READ_ON).sort()[0];

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
 * `gpt-oss-20b` caches at 50% off, `gpt-oss-120b` at 90% off. Direct-feed's entire cost case
 * rests on that discount, so the two models rank the arms differently — see
 * `RETRIEVAL_BAKEOFF.md` §1b. Fireworks documents 50% only as a *default*; per-model rates are
 * authoritative, which is why they are recorded individually here rather than derived.
 */
export const CHAT_PRICES: Record<string, TokenPrices> = {
  "accounts/fireworks/models/gpt-oss-20b": { input: 0.07, cachedInput: 0.035, output: 0.30 },
  // Cached input moved 0.014 -> 0.015 between the 2026-08-03 and 2026-08-26 reads: the page now
  // prints a flat 90% off rather than the 90.7% the older figure implied. This model is the
  // Tier-2 judge as well as a costed candidate, so the rate bills real spend either way.
  "accounts/fireworks/models/gpt-oss-120b": { input: 0.15, cachedInput: 0.015, output: 0.60 },
  // Judge candidate, evaluated and REJECTED 2026-08-28. Listed on rate alone it looks 3x cheaper
  // than `gpt-oss-120b` and, unlike either gpt-oss model, satisfies §7b's *intent* rather than only
  // its letter. Calibrated against the human sample it failed on all three counts, and the ledger
  // is kept at `data/results/judge/warm.nemotron-2026-08-28.jsonl` so this is checkable:
  //
  //   - **No cost saving.** 3,350 output tokens/call against `gpt-oss-120b`'s 542 — 6.2x the
  //     verbosity, because it emits reasoning prose around the JSON. That cancels the cheaper rate
  //     exactly: $0.00093/usable call vs $0.00092. The rate card is not the price.
  //   - **22.9% of calls unusable** (19 of 83) — unparseable replies, against 0 of 429 for
  //     `gpt-oss-120b`. It does not reliably hold a JSON output contract.
  //   - **`ungrounded` kappa -0.04**, worse than chance, against 0.57 on the comparable rows.
  //     One recorded verdict echoed the prompt's own template placeholders back as its finding,
  //     so the damage is not confined to the calls that failed outright.
  //
  // Correctness came back at kappa 0.87, matching `gpt-oss-120b` — but on n=23 survivors of a run
  // that dropped 19 calls, which is a biased sample, not a tie. Kept in the sheet so the rejection
  // is priced and dated rather than re-litigated.
  "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b": {
    input: 0.05, cachedInput: 0.01, output: 0.20,
  },
  // Judge candidates priced 2026-08-28 so a calibration run reports a budget instead of a blank.
  // Both are cross-family and both cost MORE than `gpt-oss-120b` in this workload despite lower
  // headline output rates, because a judge call is input-dominated — ~420K prompt tokens against
  // ~42K completion across the 83-call calibration set. Input rate is what decides a judge's bill.
  "accounts/fireworks/models/minimax-m3": { input: 0.30, cachedInput: 0.06, output: 1.20 },
  "accounts/fireworks/models/deepseek-v4-flash-0731": {
    input: 0.22, cachedInput: 0.007, output: 0.66,
  },
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
 * read per document returned. With 393 chunks indexed that is `ceil(393/100) = 4` index reads
 * plus `topK` document reads — the figure the `firestore-vector` arm's cost depends on, and the
 * reason its read volume is a small multiple of its query volume rather than equal to it.
 */
export const FIRESTORE_VECTOR_INDEX_ENTRIES_PER_READ = 100;
