/**
 * The measured inputs the cost model runs on, with their provenance attached.
 *
 * **These are sweep means, taken from `eval/transcripts/warm/`** — 58 turns per arm, zero failed
 * (`RETRIEVAL_COMPARISON.md`). They replace the single-run spot-checks this file previously
 * carried.
 *
 * **The five arms were not captured on one date**, because the corpus and the arm set moved:
 * `firestore-direct` 2026-08-11, `pgvector-rag` 2026-08-13, `hybrid-slice-lexvec` 2026-08-25/26,
 * `firestore-vector` and `hybrid-slice-vector` 2026-08-26. Every figure below is recomputed from
 * whatever transcripts are on disk now, so re-capturing an arm and forgetting this file shows up
 * as a stale number rather than a silent one — which is exactly what happened to
 * `firestore-vector`, whose entry sat at its superseded 2026-08-11 cold-pass profile until
 * 2026-08-26.
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
export const TOKEN_SOURCE = "warm-pass sweep means, 2026-08-11..2026-08-26: 5 arms x 58 turns, 0 failed (eval/transcripts/warm/)";

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
 * Measured at 740-866 tokens/turn across the three original arms, mean ~760, on the reading that
 * **the spread between arms was smaller than the spread between passes of the same arm** — so
 * completion length was not an arm property.
 *
 * **That reading no longer holds and the constant is kept anyway.** The five arms now on disk
 * span 405 (`hybrid-slice-vector`) to 961 (`hybrid-slice-lexvec`) tokens/turn — a 2.4x spread,
 * far wider than any pass-to-pass one. The cause is gpt-oss's reasoning budget, which swings ~8x
 * for answers that read the same length, not the retrieval strategy; letting it inside the
 * per-arm figures would swamp the difference this experiment exists to isolate. So it stays a
 * swept variable (`COMPLETION_TOKEN_CASES` brackets the whole observed range), and the honest
 * statement is now **"held constant so it cannot confound"**, not "constant because it varies
 * little". A per-arm completion cost is a real finding — it belongs to N5's `max_tokens` work.
 */
export const MEASURED_COMPLETION_TOKENS = 760;

/**
 * One kNN query bills `ceil(chunks / 100)` index reads plus one read per document returned.
 * 393 chunks and top-k 5 → 4 + 5 = 9 reads. (Was written against a 305-chunk corpus; the count
 * is now 393 and the billed figure is unchanged, since both land in the same 100-entry batch.)
 */
const FIRESTORE_VECTOR_READS_PER_QUERY = Math.ceil(393 / 100) + 5;

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

/**
 * Both hybrid arms add no always-on infrastructure. They run on the Firestore the service already
 * uses plus a local embedding cache, which is a build artifact (`npm run embed:cache`) rather than
 * a hosted index — so unlike `pgvector-rag` there is nothing here that bills at zero traffic.
 */
export const HYBRID_SLICE_FIXED: FixedCost = {
  usdPerMonth: 0,
  note: "no hosted index and no database beyond Firestore; the embedding cache is a build artifact",
};

export interface ScenarioOptions {
  completionTokens: number;
  chatModel?: string;
  /**
   * Cache hit rate on the **operator slice** — the shared prompt prefix. Measured at 99.0-99.9%
   * warm; 0 is the cold pass, which is what a request pays after a cache eviction. Fireworks
   * holds a prefix "at least several minutes", so a low-traffic deployment pays cold far more
   * often than a busy one.
   *
   * **Named for the slice, not for `firestore-direct`, because three arms now carry it.** Both
   * hybrids prepend the same 5-document slice to their retrieved chunks, so they are exposed to
   * exactly the same eviction risk. Sweeping this rate for direct-feed alone would have priced
   * the cold case with direct-feed at 0% cache and the hybrids still at ~87% — a ranking that is
   * an artifact of the model, not of the arms.
   */
  sliceCacheRate: number;
}

/**
 * The measured prompt length of the operator slice on its own — `firestore-direct` sends nothing
 * else, so its sweep mean *is* the slice. The hybrids' cached portion is bounded by this: they
 * cache the shared prefix, not the chunks retrieved per question.
 */
const SLICE_PROMPT_TOKENS = 11_023;

