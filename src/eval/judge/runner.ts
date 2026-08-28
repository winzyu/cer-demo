/**
 * Walks captured transcripts and drives an LLM judge over §8b's two Tier-2 gates.
 *
 * The counterpart to `src/eval/gates/` one layer up: same shape, opposite economics. The gate
 * checker is deterministic, free and re-runnable after every corpus change; this one calls a
 * model, costs money per turn, and therefore runs **only on Tier-1 survivors** and writes every
 * verdict to disk as it arrives so an interrupted pass is resumed rather than repaid.
 *
 * What it decides (`RETRIEVAL_BAKEOFF.md` §8a, unchanged by §8b):
 *
 * - **Correctness** — 0/1/2 per turn, mean >=1.0 in every servable class and >=1.3 overall.
 * - **Ungrounded claims** — <=2% of turns, i.e. at most one turn in 58 carrying any.
 *
 * And one it reports without gating: **citation support**, the judgement half §8b split out of
 * §8a's citation gate. Tier 1 owns the resolution half. Kept here because the human calibration
 * sample scored it, so dropping it would throw away a third of the agreement evidence.
 */
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { loadFixtures } from "../fixtures";
import { buildSystemPrompt } from "../../prompt/systemPrompt";
import { checkCitations } from "../gates/checks";
import { CHAT_PRICES } from "../prices";
import {
  JUDGE_DIMENSIONS,
  PROMPT_BUILDERS,
  parseVerdict,
  type JudgeDimension,
  type JudgeEvidence,
} from "./prompts";

export const TRANSCRIPT_ROOT = path.join(process.cwd(), "eval", "transcripts");

/**
 * Where paid verdicts live — under `data/results/`, which is **committed**, not under the ignored
 * part of `data/`.
 *
 * This ledger is the audit trail behind every quality number in `RETRIEVAL_COMPARISON.md` and it
 * cost real money to produce. While it sat under the blanket `data/*` ignore rule it was one
 * `rm -rf` from unreproducible, and §9's exit criteria — which say grades are committed —
 * disagreed with the repository. `data/results/` is the exception carved out for exactly this:
 * derived evaluation output that a reader must be able to check.
 *
 * **Nothing confidential goes here.** Sensor pulls and backend captures stay in the ignored
 * subtrees (`data/backend-surface/`, `data/device-fields/`), and the ignore rule is written to
 * keep it that way — an allow-list of one directory, not a deny-list of many.
 */
export const JUDGE_ROOT = path.join(process.cwd(), "data", "results", "judge");

/**
 * The default judge — chosen 2026-08-26, with a caveat that must survive into the report.
 *
 * §7b requires a different model than the one under test (`gpt-oss-20b`), because a model grading
 * its own output has a documented self-preference bias. `gpt-oss-120b` is a different model and
 * clears that rule as written. It does **not** clear the rule's intent: same family, same
 * training lineage, so some of the self-preference §7b is guarding against plausibly survives.
 *
 * It was picked anyway, deliberately, over a cross-family judge: it is the only non-under-test
 * chat model in `prices.ts` with a rate read on a known date (2026-08-03), and §10.4 requires
 * every price in the comparison report to carry the date it was read. A cross-family judge would
 * have meant an unverified model id and an invented rate — trading a stated, bounded bias for an
 * unstated one in the cost table.
 *
 * **This is a limitation of the quality claim, not a detail of the harness**, and belongs in
 * `RETRIEVAL_COMPARISON.md` §10.6 next to the agreement rate. `judgesOwnFamily` below makes the
 * run say so out loud rather than leaving it to whoever writes the report to remember.
 *
 * Override with `JUDGE_MODEL` or `--judge-model=`. Whatever is used ends up in the run manifest.
 */
export const DEFAULT_JUDGE_MODEL = "accounts/fireworks/models/gpt-oss-120b";

/**
 * Do these two ids look like the same model family?
 *
 * ponytail: the id's last path segment minus a trailing size/version suffix — `gpt-oss-120b` and
 * `gpt-oss-20b` both reduce to `gpt-oss`. It is a heuristic over a naming convention, not a fact
 * about lineage, and it is only ever used to print a caveat. Upgrade path if it ever gates
 * anything: a explicit family map in `prices.ts`, next to the rates.
 */
export const judgesOwnFamily = (judge: string, underTest: string): boolean => {
  const family = (id: string): string => (id.split("/").pop() ?? id)
    .replace(/-\d+[bm](-.*)?$/i, "")
    .toLowerCase();
  return family(judge) === family(underTest);
};

