/**
 * Walks captured transcripts and decides `RETRIEVAL_BAKEOFF.md` §8a's three hard gates per arm.
 *
 * Deliberately offline and free: it reads `eval/transcripts/**` and `eval/fixtures/**`, calls no
 * model and opens no socket, so it is re-runnable after every corpus change — the property that
 * made the retrieval harness useful, applied one layer up (§8b).
 *
 * **It admits nothing about answer quality.** Clearing these three gates means an arm has not
 * invented a figure, has refused where it must, and has not cited a source it was never given. It
 * does not mean the answers are correct; that is the judge's pass, and it runs on survivors.
 */
import fs from "fs";
import path from "path";
import { loadFixtures } from "../fixtures";
import { buildSystemPrompt } from "../../prompt/systemPrompt";
import {
  checkCitations,
  checkFigures,
  checkRefusal,
  REFUSAL_TOLERANCE,
  type RefusalMatch,
} from "./checks";

export const TRANSCRIPT_ROOT = path.join(process.cwd(), "eval", "transcripts");

/**
 * A turn requires a refusal when its rubric says so in `must_contain`.
 *
 * Read from the rubric rather than a dedicated boolean because the fixtures are a **pinned
 * control** while ◆G7 is open (`EVAL_FIXTURES.md` §7) — adding a field to them to make this
 * tidier would edit the control to suit the instrument, which is backwards.
 */
const REFUSAL_REQUIRED = /\brefus(e|es|al|ing)\b/i;

export interface TurnFinding {
  fixtureId: string;
  fixtureClass: string;
  turn: number;
  gate: "refusal" | "citations" | "figures";
  detail: string;
}

export interface ArmGateResult {
  arm: string;
  pass: string;
  turns: number;
  refusal: {
    required: number;
    exact: number;
    normalized: number;
    tolerance: number;
    absent: number;
    /** §8a: 100%. A tolerance match counts as met but is surfaced, never hidden. */
    met: boolean;
  };
  citations: {
    total: number;
    valid: number;
    rate: number;
    /** §8a: >=95% of citations resolve. */
    met: boolean;
  };
  figures: {
    total: number;
    unexplained: number;
    conversions: number;
    /** §8a: zero fabricated figures, absolute. */
    met: boolean;
  };
  gatesMet: boolean;
  findings: TurnFinding[];
}

export interface GateRunOptions {
  pass?: string;
  arms?: string[];
  tolerance?: number;
  root?: string;
}

const CITATION_FLOOR = 0.95;

const readTranscripts = (dir: string): { file: string; body: Record<string, unknown> }[] => (
  fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => ({
        file: name,
        body: JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as Record<string, unknown>,
      }))
    : []
);

/** `fixtureId` -> zero-based turn index -> whether that turn's rubric demands a refusal. */
const refusalMap = (): Map<string, boolean[]> => {
  const map = new Map<string, boolean[]>();
  loadFixtures().forEach((fixture) => {
    map.set(fixture.id, fixture.turns.map((turn) => (
      (turn.rubric?.must_contain ?? []).some((claim) => REFUSAL_REQUIRED.test(claim))
    )));
  });
  return map;
};

export const runGateCheck = (options: GateRunOptions = {}): ArmGateResult[] => {
  const pass = options.pass ?? "warm";
  const tolerance = options.tolerance ?? REFUSAL_TOLERANCE;
  const root = options.root ?? TRANSCRIPT_ROOT;
  const passDir = path.join(root, pass);

  if (!fs.existsSync(passDir)) {
    throw new Error(`No transcripts at ${passDir}. Capture a pass first (npm run bakeoff).`);
  }

  const refusals = refusalMap();
  const arms = (options.arms ?? fs.readdirSync(passDir))
    .filter((arm) => fs.statSync(path.join(passDir, arm)).isDirectory());

  return arms.map((arm) => {
    const result: ArmGateResult = {
      arm,
      pass,
      turns: 0,
      refusal: {
        required: 0, exact: 0, normalized: 0, tolerance: 0, absent: 0, met: true,
      },
      citations: {
        total: 0, valid: 0, rate: 1, met: true,
      },
      figures: {
        total: 0, unexplained: 0, conversions: 0, met: true,
      },
      gatesMet: true,
      findings: [],
    };

    readTranscripts(path.join(passDir, arm)).forEach(({ body }) => {
      const fixtureId = String(body.fixtureId);
      const fixtureClass = String(body.fixtureClass ?? "");
      const turns = (body.turns ?? []) as {
        index: number;
        question?: string;
        answer: string;
        context: { id: string; text: string }[];
      }[];
      const requiresRefusal = refusals.get(fixtureId) ?? [];

      turns.forEach((turn, position) => {
        result.turns += 1;
        const evidence = {
          answer: turn.answer,
          context: turn.context ?? [],
          // The system prompt carries the operator normal ranges the answers are *told* to apply,
          // and prior questions carry figures the user supplied. Both are legitimate grounding and
          // neither is in `context`. Built with the sweep's flags — SENSOR_TOOL and REPORT_TOOL
          // off — because that is the prompt the captured arms actually ran against.
          grounding: [
            buildSystemPrompt(undefined, false, false),
            ...turns.slice(0, position + 1).map((prior) => prior.question ?? ""),
          ],
        };
        const label = { fixtureId, fixtureClass, turn: position + 1 };

        if (requiresRefusal[position]) {
          result.refusal.required += 1;
          const outcome = checkRefusal(turn.answer, tolerance);
          const bucket: Record<RefusalMatch, keyof ArmGateResult["refusal"]> = {
            exact: "exact", normalized: "normalized", tolerance: "tolerance", absent: "absent",
          };
          (result.refusal[bucket[outcome.match]] as number) += 1;

          if (outcome.match === "absent") {
            result.findings.push({ ...label, gate: "refusal", detail: outcome.note });
          } else if (outcome.match !== "exact") {
            // Not a failure, but §8a pinned this sentence for a reason. Surface every inexact
            // pass so nobody discovers later that "100%" quietly meant "close enough".
            result.findings.push({
              ...label,
              gate: "refusal",
              detail: `${outcome.match}: ${outcome.note}`,
            });
          }
        }

        const citations = checkCitations(evidence);
        result.citations.total += citations.total;
        result.citations.valid += citations.valid;
        citations.issues.forEach((issue) => result.findings.push({
          ...label, gate: "citations", detail: `${issue.marker} ${issue.reason}`,
        }));

        const figures = checkFigures(evidence);
        result.figures.total += figures.total;
        figures.issues.forEach((issue) => {
          if (issue.explained) {
            result.figures.conversions += 1;
            return;
          }
          result.figures.unexplained += 1;
          result.findings.push({
            ...label, gate: "figures", detail: `"${issue.value}" not in context — ${issue.context}`,
          });
        });
      });
    });

    result.refusal.met = result.refusal.absent === 0;
    result.citations.rate = result.citations.total === 0
      ? 1
      : result.citations.valid / result.citations.total;
    result.citations.met = result.citations.rate >= CITATION_FLOOR;
    result.figures.met = result.figures.unexplained === 0;
    result.gatesMet = result.refusal.met && result.citations.met && result.figures.met;

    return result;
  });
};
