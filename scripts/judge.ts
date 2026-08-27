/**
 * `npm run judge` — the Tier-2 LLM judge from `RETRIEVAL_BAKEOFF.md` §7b, over captured
 * transcripts.
 *
 * The paid half of the ◆G7 decision. Tier 1 (`npm run gate:check`) is deterministic and free and
 * runs first; this decides the two gates a string match cannot — correctness against the fixture
 * rubrics, and claims the answer had no grounds to make — and it only ever runs on Tier-1
 * survivors, because grading an arm that is already out costs money and changes nothing.
 *
 *   npm run judge -- --dry-run                    # what it would cost, without spending
 *   npm run judge -- --calibration                # the 6 fixtures a human already graded
 *   npm run judge -- --arm=firestore-direct
 *   npm run judge -- --report                     # summarize what is already judged, no calls
 *   npm run judge -- --calibrate                  # judge-vs-human agreement, no calls
 *
 * **Every verdict is appended to `data/results/judge/<pass>.jsonl` as it arrives**, and a re-run
 * skips what is already there. An interrupted pass resumes; it is not repaid. Delete lines from
 * that file to force a re-judge of specific turns.
 */
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { config } from "../src/config";
import { createLogger } from "../src/utils/logger";
import { JUDGE_DIMENSIONS, type JudgeDimension } from "../src/eval/judge/prompts";
import {
  DEFAULT_JUDGE_MODEL,
  JUDGE_ROOT,
  TRANSCRIPT_ROOT,
  appendLedger,
  armsOnDisk,
  budgetOf,
  buildTasks,
  estimatePromptTokens,
  judgeOnce,
  judgesOwnFamily,
  modelsUnderTest,
  readLedger,
  recordKey,
  summarize,
  type ArmJudgeResult,
  type JudgeRecord,
} from "../src/eval/judge/runner";
import { calibrate } from "../src/eval/judge/calibrate";

const log = createLogger("Judge");

const arg = (name: string): string | undefined => process.argv
  .find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const flag = (name: string): boolean => process.argv.includes(`--${name}`);

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
  log.info(
    "  citation support    ----  "
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
  log.info(`Judge vs human — ${path.relative(process.cwd(), report.scoresPath)}`);
  log.info(`  ${report.humanRows} graded row(s); ${report.unmatched} not yet judged`);
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
  const calibrating = flag("calibration");
  const arms = arg("arm")?.split(",")
    ?? (calibrating ? calibrationArms(pass) : armsOnDisk(TRANSCRIPT_ROOT, pass));
  const dimensions = (arg("dimension")?.split(",") as JudgeDimension[] | undefined)
    ?? [...JUDGE_DIMENSIONS];
  const judgeModel = arg("judge-model") ?? process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
  const concurrency = Number(arg("concurrency") ?? 4);
  const only = calibrating ? calibrationFixtures(pass) : arg("only")?.split(",");

  const ledger = readLedger(pass);
  const existing = [...ledger.values()].filter((r) => arms.includes(r.arm));

  if (flag("calibrate")) {
    printCalibration(pass, existing);
    return;
  }

  if (flag("report")) {
    summarize(existing, pass).forEach(printArm);
    const budget = budgetOf(existing, judgeModel);
    log.info("");
    log.info(`Judged so far: ${budget.calls} call(s), ${budget.promptTokens} in / ${budget.completionTokens} out`);
    return;
  }

  const tasks = buildTasks({
    pass, arms, only, dimensions,
  }).filter((task) => !ledger.has(recordKey(task)));

  if (tasks.length === 0) {
    log.info(`Nothing left to judge for the "${pass}" pass. Run with --report or --calibrate.`);
    return;
  }

  // §7b: a model grading its own output has a documented self-preference bias. This is the one
  // constraint on the judge that can be checked mechanically, so it is checked rather than
  // trusted to whoever set the env var.
  const underTest = modelsUnderTest(TRANSCRIPT_ROOT, pass, arms);
  if (underTest.includes(judgeModel)) {
    throw new Error(
      `Judge model "${judgeModel}" is the model under test. §7b requires a different one.`,
    );
  }

  // Passes §7b's rule and not its intent — recorded here so the caveat reaches §10.6 of the
  // report rather than being remembered, or not, by whoever writes it.
  const sameFamily = underTest.filter((model) => judgesOwnFamily(judgeModel, model));

  const estimated = estimatePromptTokens(tasks);
  log.info(`Pass:        ${pass}`);
  log.info(`Arms:        ${arms.join(", ")}`);
  log.info(`Under test:  ${underTest.join(", ") || "(not recorded)"}`);
  log.info(`Judge model: ${judgeModel}`);
  if (sameFamily.length > 0) {
    log.info(`  CAVEAT: same family as ${sameFamily.join(", ")} — §7b's rule is met, its intent`);
    log.info("  is not. Record this next to the agreement rate in RETRIEVAL_COMPARISON.md §10.6.");
  }
  log.info(`Dimensions:  ${dimensions.join(", ")}`);
  if (only) {
    log.info(`Fixtures:    ${only.length} — ${only.join(", ")}`);
  }
  log.info(`Calls:       ${tasks.length} (${ledger.size} already on disk, skipped)`);
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
  const options = { model: judgeModel, maxTokens: Number(arg("max-tokens") ?? 4096) };

  const fresh: JudgeRecord[] = [];
  const failures: string[] = [];

  let done = 0;
  await runPool(tasks, concurrency, async (task) => {
    try {
      const record = await judgeOnce(client, options, task);
      appendLedger(pass, record);
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
  });

  const all = [...existing, ...fresh];
  const results = summarize(all, pass);
  results.forEach(printArm);

  log.info("");
  log.info("Tier 2 summary (§8a judgement gates):");
  results.forEach((r) => log.info(`  ${r.arm.padEnd(22)} ${mark(r.gatesMet)}`));

  const budget = budgetOf(all, judgeModel);
  log.info("");
  log.info(
    `Judge budget (§7b): ${budget.calls} call(s), `
    + `${budget.promptTokens.toLocaleString()} in / ${budget.completionTokens.toLocaleString()} out`,
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

  const outPath = arg("out") ?? path.join(JUDGE_ROOT, `${pass}.json`);
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