/**
 * Classes an arm is not judged on, per §8a's servable-set rule.
 *
 * Only direct-feed has one: it cannot reach material outside the ◆G9 slice, so its three
 * `deep-in-manual` fixtures are excluded from its correctness floor and counted as *coverage*
 * instead. The RAG and hybrid arms index the whole corpus and get no exemption — including
 * `hybrid-slice-lexvec`, whose slice is an addition to whole-corpus retrieval, not a limit on it.
 *
 * Keyed by class rather than derived from `sliceCoverage` on purpose: §8a names the class, and
 * `sliceCoverage` also reports `none` for `refusal-pathogens` (empty `answerable_from`), which is
 * fully servable — refusing is the correct answer there.
 */
export const NON_SERVABLE_CLASSES: Record<string, readonly string[]> = {
  "firestore-direct": ["deep-in-manual"],
};

/** §8a's Tier-2 thresholds, pre-registered 2026-07-30. Not tunable. */
export const CORRECTNESS_CLASS_FLOOR = 1.0;
export const CORRECTNESS_OVERALL_FLOOR = 1.3;
export const UNGROUNDED_TURN_CEILING = 0.02;

export interface JudgeTask {
  arm: string;
  fixtureId: string;
  fixtureClass: string;
  /** 1-based, matching the packet and `scores.csv`. */
  turn: number;
  dimension: JudgeDimension;
  evidence: JudgeEvidence;
}

export interface JudgeRecord {
  arm: string;
  fixtureId: string;
  fixtureClass: string;
  turn: number;
  dimension: JudgeDimension;
  score?: number;
  count?: number;
  items: { text: string; why: string }[];
  note: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  judgedAt: string;
}

export const recordKey = (
  task: { arm: string; fixtureId: string; turn: number; dimension: string },
): string => `${task.arm}|${task.fixtureId}|${task.turn}|${task.dimension}`;

interface CapturedTurn {
  index: number;
  question?: string;
  answer: string;
  context?: { id: string; text: string }[];
}

interface CapturedTranscript {
  fixtureId: string;
  fixtureClass?: string;
  run?: { model?: string };
  turns?: CapturedTurn[];
}

const readTranscripts = (dir: string): CapturedTranscript[] => (
  fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => JSON.parse(
        fs.readFileSync(path.join(dir, name), "utf8"),
      ) as CapturedTranscript)
    : []
);

export const armsOnDisk = (root: string, pass: string): string[] => {
  const dir = path.join(root, pass);
  if (!fs.existsSync(dir)) {
    throw new Error(`No transcripts at ${dir}. Capture a pass first (npm run bakeoff).`);
  }
  return fs.readdirSync(dir)
    .filter((name) => fs.statSync(path.join(dir, name)).isDirectory())
    .sort();
};

export interface BuildOptions {
  pass?: string;
  arms?: string[];
  /** Fixture ids to restrict to — the calibration subset, or a single fixture to re-judge. */
  only?: string[];
  dimensions?: JudgeDimension[];
  root?: string;
}

/**
 * Every judge call the requested pass implies, before any of them is made.
 *
 * Built as a list rather than streamed so `--dry-run` can price the pass without spending, and so
 * the resume filter is a set difference rather than control flow tangled into the request loop.
 */
export const buildTasks = (options: BuildOptions = {}): JudgeTask[] => {
  const pass = options.pass ?? "warm";
  const root = options.root ?? TRANSCRIPT_ROOT;
  const arms = options.arms ?? armsOnDisk(root, pass);
  const dimensions = options.dimensions ?? JUDGE_DIMENSIONS;

  // Built once with the sweep's flags — SENSOR_TOOL and REPORT_TOOL off — because that is the
  // prompt the captured arms actually ran under, and it is a pinned control while ◆G7 is open.
  const systemPrompt = buildSystemPrompt(undefined, false, false);

  const rubrics = new Map(loadFixtures().map((fixture) => [fixture.id, fixture]));
  const tasks: JudgeTask[] = [];

  arms.forEach((arm) => {
    readTranscripts(path.join(root, pass, arm)).forEach((transcript) => {
      const fixture = rubrics.get(transcript.fixtureId);
      if (!fixture || (options.only && !options.only.includes(transcript.fixtureId))) {
        return;
      }

      const turns = transcript.turns ?? [];
      turns.forEach((turn, position) => {
        const spec = fixture.turns[position];
        if (!spec) {
          return;
        }

        const evidence: JudgeEvidence = {
          question: turn.question ?? spec.content,
          answer: turn.answer,
          rubric: spec.rubric,
          context: turn.context ?? [],
          systemPrompt,
          history: turns.slice(0, position).map((prior, i) => ({
            question: prior.question ?? fixture.turns[i]?.content ?? "",
            answer: prior.answer,
          })),
        };

        dimensions.forEach((dimension) => {
          // Nothing to judge when nothing was cited. Skipping is not a shortcut: an empty
          // `invalid` list is the only verdict this call can return, and it is not free.
          if (dimension === "citations"
            && checkCitations({ answer: turn.answer, context: evidence.context }).total === 0) {
            return;
          }
          tasks.push({
            arm,
            fixtureId: transcript.fixtureId,
            fixtureClass: transcript.fixtureClass ?? fixture.class,
            turn: position + 1,
            dimension,
            evidence,
          });
        });
      });
    });
  });

  return tasks;
};

