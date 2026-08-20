import { __testing } from "../../scripts/gradePacket";
import { loadFixtures } from "../../src/eval/fixtures";

const { shuffleFor } = __testing;
const ARMS = ["firestore-direct", "pgvector-rag", "firestore-vector"];

describe("blind grading packet — label assignment", () => {
  const fixtureIds = loadFixtures().filter((f) => f.runnable).map((f) => f.id);

  it("assigns every arm exactly once per fixture", () => {
    fixtureIds.forEach((id) => {
      expect([...shuffleFor(id)].sort()).toEqual([...ARMS].sort());
    });
  });

  it("is deterministic, so a rebuild cannot move labels under a part-done judge", () => {
    fixtureIds.forEach((id) => {
      expect(shuffleFor(id)).toEqual(shuffleFor(id));
    });
  });

  it("does not give the same arm the same label across fixtures", () => {
    // The regression this exists for: the original `seed*31` + LCG shuffle put pgvector-rag at
    // label A in 22 of 28 sheets and firestore-direct at A in none. Each sheet looked shuffled;
    // the SET leaked the mapping, so a judge would learn "A is the one that refuses" and the
    // blinding — the whole basis of §7b — would be void with nothing visibly wrong.
    const counts: Record<string, Record<string, number>> = {};
    ARMS.forEach((arm) => { counts[arm] = { A: 0, B: 0, C: 0 }; });

    fixtureIds.forEach((id) => {
      shuffleFor(id).forEach((arm, i) => {
        counts[arm][["A", "B", "C"][i]] += 1;
      });
    });

    const expected = fixtureIds.length / 3;
    ARMS.forEach((arm) => {
      (["A", "B", "C"] as const).forEach((label) => {
        // Generous bound — this is catching a broken shuffle, not testing for uniformity.
        expect(counts[arm][label]).toBeGreaterThan(expected * 0.4);
        expect(counts[arm][label]).toBeLessThan(expected * 1.8);
      });
    });
  });

  it("gives different fixtures different orders", () => {
    const orders = new Set(fixtureIds.map((id) => shuffleFor(id).join(",")));
    // 3 arms => 6 possible permutations; a shuffle collapsing to one or two is broken.
    expect(orders.size).toBeGreaterThanOrEqual(4);
  });
});
