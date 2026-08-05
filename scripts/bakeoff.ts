import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "../src/config";
import { SPOT_CHECK_QUERIES, USAGE, parseArgs } from "../src/eval/cli";
import { loadFixtures, runnableFixtures } from "../src/eval/fixtures";
import { ArmMismatchError, replayAll, summarize } from "../src/eval/runner";
import type { AskFn } from "../src/eval/runner";
import { createJsonTransport, createSseTransport } from "../src/eval/transport";
import { transcriptPath } from "../src/eval/transcript";
import type { TranscriptRunMeta } from "../src/eval/transcript";
import { createLogger } from "../src/utils/logger";

/**
 * `npm run bakeoff -- --arm=firestore-direct --pass=cold`
 *
 * Capture only. Grading is a separate offline pass over what this writes
 * (`RETRIEVAL_BAKEOFF.md` §7) — keeping them apart is what makes blind grading, and re-grading
 * with a better rubric, possible without paying for another sweep.
 */

const log = createLogger("Bakeoff");

const gitSha = (): string => {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    // Results that cannot be tied to a commit cannot be re-derived, so this is recorded
    // as an explicit unknown rather than left blank.
    return "unknown";
  }
};

const fmt = (n: number): string => n.toLocaleString("en-US");

const spotCheck = async (ask: AskFn, arm: string): Promise<void> => {
  log.info(`Spot-checking "${arm}" on ${SPOT_CHECK_QUERIES.length} queries.`);

  for (let i = 0; i < SPOT_CHECK_QUERIES.length; i += 1) {
    const query = SPOT_CHECK_QUERIES[i];
    // eslint-disable-next-line no-await-in-loop
    const result = await ask({ query, retrieval: arm, history: [] });

    if (result.mode !== arm) {
      throw new ArmMismatchError(arm, result.mode);
    }

    const chars = result.context.reduce((total, chunk) => total + chunk.text.length, 0);
    log.info(`\n[${i + 1}] ${query}`);
    log.info(`    context: ${result.context.length} chunk(s), ${fmt(chars)} chars`);
    result.context.forEach((chunk) => {
      log.info(`      - ${chunk.source} (${fmt(chunk.text.length)} chars): ${chunk.text.slice(0, 120).replace(/\s+/g, " ")}…`);
    });
    log.info(`    answer: ${result.answer.slice(0, 300).replace(/\s+/g, " ")}`);
    log.info(`    usage: prompt=${result.usage?.promptTokens ?? "?"} cached=${result.usage?.cachedPromptTokens ?? "not reported"} completion=${result.usage?.completionTokens ?? "?"}`);

    if (result.context.length === 0) {
      log.warn("    ⚠ EMPTY CONTEXT — this arm would produce a meaningless dataset. Fix before sweeping.");
    }
  }
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));

  const all = loadFixtures();
  const runnable = runnableFixtures(all);
  const selected = args.only
    ? runnable.filter((fixture) => fixture.id === args.only)
    : runnable;

  if (args.only && selected.length === 0) {
    throw new Error(`No runnable fixture with id "${args.only}".`);
  }

  const turns = selected.reduce((total, fixture) => total + fixture.turns.length, 0);
  const skipped = all.length - runnable.length;

  log.info(`arm=${args.arm} pass=${args.pass} transport=${args.transport} base=${args.baseUrl}`);
  const skippedNote = skipped > 0 ? ` (${skipped} skipped — waiting on unimplemented capabilities)` : "";
  log.info(`fixtures: ${selected.length} selected, ${turns} turns${skippedNote}`);
  log.info(`model=${config.fireworks.chatModel ?? "UNSET"} temperature=${config.fireworks.temperature} corpusSource=${config.retrieval.corpusSource}`);

  if (!config.retrieval.debug) {
    // The registry ignores an unknown-but-valid override instead of rejecting it, so without
    // this the sweep would record every arm as the default and look entirely normal.
    log.warn("DEBUG_RETRIEVAL is false in this process's config. If the server shares it, the "
      + "--arm override will be IGNORED and every arm will silently be the default. The runner "
      + "aborts on the first mismatch, but set DEBUG_RETRIEVAL=true on the server first.");
  }

  if (args.dryRun) {
    selected.forEach((fixture) => log.info(`  would replay ${fixture.id} (${fixture.turns.length} turns)`));
    return;
  }

  const transport = args.transport === "json"
    ? createJsonTransport({ baseUrl: args.baseUrl })
    : createSseTransport({ baseUrl: args.baseUrl });

  if (args.spotCheck) {
    await spotCheck(transport, args.arm);
    return;
  }

  const run: TranscriptRunMeta = {
    startedAt: new Date().toISOString(),
    gitSha: gitSha(),
    model: config.fireworks.chatModel ?? "unset",
    temperature: config.fireworks.temperature,
    maxTokens: config.fireworks.maxTokens,
    corpusSource: config.retrieval.corpusSource,
    baseUrl: args.baseUrl,
    transport: args.transport,
    // Provisional: corrected below once we know what the provider actually reported.
    cacheReportingAvailable: false,
  };

  let completed = 0;
  const transcripts = await replayAll(selected, transport, {
    arm: args.arm,
    pass: args.pass,
    run,
    onTurn: (fixtureId, turn) => {
      completed += 1;
      const status = turn.error ? `FAILED (${turn.error})` : `${turn.timing.wallMs}ms`;
      log.info(`  [${completed}/${turns}] ${fixtureId} turn ${turn.index} — ${status}`);
    },
  });

  const summary = summarize(transcripts, args.pass);
  const cacheReported = summary.cachedPromptTokens !== undefined;

  const outRoot = path.resolve(args.outDir);
  transcripts.forEach((transcript) => {
    const target = path.join(outRoot, transcriptPath(args.arm, args.pass, transcript.fixtureId));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const withMeta = { ...transcript, run: { ...run, cacheReportingAvailable: cacheReported } };
    fs.writeFileSync(target, `${JSON.stringify(withMeta, null, 2)}\n`, "utf8");
  });

  log.info(`\nWrote ${transcripts.length} transcripts to ${path.join(args.outDir, args.pass, args.arm)}`);
  log.info(`turns: ${summary.turns} (${summary.failedTurns} failed)`);
  log.info(`prompt tokens: ${fmt(summary.promptTokens)}`);
  log.info(`cached prompt tokens: ${cacheReported ? `${fmt(summary.cachedPromptTokens as number)} (${((summary.cacheHitRate ?? 0) * 100).toFixed(1)}% hit)` : "NOT REPORTED"}`);
  log.info(`completion tokens: ${fmt(summary.completionTokens)}`);
  log.info(`wall time: ${(summary.wallMs / 1000).toFixed(1)}s`);

  summary.warnings.forEach((warning) => log.warn(`⚠ ${warning}`));
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  log.error(message);
  if (message.includes("--arm")) log.error(USAGE);
  process.exitCode = 1;
});