/** The five arms priced side by side under one set of assumptions. */
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

  /**
   * Cached tokens for an arm carrying the slice: the swept rate applied to the slice, **capped at
   * what that arm actually measured**. The cap matters — the default `--cache-rate` (0.996) is
   * above every arm's measured rate, so without it the model would credit each arm with more
   * cache than the sweep observed, in the direction that flatters the arms this experiment is
   * pricing. With it, the default reproduces the measurement and only a *lower* rate moves.
   */
  const sliceCached = (measuredCached: number): number => Math.min(
    measuredCached,
    Math.round(SLICE_PROMPT_TOKENS * options.sliceCacheRate),
  );

  return [
    {
      arm: "firestore-direct",
      tokens: {
        // Sweep means, warm pass: 11,023 prompt tokens/turn at 10,910 cached (99.0%), 58 turns.
        promptTokens: SLICE_PROMPT_TOKENS,
        cachedPromptTokens: sliceCached(10_910),
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
        // The arm's runtime code is archived (`archive/pgvector-rag/`), but this scenario stays:
        // it is measured ◆G7 evidence, and the cost comparison that retired the arm is only
        // auditable if the losing arm's numbers are still in it.
        //
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
        // Sweep means, warm pass, **re-captured 2026-08-26 on the 15-document corpus**: 3,342
        // prompt tokens/turn at 1,030 cached (30.8%), 58 turns. The previous entry here (3,498 at
        // 1,207) was the superseded 2026-08-11 capture and had drifted out of agreement with the
        // transcripts on disk — the staleness the header now warns about, found by recomputing
        // rather than by reading.
        //
        // Still close to `pgvector-rag`, which is the expected result: both send top-k 5 chunks
        // of the same corpus to the same model, so the datastore and fixed-cost lines are what
        // actually separate them. Priced despite failing Tier 1 (2 fabricated figures) for the
        // same reason `pgvector-rag` is — a comparison that drops its losers is unauditable.
        promptTokens: 3342,
        cachedPromptTokens: 1030,
        completionTokens: options.completionTokens,
        embeddingTokens: 20,
      },
      chatPrices,
      embeddingPricePerMillion,
      datastoreUsdPerRequest: firestoreReadUsd(FIRESTORE_VECTOR_READS_PER_QUERY),
      fixed: FIRESTORE_VECTOR_FIXED,
    },
    {
      arm: "hybrid-slice-vector",
      tokens: {
        // Sweep means, warm pass, captured 2026-08-26: 12,671 prompt tokens/turn at 11,015
        // cached (86.9%), 58 turns.
        //
        // **This arm is dearer per answer than direct-feed, not cheaper.** It sends the whole
        // slice *and* five retrieved chunks — 12,671 against direct-feed's 11,023 — so composing
        // retrieval on top of the operator tier buys grounding at roughly 1,650 extra prompt
        // tokens/turn, every turn. Worth stating plainly: the arm was motivated by the ◆G9
        // "never face an empty context" argument, which is a quality argument, and on cost it is
        // strictly a surcharge.
        promptTokens: 12_671,
        cachedPromptTokens: sliceCached(11_015),
        completionTokens: options.completionTokens,
        embeddingTokens: 20,
      },
      chatPrices,
      embeddingPricePerMillion,
      // Zero, and derived from the composition rather than assumed: this arm composes
      // `DirectFeedAdapter` (which loads the slice once per process and caches it) with
      // `LocalVectorAdapter` (which reads a pre-built cache off local disk). Neither touches
      // Firestore per query — the vector arm's 9 reads/query have no counterpart here, because no
      // kNN query is issued to Firestore at all.
      datastoreUsdPerRequest: 0,
      fixed: HYBRID_SLICE_FIXED,
    },
    {
      arm: "hybrid-slice-lexvec",
      tokens: {
        // Sweep means, warm pass, captured 2026-08-25/26: 12,985 prompt tokens/turn at 10,564
        // cached (81.4%), 58 turns.
        //
        // 314 prompt tokens/turn dearer than `hybrid-slice-vector` and, per Tier 2, worth 0.86
        // against 0.88 on correctness — the lexical branch costs more and returns nothing at the
        // answer layer. The cache rate is lower too (81.4% vs 86.9%): RRF fusion returns a
        // different chunk set per question, which lengthens the variable tail behind the fixed
        // prefix without lengthening the prefix itself.
        promptTokens: 12_985,
        cachedPromptTokens: sliceCached(10_564),
        completionTokens: options.completionTokens,
        embeddingTokens: 20,
      },
      chatPrices,
      embeddingPricePerMillion,
      // Same composition as above plus an in-process BM25 index built from `corpus.json`. BM25
      // costs CPU, not tokens and not reads.
      datastoreUsdPerRequest: 0,
      fixed: HYBRID_SLICE_FIXED,
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
