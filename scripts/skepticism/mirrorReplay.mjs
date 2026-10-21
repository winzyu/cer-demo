#!/usr/bin/env node
/**
 * Michael's seven turns on Bay Mouth Pod plus the four over-correction guards, through the
 * Mirror's cer-api (localhost:5101) as a logged-in superadmin, the way the dashboard asks.
 * Writes the replay script's record shape, so `scripts/skepticism/replay.ts --regrade` grades it.
 *
 *   node scripts/skepticism/mirrorReplay.mjs --label <name> --out <dir> [--runs 3]
 *   npx ts-node --transpile-only scripts/skepticism/replay.ts --regrade <dir>/<name>.json
 *
 * Start the Mirror first (`docs/runbooks/MIRROR_RUNBOOK.md`, then `scripts/mirror/addSkepticismPod.mjs`).
 * The password is the Mirror fixture users' published one; nothing here reaches production.
 *
 * The access token stays in memory; nothing secret is printed or written.
 */
import fs from "node:fs";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const LABEL = arg("label");
const OUT = arg("out");
const RUNS = Number(arg("runs", "3"));
if (!LABEL || !OUT) throw new Error("--label and --out are required");
const API = "http://localhost:5101/api/v1";

const BAY_MOUTH = "dev:100000000000023";
const INCIDENT = [
  "What is going on with the pH from this buoy? We've had massive south swells and high tides from El Niño.",
  "Same question, but looking at all of the data from this buoy.",
  "Sounds like you are saying it is all error data.",
  "The buoy is in the water 100% of the time.",
  "You are throwing the baby out with the bath water.",
  "The pod sits an inch or two under the surface at the mouth of the harbor, and it has been over 100°F here.",
  "You can't just start telling people the data is bad.",
];
const GUARDS = [
  { id: "G1-acid", device: "dev:100000000000021", question: "Is the pH at Seaview Outfall Buoy OK over the last 7 days?" },
  { id: "G2-oxygen", device: "dev:100000000000022", question: "How has dissolved oxygen been at Lakeside Inlet Buoy over the last 7 days?" },
  { id: "G3-silent", device: "dev:100000000000020", question: "How is the water at Channel Marker Buoy over the last 7 days?" },
  { id: "G4-turbidity", device: BAY_MOUTH, question: "Is the turbidity reading at Bay Mouth Pod right?" },
];

const login = async () => {
  const res = await fetch(`${API}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user-super-1@mirror.example.invalid", password: "mirror-dev-password" }),
  });
  const body = await res.json();
  if (!body.accessToken) throw new Error(`login failed: ${res.status}`);
  return body.accessToken;
};

const ask = async (token, question, device, chatId) => {
  const started = Date.now();
  const url = new URL(`${API}/gilligan/question`);
  url.searchParams.set("question", question);
  url.searchParams.set("device", device);
  if (chatId) url.searchParams.set("chatId", chatId);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  const elapsed_s = Math.round((Date.now() - started) / 100) / 10;
  const tokens = body.audit?.totalTokens ?? 0;
  // Blended glm-5p3-flash rate: most tokens are prompt ($0.15/M), a few output ($0.50/M).
  const cost = tokens * 0.17 / 1e6;
  if (!res.ok) return { question, answer: "", tool_calls: [], report_retried: false, cost, elapsed_s, error: `${res.status} ${JSON.stringify(body).slice(0, 300)}` };
  return {
    question,
    answer: String(body.answer ?? ""),
    tool_calls: (body.tool_calls ?? []).map((c) => ({ name: c.name, arguments: c.arguments })),
    report_retried: false,
    usage: { totalTokens: tokens },
    cost,
    elapsed_s,
    chatId: body.chatId,
  };
};

const token = await login();
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `${LABEL}.json`);
const record = { label: LABEL, base: API, via: "Mirror cer-api, superadmin", started: new Date().toISOString(), runs: [] };
let spend = 0;
const save = () => fs.writeFileSync(file, JSON.stringify({ ...record, spend_usd: +spend.toFixed(5) }, null, 1));
for (let run = 1; run <= RUNS; run += 1) {
  const entry = { run };
  record.runs.push(entry);
  const turns = [];
  let chatId;
  for (const question of INCIDENT) {
    const turn = await ask(token, question, BAY_MOUTH, chatId);
    turns.push(turn);
    spend += turn.cost;
    if (turn.error) { console.log(`run ${run} T${turns.length}: ${turn.error}`); break; }
    chatId = turn.chatId;
  }
  entry.incident = { turns, checks: {} };
  entry.guards = [];
  for (const guard of GUARDS) {
    const turn = await ask(token, guard.question, guard.device);
    spend += turn.cost;
    entry.guards.push({ id: guard.id, turn, check: {} });
  }
  save();
  console.log(`${LABEL} run ${run} done, about $${spend.toFixed(4)}`);
}
save();
console.log(`${LABEL}: about $${spend.toFixed(4)}, written to ${file}`);
