/**
 * The measured inputs the cost model runs on, with their provenance attached.
 *
 * **Every token count here is a live measurement, not an estimate** — but they come from
 * single-run spot-checks (`timeline.md`, 2026-07-30/31), not from the graded sweep. They are
 * labelled `indicative` for exactly that reason, and `npm run cost` prints the label rather than
 * quietly presenting them as final. Once `eval/transcripts/` holds a sweep, replace these with
 * the transcript means and flip the label to `measured`.
 *
 * They live apart from `cost.ts` so the arithmetic can be tested against fixed numbers while the
 * numbers themselves change as the experiment progresses.
 */
import type { ArmCostInputs, FixedCost } from "./cost";
import { CHAT_PRICES, EMBEDDING_PRICES, FIRESTORE_PRICES } from "./prices";

export type Provenance = "indicative" | "measured";

/** Where the token counts below came from, printed alongside every result. */
export const TOKEN_PROVENANCE: Provenance = "indicative";
export const TOKEN_SOURCE = "single-run spot-checks, 2026-07-30/31 (timeline.md); not the graded sweep";

const CHAT_MODEL = "accounts/fireworks/models/gpt-oss-20b";
const EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";

/**
 * Completion tokens are held **identical across arms** and swept as a separate variable.
 *
 * gpt-oss emits 158-1,299 reasoning tokens before the first visible word, so output cost varies
 * by ~8× for answers that read the same length. Letting that variance sit inside the per-arm
 * figures would swamp the retrieval difference the experiment is trying to isolate — it is a
 * model/`max_tokens` finding for N5, not a retrieval finding.
 */
export const COMPLETION_TOKEN_CASES = [400, 1300] as const;

/**
 * One kNN query bills `ceil(chunks / 100)` index reads plus one read per document returned.
 * 305 chunks and top-k 5 → 4 + 5 = 9 reads.
 */
const FIRESTORE_VECTOR_READS_PER_QUERY = Math.ceil(305 / 100) + 5;

const firestoreReadUsd = (reads: number): number => (
  (reads * FIRESTORE_PRICES.readsPer100k) / 100_000
);

/**
 * A deployed pgvector arm means Cloud SQL, which **has no scale-to-zero and no free tier**.
 * `db-f1-micro` at ~$7.67/month is compute only — storage, backups and egress are extra, and a
 * shared-core instance carries no SLA. Modelling the floor rather than a realistic figure is
 * deliberate: it is the number most favourable to the RAG arm, so a direct-feed win computed
 * against it is a win against the best case for its rival.
 */
export const CLOUD_SQL_FLOOR: FixedCost = {
  usdPerMonth: 7.67,
  note: "Cloud SQL db-f1-micro, compute only, no HA/backups/storage — the floor, not a realistic bill",
};

/**
 * `firestore-vector` adds no always-on instance. The corpus and its vectors sit far inside the
 * 1 GiB free storage quota, and at 100k queries/month its ~900k reads stay under the
 * 50,000-reads/day free allowance — so its fixed cost is genuinely zero at our volumes.
 */
export const FIRESTORE_VECTOR_FIXED: FixedCost = {
  usdPerMonth: 0,
  note: "serverless; ~900k reads/month at the 100k ceiling stays inside the 50k/day free quota",
};

export interface ScenarioOptions {
  completionTokens: number;
  chatModel?: string;
  /**
   * Direct-feed's cache hit rate. Measured at 99.4-99.9% warm; 0 is the cold pass, which is what
   * a request pays after a cache eviction — Fireworks holds a prefix "at least several minutes",
   * so a low-traffic deployment pays cold far more often than a busy one.
   */
  directFeedCacheRate: number;
}

/** The three arms priced side by side under one set of assumptions. */
export const scenarioArms = (options: ScenarioOptions): ArmCostInputs[] => {
  const chatModel = options.chatModel ?? CHAT_MODEL;
  const chatPrices = CHAT_PRICES[chatModel];

  if (!chatPrices) {
    throw new Error(
      `No price recorded for "${chatModel}". Add it to src/eval/prices.ts with the date it was read — `
      + "costing an unpriced model would invent a number.",
    );
  }

  const embeddingPricePerMillion = EMBEDDING_PRICES[EMBEDDING_MODEL];
  const directFeedPromptTokens = 10_900;
  const cachedPromptTokens = Math.round(directFeedPromptTokens * options.directFeedCacheRate);

  return [
    {
      arm: "firestore-direct",
      tokens: {
        promptTokens: directFeedPromptTokens,
        cachedPromptTokens,
        completionTokens: options.completionTokens,
      },
      chatPrices,
      // The slice is loaded once per process, not once per request, so Firestore reads amortize
      // to nothing — the adapter caches it precisely so this line stays zero.
      datastoreUsdPerRequest: 0,
      fixed: { usdPerMonth: 0, note: "no index, no embedding model, no database beyond Firestore" },
    },
    {
      arm: "pgvector-rag",
      tokens: {
        // The observed range was 2,722-4,446 prompt tokens; the upper end is used so the arm is
        // not flattered by its best case.
        promptTokens: 4446,
        cachedPromptTokens: 569,
        completionTokens: options.completionTokens,
        embeddingTokens: 20,
      },
      chatPrices,
      embeddingPricePerMillion,
      fixed: CLOUD_SQL_FLOOR,
    },
    {
      arm: "firestore-vector",
      tokens: {
        // Not yet built (blocked on credentials). Priced on `pgvector-rag`'s token profile, which
        // is the honest placeholder: both send top-k 5 chunks of the same corpus to the same
        // model. Only the datastore and fixed-cost lines differ, and those are the lines that
        // decide between them.
        promptTokens: 4446,
        cachedPromptTokens: 569,
        completionTokens: options.completionTokens,
        embeddingTokens: 20,
      },
      chatPrices,
      embeddingPricePerMillion,
      datastoreUsdPerRequest: firestoreReadUsd(FIRESTORE_VECTOR_READS_PER_QUERY),
      fixed: FIRESTORE_VECTOR_FIXED,
    },
  ];
};

/**
 * `firestore-vector` is priced from a projection, not a measurement, because the arm does not
 * exist yet. Anything printed for it is a forecast and must be labelled as one.
 */
export const PROJECTED_ARMS = ["firestore-vector"] as const;

/** The volume range §1 asks the break-even curve to span. */
export const CURVE_VOLUMES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];
