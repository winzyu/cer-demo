/**
 * `npm run judge` — the Tier-2 LLM judge from `RETRIEVAL_BAKEOFF.md` §7b, over captured
 * transcripts.
 *
 * The paid half of the evaluation. Tier 1 (`npm run gate:check`) is deterministic and free and
 * runs first; this decides the two gates a string match cannot — correctness against the fixture
 * rubrics, and claims the answer had no grounds to make — and it only ever runs on Tier-1
 * survivors, because grading an arm that is already out costs money and changes nothing.
 *
 *   npm run judge -- --dry-run                    # what it would cost, without spending
 *   npm run judge -- --calibration                # the 6 fixtures a human already graded
 *   npm run judge -- --arm=firestore-direct
 *   npm run judge -- --report                     # summarize what is already judged, no calls
 *   npm run judge -- --run=<id>                   # a named capture, with its own ledger
 *   npm run judge -- --calibrate                  # judge-vs-human agreement, no calls
 *
 * **Every verdict is appended to `data/results/judge/<pass>.jsonl` as it arrives**, and a re-run
 * skips what is already there. An interrupted pass resumes; it is not repaid. Delete lines from
 * that file to force a re-judge of specific turns.
 */
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import type { ReasoningEffort } from "openai/resources/shared";
import { config } from "../src/config";
import { createLogger } from "../src/utils/logger";
import { loadFixtures } from "../src/eval/fixtures";
import {
  DEFAULT_JUDGE_DIMENSIONS, JUDGE_DIMENSIONS, type JudgeDimension,
} from "../src/eval/judge/prompts";
import {
  DEFAULT_JUDGE_MAX_TOKENS,
  DEFAULT_JUDGE_MODEL,
  JUDGE_ROOT,
  TRANSCRIPT_ROOT,
  answersTask,
  appendLedger,
  armsOnDisk,
  budgetOf,
  buildTasks,
  estimatePromptTokens,
  filterToCurrentFixtures,
  judgeOnce,
  judgesOwnFamily,
  modelsUnderTest,
  readLedger,
  recordKey,
  summarize,
  type ArmJudgeResult,
  type JudgeRecord,
  type JudgeTask,
} from "../src/eval/judge/runner";
import { calibrate } from "../src/eval/judge/calibrate";
import { parseRunId } from "../src/eval/cli";

const log = createLogger("Judge");

const arg = (name: string): string | undefined => process.argv
  .find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high"] as const;

/** Rejects a typo before it is sent, rather than paying for a call the API refuses. */
const parseReasoningEffort = (value: string | undefined): ReasoningEffort | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!(REASONING_EFFORTS as readonly string[]).includes(value)) {
    throw new Error(`--reasoning-effort must be one of ${REASONING_EFFORTS.join(", ")} (got "${value}").`);
  }
  return value as ReasoningEffort;
};

const mark = (met: boolean): string => (met ? "PASS" : "FAIL");

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

/**
 * The arms the graded packet covered, read off its `KEY.json`.
 *
 * `--calibration` restricts to these. An arm the human never saw contributes no pair to the
 * agreement rate, so judging it during calibration is spend with no output — and the packet that
 * produced the 36 rows predates `hybrid-slice-lexvec` entirely.
 */
const calibrationArms = (pass: string): string[] => {
  const file = path.join(process.cwd(), "eval", "grading", pass, "KEY.json");
  const { key } = JSON.parse(fs.readFileSync(file, "utf8")) as {
    key: Record<string, Record<string, string>>;
  };
  return [...new Set(Object.values(key).flatMap((row) => Object.values(row)))].sort();
};

/**
 * The fixtures the human actually graded, read off `scores.csv`.
 *
 * `--sample=6` would take the first six fixture ids alphabetically, which is *not* the sample
 * that was graded — the human worked a spread of classes. Deriving the subset from the filled
 * rows means the calibration compares the same turns on both sides, which is the only version of
 * it that means anything.
 */
const calibrationFixtures = (pass: string): string[] => {
  const file = path.join(process.cwd(), "eval", "grading", pass, "scores.csv");
  if (!fs.existsSync(file)) {
    throw new Error(`No graded sheet at ${path.relative(process.cwd(), file)}.`);
  }
  const ids = fs.readFileSync(file, "utf8")
    .split("\n")
    .slice(1)
    .filter((line) => line.trim() !== "")
    .filter((line) => line.split(",").slice(4, 7).some((cell) => cell.trim() !== ""))
    .map((line) => line.split(",")[0]);
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) {
    throw new Error(`${path.relative(process.cwd(), file)} holds no graded rows to calibrate on.`);
  }
  return unique;
};

