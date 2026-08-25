import {
  HIT_THRESHOLD,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  scoreQuery,
  summarise,
} from "../../src/eval/retrieval/metrics";
import type { LabelledQuery, RankedResult } from "../../src/eval/retrieval/types";

/**
 * Every expected value here is computed by hand in the comment that precedes it.
 *
 * That is the point of this suite. These metrics are the instrument every future retrieval
 * decision gets read off, and an instrument nobody independently checked is not evidence — a
 * subtly wrong nDCG would quietly rank a worse retriever first, forever, and nothing downstream
 * would contradict it.
 */

const label = (relevant: Array<[string, 0 | 1 | 2]>, extra: Partial<LabelledQuery> = {}): LabelledQuery => ({
  turn: 1,
  query: "q",
  relevant: relevant.map(([chunkId, grade]) => ({
    chunkId, contentHash: chunkId, filename: "f.pdf", grade, evidence: "e",
  })),
  ...extra,
});

const ranked = (...ids: string[]): RankedResult[] => ids.map((chunkId, i) => ({
  chunkId, filename: "f.pdf", rank: i + 1,
}));

describe("recallAtK", () => {
  it("is the fraction of relevant chunks that appear in the top k", () => {
    // wanted {A,B}; top-3 of [A,X,B] contains both -> 2/2
    expect(recallAtK(label([["A", 2], ["B", 1]]), ranked("A", "X", "B"), 3)).toBe(1);
    // top-2 of [A,X,B] contains only A -> 1/2
    expect(recallAtK(label([["A", 2], ["B", 1]]), ranked("A", "X", "B"), 2)).toBe(0.5);
  });

  it("ignores grade-0 chunks, which are recorded rejections rather than targets", () => {
    // Grade 0 is a deliberate near-miss record. Counting it as wanted would make a correct
    // retriever look incomplete for declining to return something we judged irrelevant.
    expect(recallAtK(label([["A", 2], ["N", 0]]), ranked("A"), 5)).toBe(1);
  });

  it("scores a query with no relevant chunks as 1, not 0", () => {
    // "Retrieved all zero of the zero relevant chunks" is vacuously complete. Scoring it 0 would
    // punish an adapter for a label that says there was nothing to find.
    expect(recallAtK(label([], { noRelevantChunks: "refusal turn" }), ranked(), 5)).toBe(1);
    expect(recallAtK(label([], { noRelevantChunks: "refusal turn" }), ranked("X"), 5)).toBe(1);
  });

  it("uses HIT_THRESHOLD as the grade floor", () => {
    expect(HIT_THRESHOLD).toBe(1);
  });
});

describe("precisionAtK", () => {
  it("divides by what was actually returned, not by k", () => {
    // An adapter returning 3 chunks at k=5 is not penalised for the 2 it declined to invent.
    // top-5 of [A,X,B] -> 3 returned, 2 relevant -> 2/3
    expect(precisionAtK(label([["A", 2], ["B", 1]]), ranked("A", "X", "B"), 5)).toBeCloseTo(2 / 3, 10);
  });

  it("is 0 when nothing relevant was returned but something was expected", () => {
    expect(precisionAtK(label([["A", 2]]), ranked("X", "Y"), 5)).toBe(0);
  });

  it("is 1 when nothing was expected and nothing was returned", () => {
    expect(precisionAtK(label([], { noRelevantChunks: "n/a" }), ranked(), 5)).toBe(1);
  });
});

describe("reciprocalRank", () => {
  it("is 1/rank of the first relevant chunk", () => {
    expect(reciprocalRank(label([["A", 2], ["B", 1]]), ranked("A", "X", "B"), 3)).toBe(1);
    // first relevant is B at position 2 -> 1/2
    expect(reciprocalRank(label([["A", 2], ["B", 1]]), ranked("X", "B", "A"), 3)).toBe(0.5);
    // first relevant is A at position 3 -> 1/3
    expect(reciprocalRank(label([["A", 2]]), ranked("X", "Y", "A"), 3)).toBeCloseTo(1 / 3, 10);
  });

  it("is 0 when no relevant chunk appears within k", () => {
    expect(reciprocalRank(label([["A", 2]]), ranked("X", "Y", "A"), 2)).toBe(0);
  });
});

