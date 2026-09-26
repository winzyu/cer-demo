/**
 * `npm run retrieval:eval` — scores a retrieval adapter against the labelled query set.
 *
 * **Why this exists.** Before it, the only way to know whether a retrieval change helped was to
 * replay 58 conversations through an LLM and have a human grade the answers: hours of work and
 * real money per iteration, which makes tuning impossible in practice. This asks the narrower
 * question — did the right chunks reach the prompt? — which is answerable offline in seconds.
 *
 * It measures a *necessary* condition for a good answer, not a sufficient one. A high recall
 * score means the material was available, not that the model used it well. Retrieval misses are
 * unrecoverable downstream, so ruling them out first is simply the cheapest ordering; the LLM
 * sweep remains the final word on answer quality.
 */
import fs from "fs";
import path from "path";
import { loadLabels, type LoadedLabels } from "../src/eval/retrieval/labels";
import { runRetrievalEval } from "../src/eval/retrieval/runner";
import type { RunOptions, RunResult } from "../src/eval/retrieval/runner";
import { retrievalRegistry } from "../src/retrieval";
import { rewriteQuery } from "../src/retrieval/queryRewrite";
import { LlmService } from "../src/services/LlmService";
import type { ChatMessage } from "../src/types/chat.types";
import { createLogger } from "../src/utils/logger";

const log = createLogger("RetrievalEval");

const arg = (name: string): string | undefined => process.argv
  .find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

const TRANSCRIPT_DIR = path.resolve(__dirname, "../eval/transcripts");

/**
 * `--rewrite`: search each follow-up as `QUERY_REWRITE` would, from a real conversation. The
 * labels hold only user turns, so the assistant's earlier answers come from a captured run
 * (`--history-run`, arm `--history-arm`), exactly as the capture sent them as history.
 */
const rewriteSearch = (
  labels: LoadedLabels,
  historyRun: string,
  historyArm: string,
): RunOptions["searchQuery"] => {
  const llm = new LlmService();
  return async (fixtureId, label) => {
    const fixture = labels.fixtures.find((f) => f.fixtureId === fixtureId);
    const file = path.join(TRANSCRIPT_DIR, historyRun, "warm", historyArm, `${fixtureId}.json`);
    if (!fixture || label.turn === 1) return label.query;
    if (!fs.existsSync(file)) {
      throw new Error(`No captured history for ${fixtureId} at ${file}.`);
    }
    const transcript = JSON.parse(fs.readFileSync(file, "utf8")) as {
      turns: Array<{ index: number; question: string; answer?: string }>;
    };
    const history: ChatMessage[] = fixture.turns
      .filter((t) => t.turn < label.turn)
      .flatMap((t) => {
        const answer = transcript.turns.find((c) => c.index === t.turn - 1)?.answer;
        if (!answer) throw new Error(`${fixtureId} turn ${t.turn} has no captured answer in ${historyRun}.`);
        return [{ role: "user", content: t.query }, { role: "assistant", content: answer }] as ChatMessage[];
      });
    const result = await rewriteQuery(llm, label.query, history);
    log.info(`  ${fixtureId}#${label.turn} -> ${result.rewritten ? result.query : "(unchanged)"}`);
    return result.query;
  };
};

const printSummary = (result: RunResult): void => {
  const { summary } = result;
  log.info("");
  log.info(`${summary.adapter}  (${summary.queries} queries, top-k ${summary.k || "adapter default"})`);
  log.info(`  recall     ${pct(summary.recall)}`);
  log.info(`  precision  ${pct(summary.precision)}`);
  log.info(`  MRR        ${summary.mrr.toFixed(3)}`);
  log.info(`  nDCG       ${summary.ndcg.toFixed(3)}`);
  log.info(`  chunks in context, mean  ${result.meanChunksInContext.toFixed(1)}`);
  log.info("");
  log.info("  per turn:");
  [...new Set(result.scores.map((q) => q.turn))].sort().forEach((turn) => {
    const inTurn = result.scores.filter((q) => q.turn === turn);
    const avg = (xs: number[]): number => xs.reduce((a, x) => a + x, 0) / xs.length;
    log.info(`    turn ${turn}  n=${String(inTurn.length).padStart(3)}  recall ${pct(avg(inTurn.map((q) => q.recall))).padStart(6)}  nDCG ${avg(inTurn.map((q) => q.ndcg)).toFixed(3)}`);
  });
  log.info("");
  log.info("  per class:");
  Object.entries(summary.perClass)
    .sort(([, a], [, b]) => a.recall - b.recall)
    .forEach(([cls, s]) => {
      log.info(`    ${cls.padEnd(22)} n=${String(s.queries).padStart(3)}  recall ${pct(s.recall).padStart(6)}  nDCG ${s.ndcg.toFixed(3)}`);
    });
};

const main = async (): Promise<void> => {
  const requested = arg("adapter") ?? arg("arm");
  const topK = arg("k") ? Number(arg("k")) : undefined;
  const outPath = arg("out");

  const available = retrievalRegistry.modes();
  const modes = requested ? requested.split(",") : available;

  const unknown = modes.filter((m) => !available.includes(m));
  if (unknown.length > 0) {
    // Loud rather than skipped: a typo'd adapter name silently scoring nothing would read as a
    // catastrophic retrieval failure.
    throw new Error(`Unknown adapter(s): ${unknown.join(", ")}. Available: ${available.join(", ")}.`);
  }

  const labels = loadLabels();
  log.info(`Loaded ${labels.fixtures.length} labelled fixtures, ${labels.queries.length} queries.`);
  const searchQuery = process.argv.includes("--rewrite")
    ? rewriteSearch(labels, arg("history-run") ?? "p3-lv-k20-2026-09-26", arg("history-arm") ?? "local-vector")
    : undefined;

  const results: RunResult[] = [];
  // Sequential: the vector adapters embed each query over the network, and a burst is neither
  // faster nor kind to the rate limit.
  // eslint-disable-next-line no-restricted-syntax
  for await (const mode of modes) {
    const adapter = retrievalRegistry.get(mode);
    if (!adapter) continue;
    log.info(`Running ${mode}…`);
    // eslint-disable-next-line no-await-in-loop
    const result = await runRetrievalEval(adapter, { topK, labels, searchQuery });
    results.push(result);
    printSummary(result);
  }

  if (results.length > 1) {
    log.info("");
    log.info("comparison:");
    log.info(`  ${"adapter".padEnd(20)}${"recall".padStart(9)}${"prec".padStart(9)}${"MRR".padStart(8)}${"nDCG".padStart(8)}${"chunks".padStart(9)}`);
    results.forEach((r) => {
      log.info(`  ${r.summary.adapter.padEnd(20)}${pct(r.summary.recall).padStart(9)}${pct(r.summary.precision).padStart(9)}${r.summary.mrr.toFixed(3).padStart(8)}${r.summary.ndcg.toFixed(3).padStart(8)}${r.meanChunksInContext.toFixed(1).padStart(9)}`);
    });
  }

  if (outPath) {
    // The golden-snapshot payload: ranked chunk ids per query. Diffing two of these shows exactly
    // what a tuning change moved, including the things that quietly got worse.
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(
      results.map((r) => ({
        summary: r.summary, scores: r.scores, retrieved: r.retrieved, searched: r.searched,
      })),
      null,
      2,
    ), "utf8");
    log.info(`\nWrote ${outPath}`);
  }
};

main().catch((error: unknown) => {
  log.error("retrieval:eval failed", error);
  process.exitCode = 1;
});
