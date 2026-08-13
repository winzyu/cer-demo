/**
 * The measured inputs the cost model runs on, with their provenance attached.
 *
 * **These are sweep means, taken from `eval/transcripts/warm/`** — 58 turns per arm, 348 turns
 * total, zero failed, captured 2026-08-11 (`RETRIEVAL_COMPARISON.md`). They replace the
 * single-run spot-checks this file previously carried.
 *
 * The **warm** pass is the source because it is the steady state a deployment actually pays.
 * The cold pass is *not* usable: a 20-minute idle failed to expire the Fireworks prompt cache,
 * so "cold" still measured 95.5% cached on direct-feed. That is recorded as a finding rather
 * than smoothed over — a genuinely cold price for direct-feed remains **unmeasured**, and
 * `--cache-rate=0` is the way to price that worst case.
 *
 * They live apart from `cost.ts` so the arithmetic can be tested against fixed numbers while the
 * numbers themselves change as the experiment progresses.
 */
import type { ArmCostInputs, FixedCost } from "./cost";
import { CHAT_PRICES, EMBEDDING_PRICES, FIRESTORE_PRICES } from "./prices";

export type Provenance = "indicative" | "measured";

/** Where the token counts below came from, printed alongside every result. */
export const TOKEN_PROVENANCE: Provenance = "measured";
export const TOKEN_SOURCE = "warm-pass sweep means, 2026-08-11: 3 arms x 58 turns, 0 failed (eval/transcripts/warm/)";

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
export const COMPLETION_TOKEN_CASES = [400, 760, 1300] as const;

/**
 * The sweep's actual mean completion length, added as the middle case above.
 *
 * Measured across all six passes: 740-866 tokens/turn, mean ~760, and — the point worth
 * noting — **the spread between arms (740 vs 866) is smaller than the spread between passes of
 * the same arm.** Completion length is not an arm property, which is what makes holding it
 * constant across arms the right call rather than a simplification.
 */
export const MEASURED_COMPLETION_TOKENS = 760;

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
  // Sweep mean, warm pass: 11,023 prompt tokens/turn across 58 turns.
  const directFeedPromptTokens = 11_023;
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
        // Sweep means, warm pass, **after the lexical-branch repair** (2026-08-12): 3,976 prompt
        // tokens/turn at a 42.6% cache rate. The pre-repair sweep measured 3,584 at 38.4%, but
        // that arm was running dense-only (`RETRIEVAL_BAKEOFF.md` §4a) and its token profile
        // understated a working hybrid. Repairing it moved cost **up**, as expected: a live
        // lexical branch contributes candidates the dense branch did not, so fusion returns more
        // text. The direction matters — the bug was flattering this arm on cost.
        promptTokens: 3976,
        cachedPromptTokens: 1694,
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
        // Now measured, not projected: sweep means, warm pass, 3,498 prompt tokens/turn at a
        // 34.5% cache rate. Very close to `pgvector-rag`, which is the expected result — both
        // send top-k 5 chunks of the same corpus to the same model, so the datastore and
        // fixed-cost lines are what actually separate them.
        promptTokens: 3498,
        cachedPromptTokens: 1207,
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
 * Arms priced from a projection rather than a measurement, printed with a marker so a forecast
 * is never mistaken for a measurement.
 *
 * **Empty since 2026-08-11**: `firestore-vector` was the only entry, and the sweep measured it
 * directly. Every arm in the table is now a sweep mean.
 */
export const PROJECTED_ARMS: readonly string[] = [];

/** The volume range §1 asks the break-even curve to span. */
export const CURVE_VOLUMES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];
