/**
 * Paid replay of the customer's two Algalita questions (chat `CxB30b9W3FMpRzHDuaDt`,
 * docs/timeline.md 2026-10-12) against a running server whose device API is
 * `fakeAlgalitaApi.ts`, for the flagging rework (docs/timeline.md 2026-10-13).
 *
 *   npx ts-node --transpile-only scripts/flagging/replay.ts \
 *     --base http://localhost:8011 --label <name> --runs 3 --out <dir> [--budget 0.30]
 *
 * Each question is asked as a fresh chat, `--runs` times. The first is as the overview records
 * it; the second asks for the 30-day report in our own words, since the customer's wording is not
 * kept in the repository. Answers, tool calls and token counts go to `<out>/<label>.json`, with
 * first-pass flags for fault wording, "Action Required" and a data-reliability lead, meant to be
 * read alongside the answers, not instead of them. Spend is costed at `glm-5p3-flash` rates.
 */
import fs from "fs";
import path from "path";
import { ALGALITA } from "../../test/fixtures/algalita/month";

const argument = (name: string, fallback?: string): string => {
  const index = process.argv.indexOf(`--${name}`);
  if (index > 0) return process.argv[index + 1];
  if (fallback === undefined) throw new Error(`--${name} is required`);
  return fallback;
};

const BASE = argument("base");
const LABEL = argument("label");
const RUNS = Number(argument("runs", "3"));
const OUT = argument("out");
const BUDGET = Number(argument("budget", "0.30"));

/** USD per 1M tokens, `glm-5p3-flash` in `src/eval/prices.ts`. */
const PRICE = { input: 0.15, cachedInput: 0.03, output: 0.5 };

const QUESTIONS = [
  { id: "Q1-sep26-drop", question: "Why is there a big drop in pH on Sept 26?" },
  { id: "Q2-30-day-report", question: "Can you give me a report on the water over the last 30 days?" },
];

interface Turn {
  id: string;
  run: number;
  question: string;
  answer: string;
  tool_calls: Array<{ name: string; arguments: unknown }>;
  usage?: { promptTokens?: number; cachedPromptTokens?: number; completionTokens?: number };
  cost: number;
  elapsed_s: number;
  flags: Record<string, string[]>;
  error?: string;
}

const costOf = (usage: Turn["usage"]): number => {
  const prompt = usage?.promptTokens ?? 0;
  const cached = usage?.cachedPromptTokens ?? 0;
  return ((prompt - cached) * PRICE.input + cached * PRICE.cachedInput
    + (usage?.completionTokens ?? 0) * PRICE.output) / 1e6;
};

const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const matching = (text: string, pattern: RegExp): string[] => sentences(text).filter((s) => pattern.test(s));

/** First-pass flags; every one needs reading in context. */
const flagsOf = (answer: string): Record<string, string[]> => {
  const first = sentences(answer).slice(0, 3).join(" ");
  return {
    fault_wording: matching(answer, /malfunction|faulty|sensor (problem|fault|error|issue)|probe (problem|fault|failure)|bad data|not real|physically impossible|instrument problem|data quality/i),
    action_required: matching(answer, /action required|urgent|immediate/i),
    reliability_lead: /reliab|data quality|sensor|probe|trust/i.test(first) ? [first] : [],
    calibration: matching(answer, /calibrat/i),
  };
};

const ask = async (id: string, run: number, question: string): Promise<Turn> => {
  const started = Date.now();
  const response = await fetch(`${BASE}/api/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer flagging-fake" },
    body: JSON.stringify({ query: question, device: ALGALITA, history: [] }),
  });
  const body = await response.json() as Record<string, unknown>;
  const elapsed_s = Math.round((Date.now() - started) / 100) / 10;
  if (!response.ok) {
    return {
      id, run, question, answer: "", tool_calls: [], cost: 0, elapsed_s, flags: {},
      error: `${response.status} ${JSON.stringify(body).slice(0, 300)}`,
    };
  }
  const usage = body.usage as Turn["usage"];
  const answer = String(body.answer ?? "");
  return {
    id,
    run,
    question,
    answer,
    tool_calls: ((body.tool_calls as Array<Record<string, unknown>>) ?? [])
      .map((call) => ({ name: String(call.name), arguments: call.arguments })),
    usage,
    cost: costOf(usage),
    elapsed_s,
    flags: flagsOf(answer),
  };
};

const main = async (): Promise<void> => {
  const turns: Turn[] = [];
  let spend = 0;
  for (let run = 1; run <= RUNS; run += 1) {
    for (const { id, question } of QUESTIONS) {
      if (spend >= BUDGET) {
        console.log(`Budget $${BUDGET} reached at $${spend.toFixed(3)}; stopping.`);
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      const turn = await ask(id, run, question);
      spend += turn.cost;
      turns.push(turn);
      console.log(`${LABEL} run ${run} ${id}: $${turn.cost.toFixed(4)} ${turn.elapsed_s}s ${turn.error ?? ""}`
        + ` flags ${Object.entries(turn.flags).filter(([, v]) => v.length).map(([k]) => k).join(",") || "none"}`);
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${LABEL}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ label: LABEL, base: BASE, spend, turns }, null, 2)}\n`);
  console.log(`Wrote ${file}; spend $${spend.toFixed(3)}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