describe("ndcgAtK", () => {
  /**
   * Worked by hand, gain = 2^grade - 1, discount = log2(rank + 1).
   *
   * Label: A grade 2 (gain 3), B grade 1 (gain 1). Results [A, X, B], k = 3.
   *   DCG   = 3/log2(2) + 0/log2(3) + 1/log2(4) = 3 + 0 + 0.5           = 3.5
   *   Ideal = 3/log2(2) + 1/log2(3)             = 3 + 0.6309297535714574 = 3.6309297535714574
   *   nDCG  = 3.5 / 3.6309297535714574                                   = 0.9639414...
   */
  it("rewards putting the higher-graded chunk first", () => {
    expect(ndcgAtK(label([["A", 2], ["B", 1]]), ranked("A", "X", "B"), 3))
      .toBeCloseTo(3.5 / (3 + (1 / Math.log2(3))), 10);
  });

  /**
   * Same label, results [X, B, A]:
   *   DCG  = 0 + 1/log2(3) + 3/log2(4) = 0.6309297535714574 + 1.5 = 2.1309297535714574
   *   nDCG = 2.1309297535714574 / 3.6309297535714574              = 0.5868...
   */
  it("penalises ranking the supporting chunk above the answering one", () => {
    const better = ndcgAtK(label([["A", 2], ["B", 1]]), ranked("A", "X", "B"), 3);
    const worse = ndcgAtK(label([["A", 2], ["B", 1]]), ranked("X", "B", "A"), 3);
    expect(worse).toBeCloseTo((1 / Math.log2(3) + 1.5) / (3 + 1 / Math.log2(3)), 10);
    expect(worse).toBeLessThan(better);
  });

  it("is the only metric that distinguishes grade 2 from grade 1", () => {
    // Recall and MRR collapse the scale; nDCG must not.
    const answering = ndcgAtK(label([["A", 2]]), ranked("A"), 3);
    const supporting = ndcgAtK(label([["A", 2]]), ranked("B", "A"), 3);
    expect(answering).toBe(1);
    expect(supporting).toBeLessThan(1);
  });

  it("is 1 when nothing is relevant and nothing was returned", () => {
    expect(ndcgAtK(label([], { noRelevantChunks: "n/a" }), ranked(), 5)).toBe(1);
  });
});

describe("scoreQuery", () => {
  it("flags correctlyEmpty only for turns that expect nothing", () => {
    const refusal = scoreQuery("f", "refusal", label([], { noRelevantChunks: "n/a" }), ranked(), 5);
    expect(refusal.correctlyEmpty).toBe(true);

    const refusalMissed = scoreQuery("f", "refusal", label([], { noRelevantChunks: "n/a" }), ranked("X"), 5);
    expect(refusalMissed.correctlyEmpty).toBe(false);

    const normal = scoreQuery("f", "definitional", label([["A", 2]]), ranked("A"), 5);
    expect(normal.correctlyEmpty).toBeUndefined();
  });
});

describe("summarise", () => {
  it("macro-averages per class so a regression can be localised", () => {
    const scores = [
      scoreQuery("f1", "definitional", label([["A", 2]]), ranked("A"), 5),
      scoreQuery("f2", "definitional", label([["B", 2]]), ranked("X"), 5),
      scoreQuery("f3", "deep-in-manual", label([["C", 2]]), ranked("C"), 5),
    ];
    const summary = summarise("local-vector", 5, scores);

    expect(summary.queries).toBe(3);
    expect(summary.perClass.definitional.queries).toBe(2);
    expect(summary.perClass.definitional.recall).toBe(0.5);
    expect(summary.perClass["deep-in-manual"].recall).toBe(1);
    // Overall recall is the mean across queries: (1 + 0 + 1)/3
    expect(summary.recall).toBeCloseTo(2 / 3, 10);
  });
});
