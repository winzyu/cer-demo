import {
  breakEven, costCurve, monthlyCost, perRequestCost,
} from "../../src/eval/cost";
import type { ArmCostInputs } from "../../src/eval/cost";
import { CURVE_VOLUMES, scenarioArms } from "../../src/eval/costScenarios";
import { CHAT_PRICES, EMBEDDING_PRICES } from "../../src/eval/prices";

const GPT_OSS_20B = CHAT_PRICES["accounts/fireworks/models/gpt-oss-20b"];
const GPT_OSS_120B = CHAT_PRICES["accounts/fireworks/models/gpt-oss-120b"];

const arm = (overrides: Partial<ArmCostInputs> = {}): ArmCostInputs => ({
  arm: "test",
  tokens: { promptTokens: 1_000_000, cachedPromptTokens: 0, completionTokens: 0 },
  chatPrices: GPT_OSS_20B,
  ...overrides,
});

describe("perRequestCost", () => {
  it("bills exactly the per-million rate for one million uncached prompt tokens", () => {
    expect(perRequestCost(arm()).totalUsd).toBeCloseTo(GPT_OSS_20B.input, 10);
  });

  it("bills cached and uncached input on separate lines", () => {
    const cost = perRequestCost(arm({
      tokens: { promptTokens: 1_000_000, cachedPromptTokens: 600_000, completionTokens: 0 },
    }));

    expect(cost.inputUsd).toBeCloseTo(0.4 * GPT_OSS_20B.input, 10);
    expect(cost.cachedInputUsd).toBeCloseTo(0.6 * GPT_OSS_20B.cachedInput, 10);
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
    expect(cost.totalUsd).toBeCloseTo(GPT_OSS_20B.input + 0.5, 10);
  });
});

describe("monthlyCost", () => {
  it("adds the fixed cost once, not once per request", () => {
    const subject = arm({ fixed: { usdPerMonth: 10, note: "database" } });
    expect(monthlyCost(subject, 0)).toBe(10);
    expect(monthlyCost(subject, 2)).toBeCloseTo(2 * GPT_OSS_20B.input + 10, 10);
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

    // marginal gap = (1M - 100k) tokens x $0.07/1M = $0.063/request; $10 fixed / $0.063.
    expect(result.requestsPerMonth).toBeCloseTo(10 / 0.063, 6);
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
    completionTokens: 400, chatModel, directFeedCacheRate: 0.996,
  });
  const byName = (list: ArmCostInputs[], name: string): ArmCostInputs => {
    const found = list.find((a) => a.arm === name);
    if (!found) { throw new Error(`no arm ${name}`); }
    return found;
  };

  it("nomic-embed-text-v1.5 sits in the sub-150M-parameter embedding tier", () => {
    expect(EMBEDDING_PRICES["nomic-ai/nomic-embed-text-v1.5"]).toBe(0.008);
  });

  it("gpt-oss-20b caches at 50% off but gpt-oss-120b caches at ~90%", () => {
    expect(GPT_OSS_20B.cachedInput / GPT_OSS_20B.input).toBeCloseTo(0.5, 6);
    expect(GPT_OSS_120B.cachedInput / GPT_OSS_120B.input).toBeLessThan(0.12);
  });

  it("on gpt-oss-20b the 50% discount does NOT invert the story — RAG stays cheaper per answer", () => {
    const arms = armsFor("accounts/fireworks/models/gpt-oss-20b");
    const direct = perRequestCost(byName(arms, "firestore-direct")).totalUsd;
    const rag = perRequestCost(byName(arms, "pgvector-rag")).totalUsd;

    expect(rag).toBeLessThan(direct);
  });

  it("on gpt-oss-120b the ~90% discount DOES invert it — direct-feed becomes cheaper per answer", () => {
    const arms = armsFor("accounts/fireworks/models/gpt-oss-120b");
    const direct = perRequestCost(byName(arms, "firestore-direct")).totalUsd;
    const rag = perRequestCost(byName(arms, "pgvector-rag")).totalUsd;

    expect(direct).toBeLessThan(rag);
  });

  it("direct-feed beats a deployed pgvector arm across the low end of the 1k-100k range", () => {
    const arms = armsFor("accounts/fireworks/models/gpt-oss-20b");
    const result = breakEven(byName(arms, "firestore-direct"), byName(arms, "pgvector-rag"));

    expect(result.kind).toBe("crossover");
    if (result.kind !== "crossover") { throw new Error("expected a crossover"); }
    expect(result.cheaperBelow).toBe("firestore-direct");

    // **This bound moved when the sweep replaced the spot-check inputs (2026-08-11).** It was
    // `> 50_000` — a conclusion drawn from an estimated pgvector profile of 4,446 prompt tokens
    // at a 12.8% cache rate. The 58-turn sweep measured 3,584 tokens at 38.4%: RAG is cheaper
    // per request than the estimate assumed, so the crossover fell from ~84k to ~41.6k and
    // direct-feed's cheaper-than-pgvector window roughly halved.
    //
    // The direction matters for the report: measurement made the RAG arm look *better*, not
    // worse. Direct-feed still wins at the realistic 10k/month, but no longer across "most" of
    // the range — it loses above ~42k, which sits inside the 100k ceiling rather than beyond it.
    expect(result.requestsPerMonth).toBeGreaterThan(35_000);
    expect(result.requestsPerMonth).toBeLessThan(50_000);
  });

  it("firestore-vector beats pgvector-rag everywhere inside the modelled range", () => {
    const arms = armsFor("accounts/fireworks/models/gpt-oss-20b");
    const vector = byName(arms, "firestore-vector");
    const pg = byName(arms, "pgvector-rag");
    const result = breakEven(vector, pg);

    // They do cross: firestore-vector pays per-query reads that pgvector-rag does not, so its
    // marginal is fractionally higher. But Cloud SQL's idle bill pushes the crossing far past the
    // 100k ceiling — the difference is a rounding error against an always-on database.
    expect(result.kind).toBe("crossover");
    if (result.kind !== "crossover") { throw new Error("expected a crossover"); }
    expect(result.cheaperBelow).toBe("firestore-vector");
    expect(result.requestsPerMonth).toBeGreaterThan(1_000_000);

    expect(monthlyCost(vector, 100_000)).toBeLessThan(monthlyCost(pg, 100_000));
  });

  it("refuses to price a model with no recorded rate rather than inventing one", () => {
    expect(() => scenarioArms({
      completionTokens: 400, chatModel: "accounts/fireworks/models/unpriced", directFeedCacheRate: 1,
    })).toThrow(/No price recorded/);
  });

  it("spans the 1k-100k range §1 asks for", () => {
    expect(CURVE_VOLUMES[0]).toBe(1_000);
    expect(CURVE_VOLUMES[CURVE_VOLUMES.length - 1]).toBe(100_000);
  });
});
