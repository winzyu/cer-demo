/**
 * Judge-vs-human agreement on the calibration sample.
 *
 * `RETRIEVAL_BAKEOFF.md` §7b: *"Calibrate against a human on ~20% of transcripts and report the
 * agreement rate. If agreement is poor, fix the rubric — do not quietly keep the judge's
 * scores."* This module computes that number. It does not decide anything; it exists so the
 * quality claim in §10.6 is falsifiable, and so a judge that disagrees with people is caught
 * before its scores are used to close ◆G7.
 *
 * The sample is the 36 rows already in `eval/grading/warm/scores.csv` — six fixtures, two turns,
 * three arms, graded by a human against `GRADING_GUIDE.md` with the arms blinded. Blind on both
 * sides and independently collected, which is what makes the comparison worth anything.
 *
 * **The join goes through `KEY.json`, and it has to.** The human scored labels (`A`/`B`/`C`);
 * the judge scores arms. The key is the only record of which was which for that packet build,
 * and it is specific to the arm set that built it — which is why `gradePacket.ts` now refuses to
 * overwrite a graded sheet.
 *
 * **One known divergence, reported rather than corrected.** The human was told to count an
 * ungrounded claim against `context/<fixture>/turn<N>-<LABEL>.txt` — retrieval context only —
 * and at least one committed note counts the operator normal ranges as unsupported for exactly
 * that reason. The judge is given the system prompt as grounding too, because §8b established
 * that treating retrieval context as the whole grounding produces ~24 false accusations per arm.
 * So a residual disagreement on operator-range figures is the human rubric being narrower, not
 * the judge inventing latitude. It is surfaced in the disagreement list, not smoothed away.
 */
import fs from "fs";
import path from "path";
import type { JudgeDimension } from "./prompts";
import type { JudgeRecord } from "./runner";

/** Which CSV column each judged dimension is compared against. */
const HUMAN_COLUMN: Record<JudgeDimension, number> = {
  correctness: 4,
  ungrounded: 5,
  citations: 6,
};

export interface HumanRow {
  fixtureId: string;
  fixtureClass: string;
  turn: number;
  label: string;
  arm: string;
  correctness?: number;
  ungrounded?: number;
  citations?: number;
  notes: string;
}

/**
 * Reads the graded rows out of a `scores.csv`, resolving each label to its arm.
 *
 * Only rows with at least one filled score are returned — a blank row is an ungraded row, not a
 * zero, and counting it as agreement would manufacture the number this module exists to report.
 */
export const readHumanRows = (
  scoresPath: string,
  keyPath: string,
): HumanRow[] => {
  const { key } = JSON.parse(fs.readFileSync(keyPath, "utf8")) as {
    key: Record<string, Record<string, string>>;
  };

  const cell = (value: string | undefined): number | undefined => {
    const trimmed = (value ?? "").trim();
    return trimmed === "" ? undefined : Number(trimmed);
  };

  return fs.readFileSync(scoresPath, "utf8")
    .split("\n")
    .slice(1)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      // Notes may contain commas; everything after the seventh field is note text.
      const fields = line.split(",");
      const [fixtureId, fixtureClass, turn, label] = fields;
      return {
        fixtureId,
        fixtureClass,
        turn: Number(turn),
        label,
        arm: key[fixtureId]?.[label] ?? "",
        correctness: cell(fields[HUMAN_COLUMN.correctness]),
        ungrounded: cell(fields[HUMAN_COLUMN.ungrounded]),
        citations: cell(fields[HUMAN_COLUMN.citations]),
        notes: fields.slice(7).join(",").trim(),
      };
    })
    .filter((row) => row.correctness !== undefined
      || row.ungrounded !== undefined
      || row.citations !== undefined);
};

export interface Disagreement {
  fixtureId: string;
  turn: number;
  arm: string;
  human: number;
  judge: number;
  judgeNote: string;
  humanNote: string;
}

export interface DimensionAgreement {
  dimension: JudgeDimension;
  pairs: number;
  /** Both sides gave the same value. */
  exact: number;
  /** Within one point — the honest number for an ordinal 0/1/2 scale. */
  within1: number;
  /**
   * Both sides agree on "any / none", which is what the ungrounded gate actually turns on:
   * §8a thresholds the *share of turns carrying a claim*, not the claim count.
   */
  binary: number;
  /** Cohen's kappa. Chance-corrected, so a dimension where everyone scores 0 cannot look good. */
  kappa: number;
  meanAbsoluteDifference: number;
  disagreements: Disagreement[];
}

