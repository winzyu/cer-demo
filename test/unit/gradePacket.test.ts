import fs from "fs";
import path from "path";
import { __testing } from "../../scripts/gradePacket";
import { loadFixtures } from "../../src/eval/fixtures";

const {
  shuffleFor, labelsFor, hasFilledScores,
} = __testing;

/**
 * The arms actually on disk, which is what the script now grades.
 *
 * Read here too, rather than repeating a literal: a hard-coded list in the test would pass while
 * the script silently dropped a captured arm, which is the exact bug this file is meant to catch.
 */
const ARMS = fs
  .readdirSync(path.join(process.cwd(), "eval", "transcripts", "warm"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("blind grading packet — arm discovery", () => {
  it("finds every captured arm, not a hard-coded three", () => {
    expect(ARMS.length).toBeGreaterThanOrEqual(3);
    expect(ARMS).toContain("hybrid-slice-lexvec");
  });

  it("issues one label per arm", () => {
    expect(labelsFor(3)).toEqual(["A", "B", "C"]);
    expect(labelsFor(ARMS.length)).toHaveLength(ARMS.length);
  });
});

describe("blind grading packet — label assignment", () => {
  const fixtureIds = loadFixtures().filter((f) => f.runnable).map((f) => f.id);

  it("assigns every arm exactly once per fixture", () => {
    fixtureIds.forEach((id) => {
      expect([...shuffleFor(id, ARMS)].sort()).toEqual([...ARMS].sort());
    });
  });

  it("is deterministic, so a rebuild cannot move labels under a part-done judge", () => {
    fixtureIds.forEach((id) => {
      expect(shuffleFor(id, ARMS)).toEqual(shuffleFor(id, ARMS));
    });
  });

  it("does not give the same arm the same label across fixtures", () => {
    // The regression this exists for: the original `seed*31` + LCG shuffle put pgvector-rag at
    // label A in 22 of 28 sheets and firestore-direct at A in none. Each sheet looked shuffled;
    // the SET leaked the mapping, so a judge would learn "A is the one that refuses" and the
    // blinding — the whole basis of §7b — would be void with nothing visibly wrong.
    const labels = labelsFor(ARMS.length);
    const counts: Record<string, Record<string, number>> = {};
    ARMS.forEach((arm) => {
      counts[arm] = Object.fromEntries(labels.map((l) => [l, 0]));
    });

    fixtureIds.forEach((id) => {
      shuffleFor(id, ARMS).forEach((arm, i) => {
        counts[arm][labels[i]] += 1;
      });
    });

    const expected = fixtureIds.length / ARMS.length;
    ARMS.forEach((arm) => {
      labels.forEach((label) => {
        // Generous bound — this is catching a broken shuffle, not testing for uniformity.
        expect(counts[arm][label]).toBeGreaterThan(expected * 0.4);
        expect(counts[arm][label]).toBeLessThan(expected * 1.8);
      });
    });
  });

  it("gives different fixtures different orders", () => {
    const orders = new Set(fixtureIds.map((id) => shuffleFor(id, ARMS).join(",")));
    // 3 arms => 6 permutations; a shuffle collapsing to one or two is broken.
    expect(orders.size).toBeGreaterThanOrEqual(4);
  });
});

/**
 * The guard that exists because this script destroyed 36 completed grading rows once.
 *
 * `npm run grade:packet` rewrote `scores.csv` unconditionally, and a rebuild with a different arm
 * set also re-labels every answer — so the loss is not recoverable by re-pasting the old numbers.
 */
describe("blind grading packet — overwrite guard", () => {
  const header = "fixture,class,turn,label,correctness_0_1_2,ungrounded_claims,invalid_citations,notes";

  it("treats a freshly built, unfilled sheet as safe to overwrite", () => {
    expect(hasFilledScores(`${header}\nacronym-ntu-fnu,acronym-exact-token,1,A,,,,\n`)).toBe(false);
  });

  it("treats a missing sheet as safe to overwrite", () => {
    expect(hasFilledScores("")).toBe(false);
  });

  it("blocks on any filled score cell, including a zero", () => {
    expect(hasFilledScores(`${header}\nx,y,1,A,0,,,\n`)).toBe(true);
    expect(hasFilledScores(`${header}\nx,y,1,A,,2,,\n`)).toBe(true);
    expect(hasFilledScores(`${header}\nx,y,1,A,,,1,\n`)).toBe(true);
  });

  it("does not block on a note alone — a note without a score is not a grade", () => {
    expect(hasFilledScores(`${header}\nx,y,1,A,,,,refused; looked right\n`)).toBe(false);
  });

  it("blocks on the real committed sheet, which holds the 36-row calibration sample", () => {
    const csv = fs.readFileSync("eval/grading/warm/scores.csv", "utf8");
    expect(hasFilledScores(csv)).toBe(true);
  });
});
