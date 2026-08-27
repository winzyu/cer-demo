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
    //
    // Measured as chi-square over the whole arm x label table rather than a bound on each cell.
    // A per-cell bound has to be re-tuned every time an arm is added: with 3 arms each cell
    // expects 9.3 draws, with 5 it expects 6.0, and ordinary +/-2 sd lumpiness trips a fixed
    // multiplier at the smaller count. Chi-square pools the evidence and scales on its own.
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
    const chi2 = ARMS.reduce((sum, arm) => sum + labels.reduce(
      (rowSum, label) => rowSum + ((counts[arm][label] - expected) ** 2) / expected,
      0,
    ), 0);
    const df = (ARMS.length - 1) ** 2;

    // Generous: this is a leak detector, not a uniformity test, and it must not go flaky as arms
    // come and go. Measured 1.94 on the current 5-arm set; the shuffle it exists to catch scores
    // 10.39 on the 3-arm table above.
    expect(chi2 / df).toBeLessThan(3);

    // And the blunt version of the same question, which the original bug fails outright: no arm
    // may sit at one label for anything close to half the sheets.
    ARMS.forEach((arm) => {
      labels.forEach((label) => {
        expect(counts[arm][label]).toBeLessThan(fixtureIds.length / 2);
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