const printArm = (result: ArmJudgeResult): void => {
  const { correctness, ungrounded, citationSupport } = result;

  log.info("");
  log.info(`${result.arm}  (${result.pass} pass, ${result.turnsJudged} turns)  ${mark(result.gatesMet)}`);
  log.info(
    `  correctness         ${mark(correctness.met).padEnd(4)}  `
    + `${correctness.overall.toFixed(2)}/2 overall on the servable set (floor 1.30), `
    + `coverage ${pct(correctness.coverage)}`,
  );
  correctness.perClass.forEach((c) => {
    const suffix = c.servable ? mark(c.met) : "not servable — counted as coverage";
    log.info(`    ${c.class.padEnd(22)} ${c.mean.toFixed(2)}/2  n=${String(c.turns).padStart(2)}  ${suffix}`);
  });
  log.info(
    `  ungrounded claims   ${mark(ungrounded.met).padEnd(4)}  `
    + `${ungrounded.turnsWithClaims}/${ungrounded.turns} turns carry one `
    + `(${pct(ungrounded.rate)}, ceiling 2.0%) — ${ungrounded.totalClaims} claim(s) total`,
  );
  // Zero `turnsChecked` is ambiguous between "not judged" (citations dropped from the default
  // dimension list) and "judged, nothing cited" - and printing "0 unsupported" reads as the
  // clean case either way, which is the misleading version. Say plainly that there is nothing to
  // report rather than let a zero imply a clean citation record that was never checked.
  log.info(
    citationSupport.turnsChecked === 0
      ? "  citation support    ----  not judged (no citations dimension rows for this arm)"
      : "  citation support    ----  "
        + `${citationSupport.unsupported} unsupported across ${citationSupport.turnsChecked} `
        + "cited turn(s) — reported, not gated (Tier 1 owns the citation gate)",
  );

  if (result.findings.length > 0) {
    log.info(`  findings (${result.findings.length}):`);
    result.findings.slice(0, 20).forEach((f) => {
      log.info(`    [${f.dimension}] ${f.fixtureId} t${f.turn}: ${f.detail}`);
    });
    if (result.findings.length > 20) {
      log.info(`    ... ${result.findings.length - 20} more (use --out to see them all)`);
    }
  }
};

const printCalibration = (pass: string, records: JudgeRecord[]): void => {
  const report = calibrate(pass, records);
  log.info("");
  const sheets = report.scoresPaths.map((p) => path.relative(process.cwd(), p));
  log.info(`Judge vs human — ${sheets.join(" + ")}`);
  log.info(`  ${report.humanRows} graded row(s); ${report.unmatched} not yet judged`);

  // Printed before the numbers, not after: a reader who sees an agreement rate first has already
  // formed a view of it by the time a footnote tells them what it was computed over.
  if (report.stale.length > 0) {
    log.warn(
      `  ${report.stale.length} row(s) EXCLUDED — the arm was re-captured after grading, so the `
      + "human and the judge scored different answers:",
    );
    const arms = [...new Set(report.stale.map((row) => row.arm))].sort();
    arms.forEach((arm) => {
      const rows = report.stale.filter((row) => row.arm === arm);
      log.warn(`    ${arm}: ${rows.length} row(s) — re-grade this arm, or exclude it deliberately`);
    });
    const sample = report.stale[0];
    log.warn(`    e.g. ${sample.fixtureId} t${sample.turn} (${sample.arm})`);
    log.warn(`      human graded: ${sample.gradedExcerpt}`);
    log.warn(`      on disk now : ${sample.currentExcerpt}`);
    log.warn("    The numbers below are computed WITHOUT these rows.");
  }
  report.dimensions.forEach((d) => {
    log.info("");
    log.info(
      `  ${d.dimension.padEnd(12)} n=${d.pairs}  exact ${pct(d.exact)}  within-1 ${pct(d.within1)}  `
      + `any/none ${pct(d.binary)}  kappa ${d.kappa.toFixed(2)}  mean |diff| ${d.meanAbsoluteDifference.toFixed(2)}`,
    );
    d.disagreements.slice(0, 8).forEach((x) => {
      log.info(`    ${x.fixtureId} t${x.turn} ${x.arm}: human ${x.human}, judge ${x.judge} — ${x.judgeNote.slice(0, 90)}`);
    });
    if (d.disagreements.length > 8) {
      log.info(`    ... ${d.disagreements.length - 8} more disagreement(s)`);
    }
  });
  log.info("");
  log.info("§7b: if agreement is poor, fix the rubric. Do not quietly keep the judge's scores.");
};

/**
 * Runs `tasks` with a fixed number in flight, appending each verdict before starting the next.
 *
 * ponytail: N workers pulling from a shared index, no queue library and no backpressure model.
 * A metered API and a few hundred calls is what this has to survive. Upgrade path if a rate
 * limit starts biting: a delay on 429 inside `judgeOnce`, not a bigger scheduler here.
 */