/** The model each arm's answers were generated by, so the judge can be checked against it. */
export const modelsUnderTest = (root: string, pass: string, arms: string[]): string[] => {
  const seen = new Set<string>();
  arms.forEach((arm) => readTranscripts(path.join(root, pass, arm)).forEach((transcript) => {
    if (transcript.run?.model) {
      seen.add(transcript.run.model);
    }
  }));
  return [...seen];
};

export interface JudgeClientOptions {
  model: string;
  maxTokens: number;
}

/**
 * One judge call, with a single retry that only ever fires on an unusable *reply*.
 *
 * The retry is narrow on purpose. A malformed reply is a paid call whose tokens are already spent
 * and whose information is recoverable by asking again with a sharper instruction, so retrying is
 * strictly cheaper than losing the turn. A transport failure is not retried here — that is the
 * caller's business and a silent retry loop on a metered API is how a bounded pass becomes an
 * unbounded bill.
 */
export const judgeOnce = async (
  client: OpenAI,
  options: JudgeClientOptions,
  task: JudgeTask,
): Promise<JudgeRecord> => {
  const prompt = PROMPT_BUILDERS[task.dimension](task.evidence);
  let promptTokens = 0;
  let completionTokens = 0;
  let lastError = "";

  // Two attempts, not a loop with a tunable bound: the second adds a JSON-only nudge and there
  // is nothing a third would say differently.
  const attempts = [prompt, `${prompt}\n\nYour previous reply was not valid JSON. Reply with the JSON object only.`];

  for (let attempt = 0; attempt < attempts.length; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await client.chat.completions.create({
      model: options.model,
      messages: [{ role: "user", content: attempts[attempt] }],
      max_tokens: options.maxTokens,
      // Pinned, like the sweep itself. A sampled judge measures the sampler.
      temperature: 0,
    });

    promptTokens += response.usage?.prompt_tokens ?? 0;
    completionTokens += response.usage?.completion_tokens ?? 0;

    try {
      const verdict = parseVerdict(task.dimension, response.choices[0]?.message?.content ?? "");
      return {
        arm: task.arm,
        fixtureId: task.fixtureId,
        fixtureClass: task.fixtureClass,
        turn: task.turn,
        dimension: task.dimension,
        score: verdict.score,
        count: task.dimension === "correctness" ? undefined : verdict.items.length,
        items: verdict.items,
        note: verdict.note,
        promptTokens,
        completionTokens,
        model: response.model ?? options.model,
        judgedAt: new Date().toISOString(),
      };
    } catch (error) {
      lastError = (error as Error).message;
    }
  }

  throw new Error(`${recordKey(task)}: ${lastError}`);
};

/** Verdicts already on disk for this pass, so a resumed run pays only for what is missing. */
export const readLedger = (pass: string, root = JUDGE_ROOT): Map<string, JudgeRecord> => {
  const file = path.join(root, `${pass}.jsonl`);
  if (!fs.existsSync(file)) {
    return new Map();
  }
  const records = fs.readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as JudgeRecord);
  // Later lines win, so re-judging a turn is an append rather than an edit.
  return new Map(records.map((record) => [recordKey(record), record]));
};

export const appendLedger = (pass: string, record: JudgeRecord, root = JUDGE_ROOT): void => {
  fs.mkdirSync(root, { recursive: true });
  fs.appendFileSync(path.join(root, `${pass}.jsonl`), `${JSON.stringify(record)}\n`, "utf8");
};

// ---------------------------------------------------------------------------------------------
// Aggregation — §8a's Tier-2 gates over the verdicts
// ---------------------------------------------------------------------------------------------

export interface ClassScore {
  class: string;
  turns: number;
  mean: number;
  /** False when this class is outside the arm's servable set, in which case `met` is not read. */
  servable: boolean;
  met: boolean;
}

export interface ArmJudgeResult {
  arm: string;
  pass: string;
  turnsJudged: number;
  correctness: {
    perClass: ClassScore[];
    /** Mean over the servable set only, per §8a. */
    overall: number;
    /** Share of the 28 runnable fixtures in this arm's servable set. */
    coverage: number;
    met: boolean;
  };
  ungrounded: {
    turnsWithClaims: number;
    turns: number;
    rate: number;
    totalClaims: number;
    met: boolean;
  };
  /** Reported, not gated — Tier 1 owns the citation gate. */
  citationSupport: {
    turnsChecked: number;
    unsupported: number;
  };
  gatesMet: boolean;
  findings: { fixtureId: string; turn: number; dimension: JudgeDimension; detail: string }[];
}

