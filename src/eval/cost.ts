/**
 * The cost model that resolves ◆G7 (`RETRIEVAL_BAKEOFF.md` §1).
 *
 * Quality gates the arms; **cost decides between the ones that clear the gate**. This module is
 * the arithmetic half of that decision, kept as pure functions so it can be unit-tested without a
 * sweep, a database, or a single paid inference call — the same reason ranking arithmetic is kept
 * out of the adapters that call it.
 *
 * The shape of the comparison is deliberately linear:
 *
 *     monthly(n) = marginalPerRequest × n + fixedPerMonth
 *
 * Direct-feed has `fixedPerMonth = 0` and a large marginal; a deployed RAG arm has a smaller
 * marginal and a database that bills at zero traffic. **Two straight lines with different
 * intercepts cross at most once**, and that crossing is the deliverable — not the per-answer
 * price, which favours whichever arm you quote it at.
 */
import type { TokenPrices } from "./prices";

const PER_MILLION = 1_000_000;

/** Token counts for one request, as measured — not estimated from answer length. */
export interface RequestTokens {
  promptTokens: number;
  /**
   * The portion of `promptTokens` served from cache. **Not optional here**: an unknown cache
   * split must be resolved before costing, because defaulting it to zero silently prices
   * direct-feed at its worst case and defaulting it to `promptTokens` prices it at its best.
   * `TranscriptTotals.cachedPromptTokens` is deliberately `undefined` when unreported; callers
   * must decide what that means rather than letting this function guess.
   */
  cachedPromptTokens: number;
  completionTokens: number;
  /** Query-embedding tokens. Zero for direct-feed, which needs no embedding model at all. */
  embeddingTokens?: number;
}

/** What an arm costs to keep alive at zero traffic. The line item direct-feed does not have. */
export interface FixedCost {
  usdPerMonth: number;
  /** Why this figure — a bare number here would be unauditable. */
  note: string;
}

export interface ArmCostInputs {
  arm: string;
  tokens: RequestTokens;
  chatPrices: TokenPrices;
  /** USD per 1M embedding input tokens. Ignored when `embeddingTokens` is zero or absent. */
  embeddingPricePerMillion?: number;
  /**
   * Datastore reads attributable to one request — Firestore document + vector-index reads.
   * Three orders of magnitude below the token lines at our volumes, and included anyway: an
   * omitted line item is indistinguishable from a forgotten one when someone audits this later.
   */
  datastoreUsdPerRequest?: number;
  fixed?: FixedCost;
}

export interface PerRequestCost {
  arm: string;
  /** Uncached prompt tokens. */
  inputUsd: number;
  cachedInputUsd: number;
  outputUsd: number;
  embeddingUsd: number;
  datastoreUsd: number;
  /** Everything that scales with request count. */
  totalUsd: number;
}

/**
 * Cost of a single request.
 *
 * Cached and uncached input are billed as separate lines rather than blended, because the blend
 * hides the one number the experiment exists to measure. A 99.9%-cached 10,900-token prompt and a
 * 0%-cached 2,700-token prompt can land within a rounding error of each other in total while
 * being completely different bets on the provider's caching behaviour.
 */
export const perRequestCost = (inputs: ArmCostInputs): PerRequestCost => {
  const { tokens, chatPrices } = inputs;

  if (tokens.cachedPromptTokens > tokens.promptTokens) {
    throw new Error(
      `${inputs.arm}: cachedPromptTokens (${tokens.cachedPromptTokens}) exceeds promptTokens `
      + `(${tokens.promptTokens}) — the cache split is wrong, and costing it would understate the arm.`,
    );
  }

  const uncachedPromptTokens = tokens.promptTokens - tokens.cachedPromptTokens;
  const embeddingTokens = tokens.embeddingTokens ?? 0;

  const inputUsd = (uncachedPromptTokens * chatPrices.input) / PER_MILLION;
  const cachedInputUsd = (tokens.cachedPromptTokens * chatPrices.cachedInput) / PER_MILLION;
  const outputUsd = (tokens.completionTokens * chatPrices.output) / PER_MILLION;
  const embeddingUsd = (embeddingTokens * (inputs.embeddingPricePerMillion ?? 0)) / PER_MILLION;
  const datastoreUsd = inputs.datastoreUsdPerRequest ?? 0;

  return {
    arm: inputs.arm,
    inputUsd,
    cachedInputUsd,
    outputUsd,
    embeddingUsd,
    datastoreUsd,
    totalUsd: inputUsd + cachedInputUsd + outputUsd + embeddingUsd + datastoreUsd,
  };
};

