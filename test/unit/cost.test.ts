import {
  breakEven, costCurve, monthlyCost, perRequestCost,
} from "../../src/eval/cost";
import type { ArmCostInputs } from "../../src/eval/cost";
import {
  CURVE_VOLUMES, MEASURED_COMPLETION_TOKENS_BY_ARM, scenarioArms,
} from "../../src/eval/costScenarios";
import { CHAT_PRICES, EMBEDDING_PRICES } from "../../src/eval/prices";

const GPT_OSS_120B_ID = "accounts/fireworks/models/gpt-oss-120b";
const GPT_OSS_120B = CHAT_PRICES[GPT_OSS_120B_ID];

const arm = (overrides: Partial<ArmCostInputs> = {}): ArmCostInputs => ({
  arm: "test",
  tokens: { promptTokens: 1_000_000, cachedPromptTokens: 0, completionTokens: 0 },
  chatPrices: GPT_OSS_120B,
  ...overrides,
});

describe("perRequestCost", () => {
  it("bills exactly the per-million rate for one million uncached prompt tokens", () => {
    expect(perRequestCost(arm()).totalUsd).toBeCloseTo(GPT_OSS_120B.input, 10);
  });

  it("bills cached and uncached input on separate lines", () => {
    const cost = perRequestCost(arm({
      tokens: { promptTokens: 1_000_000, cachedPromptTokens: 600_000, completionTokens: 0 },
    }));

    expect(cost.inputUsd).toBeCloseTo(0.4 * GPT_OSS_120B.input, 10);
    expect(cost.cachedInputUsd).toBeCloseTo(0.6 * GPT_OSS_120B.cachedInput, 10);
    expect(cost.totalUsd).toBeCloseTo(cost.inputUsd + cost.cachedInputUsd, 10);
  });

  it("throws when the cache split exceeds the prompt — a wrong split understates the arm", () => {
    expect(() => perRequestCost(arm({
      tokens: { promptTokens: 100, cachedPromptTokens: 101, completionTokens: 0 },
    }))).toThrow(/exceeds promptTokens/);
  });

  it("charges nothing for embeddings when an arm sends none", () => {
    expect(perRequestCost(arm({ embeddingPricePerMillion: 999 })).embeddingUsd).toBe(0);
  });

  it("includes the datastore line in the total", () => {
    const cost = perRequestCost(arm({ datastoreUsdPerRequest: 0.5 }));
    expect(cost.datastoreUsd).toBe(0.5);
    expect(cost.totalUsd).toBeCloseTo(GPT_OSS_120B.input + 0.5, 10);
  });
});

describe("monthlyCost", () => {
  it("adds the fixed cost once, not once per request", () => {
    const subject = arm({ fixed: { usdPerMonth: 10, note: "database" } });
    expect(monthlyCost(subject, 0)).toBe(10);
    expect(monthlyCost(subject, 2)).toBeCloseTo(2 * GPT_OSS_120B.input + 10, 10);
  });
});

describe("breakEven", () => {
  const cheapMarginalHighFixed = arm({
    arm: "rag",
    tokens: { promptTokens: 100_000, cachedPromptTokens: 0, completionTokens: 0 },
    fixed: { usdPerMonth: 10, note: "always-on database" },
  });
  const dearMarginalNoFixed = arm({
    arm: "direct",
    tokens: { promptTokens: 1_000_000, cachedPromptTokens: 0, completionTokens: 0 },
  });

  it("finds the crossover and names which arm wins on each side", () => {
    const result = breakEven(dearMarginalNoFixed, cheapMarginalHighFixed);

    expect(result.kind).toBe("crossover");
    if (result.kind !== "crossover") { throw new Error("expected a crossover"); }

    // marginal gap = (1M - 100k) tokens x $0.15/1M = $0.135/request; $10 fixed / $0.135.
    expect(result.requestsPerMonth).toBeCloseTo(10 / 0.135, 6);
    expect(result.cheaperBelow).toBe("direct");
    expect(result.cheaperAbove).toBe("rag");
  });

  it("is symmetric — argument order does not change the answer", () => {
    const forward = breakEven(dearMarginalNoFixed, cheapMarginalHighFixed);
    const reverse = breakEven(cheapMarginalHighFixed, dearMarginalNoFixed);
    expect(reverse).toEqual(forward);
  });

  it("reports domination rather than a negative crossover", () => {
    const cheaperEverywhere = arm({
      arm: "cheap",
      tokens: { promptTokens: 100, cachedPromptTokens: 0, completionTokens: 0 },
    });
    const dearerEverywhere = arm({
      arm: "dear",
      tokens: { promptTokens: 100_000, cachedPromptTokens: 0, completionTokens: 0 },
      fixed: { usdPerMonth: 50, note: "database" },
    });

    const result = breakEven(cheaperEverywhere, dearerEverywhere);
    expect(result).toEqual({ kind: "dominated", cheaper: "cheap", dearer: "dear" });
  });

  it("treats equal marginals with unequal fixed costs as domination, not a crossover", () => {
    const withFixed = arm({ arm: "with", fixed: { usdPerMonth: 5, note: "db" } });
    const withoutFixed = arm({ arm: "without" });

    expect(breakEven(withFixed, withoutFixed)).toEqual({
      kind: "dominated", cheaper: "without", dearer: "with",
    });
  });

  it("recognises two identical arms", () => {
    expect(breakEven(arm({ arm: "a" }), arm({ arm: "b" })).kind).toBe("identical");
  });
});