const mean = (values: number[]): number => (
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length
);

export const isServable = (arm: string, fixtureClass: string): boolean => (
  !(NON_SERVABLE_CLASSES[arm] ?? []).includes(fixtureClass)
);

export const summarize = (
  records: JudgeRecord[],
  pass: string,
): ArmJudgeResult[] => {
  const runnableClasses = loadFixtures().filter((f) => f.runnable);
  const arms = [...new Set(records.map((r) => r.arm))].sort();

  return arms.map((arm) => {
    const mine = records.filter((r) => r.arm === arm);
    const correctness = mine.filter((r) => r.dimension === "correctness");
    const ungrounded = mine.filter((r) => r.dimension === "ungrounded");
    const citations = mine.filter((r) => r.dimension === "citations");

    const classes = [...new Set(correctness.map((r) => r.fixtureClass))].sort();
    const perClass: ClassScore[] = classes.map((fixtureClass) => {
      const scores = correctness
        .filter((r) => r.fixtureClass === fixtureClass)
        .map((r) => r.score ?? 0);
      const servable = isServable(arm, fixtureClass);
      const classMean = mean(scores);
      return {
        class: fixtureClass,
        turns: scores.length,
        mean: classMean,
        servable,
        met: !servable || classMean >= CORRECTNESS_CLASS_FLOOR,
      };
    });

    const servableScores = correctness
      .filter((r) => isServable(arm, r.fixtureClass))
      .map((r) => r.score ?? 0);
    const overall = mean(servableScores);

    const servableFixtures = runnableClasses.filter((f) => isServable(arm, f.class)).length;
    const coverage = runnableClasses.length === 0
      ? 0
      : servableFixtures / runnableClasses.length;

    const turnsWithClaims = ungrounded.filter((r) => (r.count ?? 0) > 0).length;
    const ungroundedRate = ungrounded.length === 0 ? 0 : turnsWithClaims / ungrounded.length;

    const correctnessMet = perClass.every((c) => c.met) && overall >= CORRECTNESS_OVERALL_FLOOR;
    const ungroundedMet = ungroundedRate <= UNGROUNDED_TURN_CEILING;

    const findings = [
      ...correctness.filter((r) => (r.score ?? 0) === 0),
      ...ungrounded.filter((r) => (r.count ?? 0) > 0),
      ...citations.filter((r) => (r.count ?? 0) > 0),
    ].map((r) => ({
      fixtureId: r.fixtureId,
      turn: r.turn,
      dimension: r.dimension,
      detail: r.dimension === "correctness" ? `scored 0 — ${r.note}` : `${r.count}: ${r.note}`,
    }));

    return {
      arm,
      pass,
      turnsJudged: correctness.length,
      correctness: {
        perClass, overall, coverage, met: correctnessMet,
      },
      ungrounded: {
        turnsWithClaims,
        turns: ungrounded.length,
        rate: ungroundedRate,
        totalClaims: ungrounded.reduce((sum, r) => sum + (r.count ?? 0), 0),
        met: ungroundedMet,
      },
      citationSupport: {
        turnsChecked: citations.length,
        unsupported: citations.reduce((sum, r) => sum + (r.count ?? 0), 0),
      },
      gatesMet: correctnessMet && ungroundedMet,
      findings,
    };
  });
};

// ---------------------------------------------------------------------------------------------
// Budget — §7b requires the judge's own tokens to be counted in the experiment
// ---------------------------------------------------------------------------------------------

export interface JudgeBudget {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  /** Undefined when the judge model is absent from the dated price sheet — never guessed. */
  usd?: number;
}

export const budgetOf = (records: JudgeRecord[], model: string): JudgeBudget => {
  const promptTokens = records.reduce((sum, r) => sum + r.promptTokens, 0);
  const completionTokens = records.reduce((sum, r) => sum + r.completionTokens, 0);
  const price = CHAT_PRICES[model];
  return {
    calls: records.length,
    promptTokens,
    completionTokens,
    // Left undefined rather than defaulted. `prices.ts` is a dated sheet and a made-up rate in a
    // cost report is worse than a gap in one — §10.4 requires the date the price was read.
    usd: price === undefined
      ? undefined
      : (promptTokens / 1e6) * price.input + (completionTokens / 1e6) * price.output,
  };
};

/** Rough input size for `--dry-run`, at the usual ~4 characters per token. */
export const estimatePromptTokens = (tasks: JudgeTask[]): number => tasks.reduce(
  (sum, task) => sum + Math.ceil(PROMPT_BUILDERS[task.dimension](task.evidence).length / 4),
  0,
);
