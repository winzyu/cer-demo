#!/usr/bin/env node
/**
 * Checks that summary and overview answers name the period they cover (`docs/SPECS.md` §10.8),
 * against a local cer-demo server pointed at the fake device API from
 * `scripts/skepticism/fakeDeviceApi.ts` (no production reads).
 *
 *   node scripts/e2e/coverageCheck.mjs --base http://localhost:8420 --out <dir> [--runs 3]
 *
 * Each run asks three open questions about Bay Mouth Pod, each followed by "What about the pH?",
 * carrying history the way cer-api does (the earlier answer as returned, server lines included).
 * Every question is a paid model call. Results go to <out>/coverage-check.json; the flags printed
 * are first-pass only, so read the answers too.
 */
import fs from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
};
const BASE = option("base");
const OUT = option("out");
const RUNS = Number(option("runs", "3"));
if (!BASE || !OUT || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  console.error("--base http://localhost:<port> and --out are required");
  process.exit(1);
}

const DEVICE = "dev:100000000000023";
const OPENERS = [
  "Give me a summary of this buoy",
  "Can you give me an overview of the data?",
  "How is the water looking?",
];
const FOLLOW_UP = "What about the pH?";

const LINE = /\n\nData covered in this reply: .+ UTC .*\.$|\n\nNo new readings were read for this reply/m;
const PDF_LINE = /\n\nNew PDF in this reply: .+/;
/** A period named in the model's own words, before any server line. */
const PERIOD = /\b(last|past) (\d+|seven|several) (hours?|days?|weeks?|months?)\b|\b(last|past|this) (week|day|month)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}\b|\b20\d\d-\d\d-\d\d\b/i;

const ask = async (query, history) => {
  const started = Date.now();
  const response = await fetch(`${BASE}/api/v1/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer coverage-check" },
    body: JSON.stringify({ query, device: DEVICE, ...(history.length > 0 ? { history } : {}) }),
  });
  return { status: response.status, seconds: (Date.now() - started) / 1000, body: await response.json() };
};

/** The model's own text: the answer up to the first server-written line. */
const ownText = (answer) => answer.split(/\n\n(?:Data covered in this reply:|No new readings were read|New PDF in this reply:|No new PDF was made)/)[0];
const firstSentence = (text) => text.trim().split(/(?<=[.!?])\s+|\n/)[0] ?? "";

const results = [];
let tokens = 0;
for (let run = 1; run <= RUNS; run += 1) {
  for (const opener of OPENERS) {
    const history = [];
    for (const question of [opener, FOLLOW_UP]) {
      const reply = await ask(question, history);
      const answer = typeof reply.body.answer === "string" ? reply.body.answer : "";
      tokens += reply.body.usage?.totalTokens ?? 0;
      const own = ownText(answer);
      const tools = (reply.body.tool_calls ?? []).map((call) => `${call.name}:${call.arguments?.time_range ?? "-"}`);
      const row = {
        run, opener, question, status: reply.status, seconds: reply.seconds, tools,
        tool_calls: reply.body.tool_calls ?? [],
        server_line: LINE.test(answer) || PDF_LINE.test(answer),
        period_in_text: PERIOD.test(own),
        period_in_first_sentence: PERIOD.test(firstSentence(own)),
        answer,
      };
      results.push(row);
      console.log(
        `r${run} ${question === FOLLOW_UP ? "  follow-up" : opener.padEnd(40)} ${reply.status} `
        + `tools=[${tools.join(", ")}] line=${row.server_line} text=${row.period_in_text} first=${row.period_in_first_sentence}`,
      );
      if (reply.status !== 200 || !answer) break;
      history.push({ role: "user", content: question }, { role: "assistant", content: answer });
    }
  }
}
await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, "coverage-check.json"), `${JSON.stringify({ base: BASE, device: DEVICE, tokens, results }, null, 2)}\n`);
console.log(`${results.length} answers, ${tokens} tokens; saved ${path.join(OUT, "coverage-check.json")}`);