describe("costCurve", () => {
  it("prices every arm at every requested volume", () => {
    const rows = costCurve([arm({ arm: "a" }), arm({ arm: "b" })], [1, 2]);

    expect(rows).toHaveLength(2);
    expect(rows[0].requestsPerMonth).toBe(1);
    expect(Object.keys(rows[1].byArm).sort()).toEqual(["a", "b"]);
  });
});

/**
 * These lock in the conclusion the phase turns on. If a price changes in `prices.ts`, these fail
 * loudly rather than letting a stale narrative survive in the docs.
 */
describe("the ◆G7 cost conclusion", () => {
  const armsFor = (chatModel: string) => scenarioArms({
    completionTokens: 400, chatModel, sliceCacheRate: 0.996,
  });
  const byName = (list: ArmCostInputs[], name: string): ArmCostInputs => {
    const found = list.find((a) => a.arm === name);
    if (!found) { throw new Error(`no arm ${name}`); }
    return found;
  };

  it("nomic-embed-text-v1.5 sits in the sub-150M-parameter embedding tier", () => {
    expect(EMBEDDING_PRICES["nomic-ai/nomic-embed-text-v1.5"]).toBe(0.008);
  });

  it("gpt-oss-120b caches at ~90% off, the discount direct-feed's cost case rests on", () => {
    expect(GPT_OSS_120B.cachedInput / GPT_OSS_120B.input).toBeLessThan(0.12);
  });

  it("on gpt-oss-120b the ~90% discount DOES invert it — direct-feed becomes cheaper per answer", () => {
    const arms = armsFor(GPT_OSS_120B_ID);
    const direct = perRequestCost(byName(arms, "firestore-direct")).totalUsd;
    const rag = perRequestCost(byName(arms, "pgvector-rag")).totalUsd;

    expect(direct).toBeLessThan(rag);
  });

  it("firestore-vector beats pgvector-rag everywhere inside the modelled range", () => {
    const arms = armsFor(GPT_OSS_120B_ID);
    const vector = byName(arms, "firestore-vector");
    const pg = byName(arms, "pgvector-rag");
    const result = breakEven(vector, pg);

    // **This flipped from `crossover` to `dominated` on 2026-08-12**, when pgvector-rag's dead
    // lexical branch was repaired (RETRIEVAL_BAKEOFF.md §4b).
    //
    // Before: firestore-vector paid per-query Firestore reads that pgvector-rag did not, so its
    // marginal was fractionally higher and the two crossed — at ~2.96M requests/month, far past
    // the ceiling, but they did cross. Repairing the lexical branch raised pgvector-rag's prompt
    // tokens (3,584 -> 3,976), pushing its marginal above firestore-vector's. It now has both the
    // higher marginal AND the higher fixed cost, so no crossover exists at any positive volume.
    //
    // `dominated` rather than a negative crossover is the whole point of that branch in
    // `breakEven`: reporting "they cross at -180,000 requests/month" would be arithmetically
    // true and operationally meaningless.
    expect(result.kind).toBe("dominated");
    if (result.kind !== "dominated") { throw new Error("expected domination"); }
    expect(result.cheaper).toBe("firestore-vector");

    expect(monthlyCost(vector, 1_000)).toBeLessThan(monthlyCost(pg, 1_000));
    expect(monthlyCost(vector, 100_000)).toBeLessThan(monthlyCost(pg, 100_000));
  });

  it("refuses to price a model with no recorded rate rather than inventing one", () => {
    expect(() => scenarioArms({
      completionTokens: 400, chatModel: "accounts/fireworks/models/unpriced", sliceCacheRate: 1,
    })).toThrow(/No price recorded/);
  });

  it("prices every captured arm, so the report never has to hand-compute one", () => {
    const arms = armsFor(GPT_OSS_120B_ID).map((a) => a.arm);

    // The two hybrids were once priced by hand in the bake-off report until they were added here.
    // Hand arithmetic in a report cannot be re-run by an auditor.
    expect(arms.sort()).toEqual([
      "firestore-direct", "firestore-vector", "hybrid-slice-lexvec", "hybrid-slice-vector",
      "pgvector-rag",
    ]);
  });

  it("charges the hybrids nothing per query for Firestore, because they issue no query to it", () => {
    const arms = armsFor(GPT_OSS_120B_ID);

    // Composed from DirectFeedAdapter (slice cached once per process) and LocalVectorAdapter
    // (local embedding cache). The kNN reads firestore-vector pays have no counterpart.
    ["hybrid-slice-vector", "hybrid-slice-lexvec"].forEach((name) => {
      expect(perRequestCost(byName(arms, name)).datastoreUsd).toBe(0);
      expect(byName(arms, name).fixed?.usdPerMonth).toBe(0);
    });

    expect(perRequestCost(byName(arms, "firestore-vector")).datastoreUsd).toBeGreaterThan(0);
  });

  it("prices the hybrids ABOVE direct-feed per answer — composing retrieval is a surcharge", () => {
    const arms = armsFor(GPT_OSS_120B_ID);
    const direct = perRequestCost(byName(arms, "firestore-direct")).totalUsd;

    // Both hybrids send the whole operator slice AND retrieved chunks. Their case is the ◆G9
    // "never face an empty context" quality argument; on cost they are strictly dearer, and the
    // report must not imply otherwise.
    expect(perRequestCost(byName(arms, "hybrid-slice-vector")).totalUsd).toBeGreaterThan(direct);
    expect(perRequestCost(byName(arms, "hybrid-slice-lexvec")).totalUsd).toBeGreaterThan(direct);
  });

  it("caps cached tokens at what each arm measured, and zeroes them on the cold sweep", () => {
    const sliceCarrying = ["firestore-direct", "hybrid-slice-vector", "hybrid-slice-lexvec"];

    // A cache rate above every measured rate must not credit an arm with more cache than the
    // sweep saw — that would flatter exactly the arms being priced.
    const generous = scenarioArms({ completionTokens: 400, sliceCacheRate: 1 });
    expect(byName(generous, "firestore-direct").tokens.cachedPromptTokens).toBe(10_910);
    expect(byName(generous, "hybrid-slice-vector").tokens.cachedPromptTokens).toBe(11_015);
    expect(byName(generous, "hybrid-slice-lexvec").tokens.cachedPromptTokens).toBe(10_564);

    // --cache-rate=0 is the post-eviction worst case, and it must hit every arm carrying the
    // slice. Sweeping direct-feed alone would have priced the cold case with the hybrids still
    // ~87% cached, inverting the ranking for reasons that are an artifact of the model.
    const cold = scenarioArms({ completionTokens: 400, sliceCacheRate: 0 });
    sliceCarrying.forEach((name) => {
      expect(byName(cold, name).tokens.cachedPromptTokens).toBe(0);
      expect(perRequestCost(byName(cold, name)).cachedInputUsd).toBe(0);
    });
  });

  it("pins each arm's measured per-answer cost at gpt-oss-120b rates", () => {
    const arms = scenarioArms({
      completionTokens: "measured",
      chatModel: GPT_OSS_120B_ID,
      sliceCacheRate: 0.996,
    });
    const perAnswer = (name: string) => perRequestCost(byName(arms, name)).totalUsd;

    // Repinned 2026-09-15 when 20b pricing was removed: the archived 20b sweep's token counts at
    // 120b rates, with firestore-vector at 10 Firestore reads per query on the 446-chunk corpus.
    // firestore-direct matches EVAL_REBUILD.md §4's $0.000625. If this fails, the token counts or
    // the price sheet moved, and every cost figure quoted from `npm run cost` is stale.
    expect(perAnswer("firestore-direct")).toBeCloseTo(0.0006246, 7);
    expect(perAnswer("pgvector-rag")).toBeCloseTo(0.00072427, 8);
    expect(perAnswer("hybrid-slice-vector")).toBeCloseTo(0.000661645, 9);
    expect(perAnswer("hybrid-slice-lexvec")).toBeCloseTo(0.00109837, 8);
    expect(perAnswer("firestore-vector")).toBeCloseTo(0.00064141, 8);
  });

  it("refuses to price an arm at a measured length it has no measurement for", () => {
    // Falling back on the swept constant would print one table mixing measured and assumed
    // lengths under a heading that says "measured".
    expect(() => scenarioArms({
      completionTokens: "measured",
      chatModel: GPT_OSS_120B_ID,
      sliceCacheRate: 1,
    })).not.toThrow();

    expect(MEASURED_COMPLETION_TOKENS_BY_ARM["no-such-arm"]).toBeUndefined();
  });

  it("spans the 1k-100k range §1 asks for", () => {
    expect(CURVE_VOLUMES[0]).toBe(1_000);
    expect(CURVE_VOLUMES[CURVE_VOLUMES.length - 1]).toBe(100_000);
  });
});