/**
 * Cohen's kappa over whatever integer categories the two raters actually used.
 *
 * Reported alongside raw agreement because raw agreement is inflated wherever one value
 * dominates — `invalid_citations` is 0 in 33 of the human's 36 rows, so a judge that answered
 * "0" unconditionally would score 92% agreement and be worthless. Kappa says so; percentage
 * agreement does not.
 *
 * Returns 1 for perfect agreement even when both raters were constant, where the standard
 * formula divides by zero: two raters who never disagreed have not disagreed.
 */
export const cohensKappa = (pairs: [number, number][]): number => {
  if (pairs.length === 0) {
    return 0;
  }
  const categories = [...new Set(pairs.flat())];
  const observed = pairs.filter(([a, b]) => a === b).length / pairs.length;

  const share = (index: 0 | 1, category: number): number => (
    pairs.filter((pair) => pair[index] === category).length / pairs.length
  );
  const expected = categories.reduce(
    (sum, category) => sum + share(0, category) * share(1, category),
    0,
  );

  if (expected === 1) {
    return observed === 1 ? 1 : 0;
  }
  return (observed - expected) / (1 - expected);
};

export const agreementFor = (
  dimension: JudgeDimension,
  human: HumanRow[],
  judged: JudgeRecord[],
): DimensionAgreement => {
  const byKey = new Map(
    judged
      .filter((record) => record.dimension === dimension)
      .map((record) => [`${record.arm}|${record.fixtureId}|${record.turn}`, record]),
  );

  const column: Record<JudgeDimension, keyof HumanRow> = {
    correctness: "correctness", ungrounded: "ungrounded", citations: "citations",
  };
  const humanValue = (row: HumanRow): number | undefined => (
    row[column[dimension]] as number | undefined
  );

  const pairs: [number, number][] = [];
  const disagreements: Disagreement[] = [];

  human.forEach((row) => {
    const value = humanValue(row);
    const record = byKey.get(`${row.arm}|${row.fixtureId}|${row.turn}`);
    if (value === undefined || record === undefined) {
      return;
    }
    // A citations call is skipped entirely when the answer cited nothing, so a missing record
    // there means "no markers", which is the same claim as the human's 0 — not a gap.
    const judgeValue = dimension === "correctness" ? (record.score ?? 0) : (record.count ?? 0);
    pairs.push([value, judgeValue]);
    if (value !== judgeValue) {
      disagreements.push({
        fixtureId: row.fixtureId,
        turn: row.turn,
        arm: row.arm,
        human: value,
        judge: judgeValue,
        judgeNote: record.note,
        humanNote: row.notes,
      });
    }
  });

  const rate = (predicate: (pair: [number, number]) => boolean): number => (
    pairs.length === 0 ? 0 : pairs.filter(predicate).length / pairs.length
  );

  return {
    dimension,
    pairs: pairs.length,
    exact: rate(([a, b]) => a === b),
    within1: rate(([a, b]) => Math.abs(a - b) <= 1),
    binary: rate(([a, b]) => (a > 0) === (b > 0)),
    kappa: cohensKappa(pairs),
    meanAbsoluteDifference: pairs.length === 0
      ? 0
      : pairs.reduce((sum, [a, b]) => sum + Math.abs(a - b), 0) / pairs.length,
    disagreements,
  };
};

export interface CalibrationReport {
  scoresPath: string;
  humanRows: number;
  /** Rows the human graded that the judge has no verdict for — the pass is incomplete. */
  unmatched: number;
  dimensions: DimensionAgreement[];
}

export const calibrate = (
  pass: string,
  judged: JudgeRecord[],
  gradingRoot = path.join(process.cwd(), "eval", "grading"),
): CalibrationReport => {
  const scoresPath = path.join(gradingRoot, pass, "scores.csv");
  const keyPath = path.join(gradingRoot, pass, "KEY.json");
  if (!fs.existsSync(scoresPath) || !fs.existsSync(keyPath)) {
    throw new Error(`No graded sample at ${path.relative(process.cwd(), scoresPath)}.`);
  }

  const human = readHumanRows(scoresPath, keyPath);
  const judgedKeys = new Set(judged.map((r) => `${r.arm}|${r.fixtureId}|${r.turn}`));

  return {
    scoresPath,
    humanRows: human.length,
    unmatched: human.filter((row) => !judgedKeys.has(`${row.arm}|${row.fixtureId}|${row.turn}`))
      .length,
    dimensions: (["correctness", "ungrounded", "citations"] as JudgeDimension[])
      .map((dimension) => agreementFor(dimension, human, judged)),
  };
};
