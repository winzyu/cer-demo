#!/usr/bin/env node
/**
 * Runs the paid chat steps of docs/runbooks/REPORT_OMIT_MIRROR_RUNBOOK.md §7 without a browser,
 * making the calls the dashboard's Gilligan page makes through its proxy (:3100/api/v1):
 * GET /devices, GET /gilligan/question, POST /gilligan/report with each offer's request.
 *
 *   node scripts/mirror/reportOmitDrive.mjs <outDir> <step> <persona> new|same "<question>"
 *   node scripts/mirror/reportOmitDrive.mjs <outDir> <step> <persona> reload <offer indexes, e.g. 0,1>
 *
 * `new` starts a chat, `same` continues the persona's last chat from this script, `reload` re-reads
 * the chat list and downloads the stored offers, as a page reload and button click would. Each
 * question costs model time; downloads use the persona's 5 reports a day. PDFs, their text and
 * the raw answers land in <outDir>.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const API = "http://localhost:3100/api/v1";
const [outDir, step, persona, mode, arg] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const email = `${persona}@mirror.example.invalid`;
const stateFile = `${outDir}/state-${persona}.json`;
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};

const login = await fetch(`${API}/users/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "mirror-dev-password" }),
});
const { accessToken } = await login.json();
if (!accessToken) throw new Error(`login failed ${login.status}`);
const auth = { Authorization: `Bearer ${accessToken}` };

const download = async (request, name) => {
  const res = await fetch(`${API}/gilligan/report`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    console.log(`  download ${name}: ${res.status} ${await res.text()}`);
    return;
  }
  const file = `${outDir}/${name}.pdf`;
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const text = execFileSync("pdftotext", ["-layout", file, "-"]).toString();
  writeFileSync(`${outDir}/${name}.txt`, text);
  const omitted = text.split("\n").find((l) => /^\s*Omitted/.test(l));
  const sections = text.split("\n").filter((l) => /^\s*\d\.\s+[A-Z]/.test(l)).map((l) => l.trim());
  console.log(`  download ${name}: ${res.status} ${res.headers.get("content-disposition")}`);
  console.log(`    Omitted row: ${omitted ? omitted.trim() : "none"}`);
  console.log(`    sections: ${sections.join(" | ")}`);
  console.log(`    turbidity footnote: ${/uncalibrated/i.test(text)}; Site Baseline: ${/Site Baseline for/.test(text)}; Data Quality: ${/Data Quality/.test(text)}`);
};

if (mode === "reload") {
  // A reload re-reads the chat list and renders each stored answer's offers.
  const chats = await (await fetch(`${API}/gilligan/chats`, { headers: auth })).json();
  const chat = chats.find((c) => c.id === state.chatId);
  const offers = chat.messages.flatMap((m, i) => (m.answer?.reports ?? []).map((o) => ({ turn: i + 1, o })));
  for (const index of arg.split(",").map(Number)) {
    const { turn, o } = offers[index];
    console.log(`turn ${turn} offer ${JSON.stringify(o.request)}`);
    await download(o.request, `${step}-turn${turn}`);
  }
  process.exit(0);
}

let device;
const devices = await (await fetch(`${API}/devices`, { headers: auth })).json();
if (Array.isArray(devices) && devices.length === 1) device = devices[0].data?.label;
const chatId = mode === "same" ? state.chatId : undefined;
const params = new URLSearchParams({ question: arg });
if (chatId) params.set("chatId", chatId);
if (device) params.set("device", device);
const started = Date.now();
const res = await fetch(`${API}/gilligan/question?${params}`, { headers: auth });
const body = await res.json();
console.log(`${step} ${persona} chat=${mode} device=${device ?? "(none)"} status=${res.status} ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (!res.ok) {
  console.log(JSON.stringify(body));
  process.exit(1);
}
writeFileSync(`${outDir}/${step}.json`, JSON.stringify(body, null, 2));
writeFileSync(stateFile, JSON.stringify({ chatId: body.chatId ?? chatId }));
console.log(`  usage: ${JSON.stringify(body.audit?.usage ?? body.usage ?? null)}`);
console.log(`  answer:\n${String(body.answer).split("\n").map((l) => "    " + l).join("\n")}`);
(body.reports ?? []).forEach((offer, i) => console.log(`  offer ${i}: ${offer.label ?? offer.siteName ?? ""} ${JSON.stringify(offer.request)}`));
for (const [i, offer] of (body.reports ?? []).entries()) await download(offer.request, `${step}${i ? `-${i}` : ""}`);