/** Total monthly cost of an arm at a given request volume: marginal × n + fixed. */
export const monthlyCost = (inputs: ArmCostInputs, requestsPerMonth: number): number => (
  perRequestCost(inputs).totalUsd * requestsPerMonth + (inputs.fixed?.usdPerMonth ?? 0)
);

export type BreakEven =
  /** The lines cross at a positive request volume. */
  | { kind: "crossover"; requestsPerMonth: number; cheaperBelow: string; cheaperAbove: string }
  /** One arm is cheaper at every volume — no decision to make on cost. */
  | { kind: "dominated"; cheaper: string; dearer: string }
  /** Identical marginals and identical fixed costs: the arms cost the same everywhere. */
  | { kind: "identical" };

/**
 * Where two arms cost the same per month.
 *
 * **This is the number the report leads with.** A per-answer price makes RAG look better than it
 * is (it hides the database) and a fixed-cost comparison makes direct-feed look better than it is
 * (it hides the token bill). The crossover is the only figure that states both at once, and it is
 * the only one that survives the traffic estimate being wrong — which is why §1 asks for a curve
 * across 1k-100k rather than a verdict at one volume.
 *
 * Returns `dominated` when the arm with the lower marginal *also* has the lower fixed cost: the
 * lines still intersect mathematically, but only at a negative request count, and reporting a
 * negative break-even as though it were a threshold is how a cost model starts lying.
 */
export const breakEven = (a: ArmCostInputs, b: ArmCostInputs): BreakEven => {
  const marginalA = perRequestCost(a).totalUsd;
  const marginalB = perRequestCost(b).totalUsd;
  const fixedA = a.fixed?.usdPerMonth ?? 0;
  const fixedB = b.fixed?.usdPerMonth ?? 0;

  const marginalGap = marginalA - marginalB;
  const fixedGap = fixedB - fixedA;

  if (marginalGap === 0) {
    if (fixedGap === 0) {
      return { kind: "identical" };
    }
    // Parallel lines: the arm with the lower fixed cost is cheaper at every volume, including zero.
    return fixedGap > 0
      ? { kind: "dominated", cheaper: a.arm, dearer: b.arm }
      : { kind: "dominated", cheaper: b.arm, dearer: a.arm };
  }

  const requestsPerMonth = fixedGap / marginalGap;

  if (requestsPerMonth <= 0) {
    // The cheaper-per-request arm is also the cheaper-at-idle arm; the crossover is behind us.
    return marginalGap > 0
      ? { kind: "dominated", cheaper: b.arm, dearer: a.arm }
      : { kind: "dominated", cheaper: a.arm, dearer: b.arm };
  }

  // Below the crossover the low-fixed-cost arm wins; above it the low-marginal arm does.
  return marginalGap > 0
    ? {
      kind: "crossover", requestsPerMonth, cheaperBelow: a.arm, cheaperAbove: b.arm,
    }
    : {
      kind: "crossover", requestsPerMonth, cheaperBelow: b.arm, cheaperAbove: a.arm,
    };
};

/**
 * Monthly cost of every arm across a range of volumes — the break-even curve as a table.
 *
 * Volumes are supplied rather than generated so the report's x-axis is an explicit, reviewable
 * choice instead of an implicit one buried in a loop.
 */
export const costCurve = (
  arms: ArmCostInputs[],
  volumes: number[],
): { requestsPerMonth: number; byArm: Record<string, number> }[] => volumes.map(
  (requestsPerMonth) => ({
    requestsPerMonth,
    byArm: Object.fromEntries(
      arms.map((arm) => [arm.arm, monthlyCost(arm, requestsPerMonth)]),
    ),
  }),
);