const runPool = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> => {
  let next = 0;
  const pull = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, pull));
};

const main = async (): Promise<void> => {
  const pass = arg("pass") ?? "warm";
  // A named run reads its own transcripts and keeps its own ledger, so no verdict on an earlier
  // capture of the same arm is reused for it.
  const runId = parseRunId(arg("run"));
  const transcriptRoot = runId !== undefined ? path.join(TRANSCRIPT_ROOT, runId) : TRANSCRIPT_ROOT;
  const judgeRoot = runId !== undefined ? path.join(JUDGE_ROOT, runId) : JUDGE_ROOT;
  const calibrating = flag("calibration");
  const arms = arg("arm")?.split(",")
    ?? (calibrating ? calibrationArms(pass) : armsOnDisk(transcriptRoot, pass));
  const dimensions = (arg("dimension")?.split(",") as JudgeDimension[] | undefined)
    // A calibration pass judges every dimension: `calibrate()` reports agreement for all three,
    // and a dimension left out would print an empty agreement with no warning.
    ?? [...(calibrating ? JUDGE_DIMENSIONS : DEFAULT_JUDGE_DIMENSIONS)];
  const judgeModel = arg("judge-model") ?? process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
  const concurrency = Number(arg("concurrency") ?? 4);
  const only = calibrating ? calibrationFixtures(pass) : arg("only")?.split(",");

  // Everywhere below reads `currentLedger`/`existing`, never the raw ledger off disk - a row
  // whose fixture predates the current set (the archived pre-rebuild fixtures still sitting in
  // warm.jsonl) is judged data for a rubric that no longer exists, and mixing it into a summary,
  // a budget or the already-judged skip would be silently wrong in three different ways at once.
  // The file on disk is untouched; only what this run reads from it is filtered.
  const fixtureIds = new Set(loadFixtures().map((f) => f.id));
  const rawLedger = readLedger(pass, judgeRoot);
  const filtered = filterToCurrentFixtures([...rawLedger.values()], fixtureIds);
  const { records: currentRecords, ignored } = filtered;
  if (ignored > 0) {
    log.info(
      `Ignored ${ignored} ledger row(s) from a fixture outside the current set `
      + "(archived pre-rebuild fixtures) - not summarized, reported, calibrated or budgeted.",
    );
  }
  const currentLedger = new Map(currentRecords.map((r) => [recordKey(r), r]));
  const existing = currentRecords.filter((r) => arms.includes(r.arm));

  if (flag("calibrate")) {
    printCalibration(pass, existing);
    return;
  }

  if (flag("report")) {
    summarize(existing, pass).forEach(printArm);
    const budget = budgetOf(existing, judgeModel);
    log.info("");
    log.info(`Judged so far: ${budget.calls} call(s), ${budget.promptTokens} in `
      + `(${budget.cachedPromptTokens} cached) / ${budget.completionTokens} out`);
    return;
  }

  // A row is reused only when it graded the exact prompt this run would send. The ledger is keyed
  // by arm, fixture, turn and dimension, so without the hash a re-capture into an existing pass
  // would inherit verdicts for answers the judge never saw.
  const planned = buildTasks({
    pass, arms, only, dimensions, root: transcriptRoot,
  });
  const tasks = planned.filter((task) => !answersTask(currentLedger.get(recordKey(task)), task));
  const stale = new Set(
    tasks.map(recordKey).filter((key) => currentLedger.has(key)),
  );
  if (stale.size > 0) {
    log.info(
      `${stale.size} ledger row(s) graded a different prompt (a re-capture, a rubric or prompt `
      + "change, or a row from before prompt hashes were recorded) - re-judging them.",
    );
  }

  if (tasks.length === 0) {
    log.info(`Nothing left to judge for the "${pass}" pass. Run with --report or --calibrate.`);
    return;
  }

  // §7b: a model grading its own output has a documented self-preference bias. This is the one
  // constraint on the judge that can be checked mechanically, so it is checked rather than
  // trusted to whoever set the env var.
  const underTest = modelsUnderTest(transcriptRoot, pass, arms);
  if (underTest.includes(judgeModel)) {
    throw new Error(
      `Judge model "${judgeModel}" is the model under test. §7b requires a different one.`,
    );
  }

  // Passes §7b's rule and not its intent — recorded here so the caveat reaches the report's
  // grading section (§10, item 6) rather than being remembered, or not, by whoever writes it.
  const sameFamily = underTest.filter((model) => judgesOwnFamily(judgeModel, model));

  const estimated = estimatePromptTokens(tasks);
  log.info(`Pass:        ${pass}`);
  log.info(`Arms:        ${arms.join(", ")}`);
  log.info(`Under test:  ${underTest.join(", ") || "(not recorded)"}`);
  log.info(`Judge model: ${judgeModel}`);
  if (sameFamily.length > 0) {
    log.info(`  CAVEAT: same family as ${sameFamily.join(", ")} — §7b's rule is met, its intent`);
    log.info("  is not. Record this next to the agreement rate in the evaluation report.");
  }
  log.info(`Dimensions:  ${dimensions.join(", ")}`);
  if (only) {
    log.info(`Fixtures:    ${only.length} — ${only.join(", ")}`);
  }
  log.info(`Calls:       ${tasks.length} (${planned.length - tasks.length} already on disk, skipped)`);
  log.info(`Input est.:  ~${estimated.toLocaleString()} tokens at ~4 chars/token`);

  if (flag("dry-run")) {
    log.info("");
    log.info("--dry-run: nothing was sent. Drop the flag to spend.");
    return;
  }

  if (!config.fireworks.apiKey) {
    throw new Error("FIREWORKS_API_KEY is not set.");
  }

  const client = new OpenAI({
    apiKey: config.fireworks.apiKey,
    baseURL: config.fireworks.baseUrl,
  });
  const options = {
    model: judgeModel,
    maxTokens: Number(arg("max-tokens") ?? DEFAULT_JUDGE_MAX_TOKENS),
    reasoningEffort: parseReasoningEffort(arg("reasoning-effort")),
  };

  const fresh: JudgeRecord[] = [];
  const failures: string[] = [];

  // One turn's dimensions run back to back in one worker, not side by side. Their prompts open
  // with the same grounding material (`prompts.ts`), and the second call can only read it from the
  // provider's prompt cache once the first has written it.
  const byTurn = new Map<string, JudgeTask[]>();
  tasks.forEach((task) => {
    const turnKey = `${task.arm}|${task.fixtureId}|${task.turn}`;
    byTurn.set(turnKey, [...(byTurn.get(turnKey) ?? []), task]);
  });

  let done = 0;
  const judgeTask = async (task: JudgeTask): Promise<void> => {
    try {
      const record = await judgeOnce(client, options, task);
      appendLedger(pass, record, judgeRoot);
      fresh.push(record);
    } catch (error) {
      failures.push(`${recordKey(task)}: ${(error as Error).message}`);
    }
    // Counted on completion rather than on dispatch — with workers in flight the two differ,
    // and a progress line that runs ahead of the ledger is a lie about what has been paid for.
    done += 1;
    if (done % 25 === 0 || done === tasks.length) {
      log.info(`  ${done}/${tasks.length} judged, ${failures.length} failed`);
    }
  };
  await runPool([...byTurn.values()], concurrency, (turnTasks) => turnTasks.reduce(
    (previous, task) => previous.then(() => judgeTask(task)),
    Promise.resolve(),
  ));

  // A re-judged row replaces its stale predecessor in this run's summary, as it does on disk.
  const all = [...existing.filter((r) => !stale.has(recordKey(r))), ...fresh];
  const results = summarize(all, pass);
  results.forEach(printArm);

  log.info("");
  log.info("Tier 2 summary (§8a judgement gates):");
  results.forEach((r) => log.info(`  ${r.arm.padEnd(22)} ${mark(r.gatesMet)}`));

  const budget = budgetOf(all, judgeModel);
  log.info("");
  log.info(
    `Judge budget (§7b): ${budget.calls} call(s), `
    + `${budget.promptTokens.toLocaleString()} in (${budget.cachedPromptTokens.toLocaleString()} cached) / `
    + `${budget.completionTokens.toLocaleString()} out`,
  );
  log.info(
    budget.usd === undefined
      ? `  No price for "${judgeModel}" in src/eval/prices.ts — add it with the date read before §10.`
      : `  ~$${budget.usd.toFixed(4)} at the ${judgeModel} rate in src/eval/prices.ts`,
  );

  if (failures.length > 0) {
    log.info("");
    log.info(`${failures.length} call(s) failed and were not recorded:`);
    failures.slice(0, 10).forEach((f) => log.info(`  ${f}`));
  }

  const outPath = arg("out") ?? path.join(judgeRoot, `${pass}.json`);
  const resolved = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify({
    pass,
    judgeModel,
    modelsUnderTest: underTest,
    judgedAt: new Date().toISOString(),
    budget,
    results,
  }, null, 2)}\n`, "utf8");
  log.info(`\nWrote ${path.relative(process.cwd(), resolved)}`);
};

main().catch((error: Error) => {
  process.stderr.write(`\nJudge failed: ${error.message}\n`);
  process.exit(1);
});
