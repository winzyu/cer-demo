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
import { normalizeForMatch } from "../gates/normalize";
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
  /**
   * The packet this row was graded from. Carried per row rather than derived from the pass,
   * because a sample can span several rounds and **labels mean different things in each** — a
   * two-arm top-up's `A` is not the base packet's `A`. It is also what the staleness check needs
   * in order to read back the answer the human actually saw.
   */
  packetDir: string;
}

/**
 * Every graded sheet for a pass: the original packet, plus any top-up round.
 *
 * **Rounds exist because a sample is not built once.** An arm gets re-captured and its rows go
 * stale; an arm is added and has no rows at all. Re-grading everything to fix either would throw
 * away good human judgement, and rebuilding the original packet in place re-labels answers that
 * grades were already written against — the failure `gradePacket.ts` guards against. So a round is
 * a separate packet under `rounds/<name>/`, with its own labels and its own key, and this function
 * is the only place that knows they compose.
 */
export const gradingSets = (
  gradingRoot: string,
  pass: string,
): { scoresPath: string; keyPath: string; packetDir: string }[] => {
  const roots = [path.join(gradingRoot, pass)];

  const roundsDir = path.join(gradingRoot, "rounds");
  if (fs.existsSync(roundsDir)) {
    fs.readdirSync(roundsDir)
      .sort()
      .map((name) => path.join(roundsDir, name, pass))
      .filter((dir) => fs.existsSync(dir))
      .forEach((dir) => roots.push(dir));
  }

  return roots
    .map((root) => ({
      scoresPath: path.join(root, "scores.csv"),
      keyPath: path.join(root, "KEY.json"),
      packetDir: path.join(root, "packet"),
    }))
    .filter((set) => fs.existsSync(set.scoresPath) && fs.existsSync(set.keyPath));
};

/**
 * Reads the graded rows out of a `scores.csv`, resolving each label to its arm.
 *
 * Only rows with at least one filled score are returned — a blank row is an ungraded row, not a
 * zero, and counting it as agreement would manufacture the number this module exists to report.
 */
export const readHumanRows = (
  scoresPath: string,
  keyPath: string,
  packetDir = path.join(path.dirname(scoresPath), "packet"),
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
        packetDir,
      };
    })
    .filter((row) => row.correctness !== undefined
      || row.ungrounded !== undefined
      || row.citations !== undefined);
};

/**
 * One human row whose answer no longer exists.
 *
 * **A grading packet is pinned to the transcripts it was built from, and nothing used to enforce
 * that.** `firestore-vector` was re-captured 2026-08-26, after a human had graded it; 12 of the
 * 36 rows in `scores.csv` then described answers that had been replaced. The join below is on
 * `(fixture, turn, arm)`, which all three still matched, so the comparison silently scored the
 * judge's verdict on a *new* answer against a human's verdict on an *old* one.
 *
 * It is not a small effect and it is not self-announcing. Measured over the full 36 rows, the
 * 2026-08-26 refusal-rubric fix looked like a regression — correctness kappa 0.87 → 0.83. Over
 * the 24 rows where both sides had seen the same text, the same change read 0.81 → **0.94**. The
 * stale rows inverted the sign, and the wrong version was written into a report before this check
 * existed (`RETRIEVAL_COMPARISON.md` §6.4a).
 */
export interface StaleRow {
  fixtureId: string;
  turn: number;
  label: string;
  arm: string;
  /** First point of divergence, trimmed — enough to see *that* it is a different answer. */
  gradedExcerpt: string;
  currentExcerpt: string;
}

const ANSWER_HEADING = /^### Answer (\S+)\s*$/;
const TURN_HEADING = /^## Turn (\d+)\s*$/;

/**
 * The answers a human actually read, keyed `<turn>|<label>` with 1-based turns.
 *
 * Parses the packet markdown rather than re-deriving from transcripts, because the packet **is**
 * the artifact the human graded — re-deriving would compare the transcripts to themselves and
 * never detect anything. `gradePacket.ts` writes the answer verbatim between the `### Answer X`
 * heading and the `<sub>Context supplied:` footer, so that is the extent taken here.
 */
export const readPacketAnswers = (sheet: string): Map<string, string> => {
  const answers = new Map<string, string>();
  let turn = 0;
  let label: string | undefined;
  let buffer: string[] = [];

  const flush = (): void => {
    if (label !== undefined && turn > 0) {
      answers.set(`${turn}|${label}`, buffer.join("\n").trim());
    }
    label = undefined;
    buffer = [];
  };

  sheet.split("\n").forEach((line) => {
    const turnMatch = TURN_HEADING.exec(line);
    if (turnMatch) {
      flush();
      turn = Number(turnMatch[1]);
      return;
    }
    const answerMatch = ANSWER_HEADING.exec(line);
    if (answerMatch) {
      flush();
      [, label] = answerMatch;
      return;
    }
    // The context dump that follows an answer opens with this footer; everything after it belongs
    // to the chunks, not to the answer.
    if (label !== undefined && line.startsWith("<sub>Context supplied:")) {
      flush();
      return;
    }
    if (label !== undefined) {
      buffer.push(line);
    }
  });
  flush();

  return answers;
};

/** Where the two sides first diverge, so a report can show it rather than assert it. */
const excerptAround = (text: string, other: string): string => {
  let at = 0;
  while (at < text.length && at < other.length && text[at] === other[at]) {
    at += 1;
  }
  const from = Math.max(0, at - 20);
  return `${from > 0 ? "…" : ""}${text.slice(from, from + 90).replace(/\s+/g, " ")}`;
};

/**
 * Human rows whose graded answer no longer matches the transcript on disk.
 *
 * Compared through `normalizeForMatch` for the same reason the refusal gate uses it: the captured
 * text carries typographic dashes and non-breaking spaces that survive a round trip differently,
 * and flagging a row as stale over a U+2011 would be worse than not checking at all.
 *
 * Rows whose packet sheet or transcript is missing are **not** flagged — absence is not
 * divergence, and `unmatched` already counts the rows the judge has no verdict for.
 */
export const findStaleRows = (
  rows: HumanRow[],
  pass: string,
  transcriptRoot: string,
): StaleRow[] => {
  const sheets = new Map<string, Map<string, string>>();
  const packetAnswers = (packetDir: string, fixtureId: string): Map<string, string> => {
    const file = path.join(packetDir, `${fixtureId}.md`);
    const cached = sheets.get(file);
    if (cached) {
      return cached;
    }
    const parsed = fs.existsSync(file)
      ? readPacketAnswers(fs.readFileSync(file, "utf8"))
      : new Map<string, string>();
    sheets.set(file, parsed);
    return parsed;
  };

  const transcripts = new Map<string, string | undefined>();
  const currentAnswer = (arm: string, fixtureId: string, turn: number): string | undefined => {
    const cacheKey = `${arm}|${fixtureId}|${turn}`;
    if (transcripts.has(cacheKey)) {
      return transcripts.get(cacheKey);
    }
    const file = path.join(transcriptRoot, pass, arm, `${fixtureId}.json`);
    let answer: string | undefined;
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
        turns?: { index: number; answer?: string }[];
      };
      // scores.csv and the packet number turns from 1; a transcript indexes them from 0.
      answer = parsed.turns?.find((t) => t.index === turn - 1)?.answer;
    }
    transcripts.set(cacheKey, answer);
    return answer;
  };

  const stale: StaleRow[] = [];
  rows.forEach((row) => {
    const graded = packetAnswers(row.packetDir, row.fixtureId).get(`${row.turn}|${row.label}`);
    const current = currentAnswer(row.arm, row.fixtureId, row.turn);
    if (!graded || !current) {
      return;
    }
    if (normalizeForMatch(graded) === normalizeForMatch(current)) {
      return;
    }
    stale.push({
      fixtureId: row.fixtureId,
      turn: row.turn,
      label: row.label,
      arm: row.arm,
      gradedExcerpt: excerptAround(graded, current),
      currentExcerpt: excerptAround(current, graded),
    });
  });

  return stale;
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
  /** Every graded sheet that contributed rows — the base packet plus any top-up round. */
  scoresPaths: string[];
  humanRows: number;
  /** Rows the human graded that the judge has no verdict for — the pass is incomplete. */
  unmatched: number;
  /**
   * Rows excluded because the arm was re-captured after grading, so the two sides scored
   * different text. **Excluded, not merely reported** — see `StaleRow`. A number computed over
   * them is not an agreement rate, and leaving them in once inverted the sign of a result.
   */
  stale: StaleRow[];
  dimensions: DimensionAgreement[];
}

export const calibrate = (
  pass: string,
  judged: JudgeRecord[],
  gradingRoot = path.join(process.cwd(), "eval", "grading"),
  transcriptRoot = path.join(process.cwd(), "eval", "transcripts"),
): CalibrationReport => {
  const sets = gradingSets(gradingRoot, pass);
  if (sets.length === 0) {
    throw new Error(
      `No graded sample at ${path.relative(process.cwd(), path.join(gradingRoot, pass))}.`,
    );
  }

  // A later round supersedes an earlier one for the same (arm, fixture, turn): that is what a
  // re-grade *is*. Keyed without the label on purpose — the label is a property of the packet,
  // not of the answer, and the whole reason a round exists is that the labels moved.
  const merged = new Map<string, HumanRow>();
  sets.forEach((set) => {
    readHumanRows(set.scoresPath, set.keyPath, set.packetDir).forEach((row) => {
      merged.set(`${row.arm}|${row.fixtureId}|${row.turn}`, row);
    });
  });
  const human = [...merged.values()];
  const judgedKeys = new Set(judged.map((r) => `${r.arm}|${r.fixtureId}|${r.turn}`));

  const stale = findStaleRows(human, pass, transcriptRoot);
  const staleKeys = new Set(stale.map((row) => `${row.arm}|${row.fixtureId}|${row.turn}`));
  const comparable = human.filter(
    (row) => !staleKeys.has(`${row.arm}|${row.fixtureId}|${row.turn}`),
  );

  return {
    scoresPaths: sets.map((set) => set.scoresPath),
    humanRows: human.length,
    unmatched: comparable.filter(
      (row) => !judgedKeys.has(`${row.arm}|${row.fixtureId}|${row.turn}`),
    ).length,
    stale,
    dimensions: (["correctness", "ungrounded", "citations"] as JudgeDimension[])
      .map((dimension) => agreementFor(dimension, comparable, judged)),
  };
};
