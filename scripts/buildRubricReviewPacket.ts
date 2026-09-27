/**
 * Builds the rubric-strictness review packet: every gold-context turn of a captured run with its
 * rubric, answer and correctness verdicts, plus a seeded sample that also carries the excerpts.
 *
 *   npx ts-node scripts/buildRubricReviewPacket.ts --run=p3-final-2026-09-25 \
 *     --rejudge=p3-final-rejudge-2026-09-25 --out=eval/reviews/rubric-strictness-2026-09-25
 *
 * Reads only committed data and spends nothing. The sample is chosen by hashing each turn's key,
 * not by reading answers, so it cannot be steered toward cases that favour either reading.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

const arg = (name: string): string | undefined => process.argv
  .find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const run = arg("run") ?? "p3-final-2026-09-25";
const rejudge = arg("rejudge");
const arm = arg("arm") ?? "gold-context";
const outDir = arg("out") ?? "eval/reviews/rubric-strictness-2026-09-25";
const SEED = "rubric-review-2026-09-25";
const PER_SCORE: Record<number, number> = { 0: 3, 1: 10, 2: 3 };

interface Rubric { must_contain?: string[]; must_not?: string[] }
interface Verdict { score: number; note: string }

const fixtureDir = path.join("eval", "fixtures-wave1");
type FixtureTurns = { class: string; turns: Array<{ content: string; rubric: Rubric }> };
const fixtures = new Map<string, FixtureTurns>();
fs.readdirSync(fixtureDir).filter((f) => f.endsWith(".json")).forEach((f) => {
  const fx = JSON.parse(fs.readFileSync(path.join(fixtureDir, f), "utf8"));
  fixtures.set(fx.id, { class: fx.class, turns: fx.turns.filter((t: { role: string }) => t.role === "user") });
});

const verdicts = (runId: string): Map<string, Verdict> => {
  const ledger = path.join("data", "results", "judge", runId, "warm.jsonl");
  const out = new Map<string, Verdict>();
  fs.readFileSync(ledger, "utf8").split("\n").filter(Boolean).forEach((line) => {
    const r = JSON.parse(line);
    if (r.arm === arm && r.dimension === "correctness") out.set(`${r.fixtureId}#${r.turn}`, { score: r.score, note: r.note });
  });
  return out;
};
const pass1 = verdicts(run);
const pass2 = rejudge ? verdicts(rejudge) : new Map<string, Verdict>();

interface Row {
  key: string; fixtureId: string; cls: string; turn: number; question: string; rubric: Rubric;
  answer: string; context: Array<{ id: string; source: string; text: string }>;
  priorQuestion?: string; priorAnswer?: string; v1?: Verdict; v2?: Verdict;
}
const rows: Row[] = [];
const transcriptDir = path.join("eval", "transcripts", run, "warm", arm);
fs.readdirSync(transcriptDir).sort().forEach((f) => {
  const t = JSON.parse(fs.readFileSync(path.join(transcriptDir, f), "utf8"));
  const fx = fixtures.get(t.fixtureId);
  if (!fx) throw new Error(`No fixture for ${t.fixtureId}`);
  t.turns.forEach((u: { index: number; question: string; answer: string; context: Row["context"] }) => {
    const turn = u.index + 1;
    const key = `${t.fixtureId}#${turn}`;
    const prior = u.index > 0 ? t.turns[u.index - 1] : undefined;
    rows.push({
      key,
      fixtureId: t.fixtureId,
      cls: fx.class,
      turn,
      question: u.question,
      rubric: fx.turns[u.index].rubric,
      answer: u.answer,
      context: u.context,
      priorQuestion: prior?.question,
      priorAnswer: prior?.answer,
      v1: pass1.get(key),
      v2: pass2.get(key),
    });
  });
});

const list = (items: string[] | undefined): string => (items && items.length > 0
  ? items.map((item, i) => `${i + 1}. ${item}`).join("\n") : "(none)");
const quote = (text: string): string => text.trim().split("\n").map((l) => `> ${l}`).join("\n");
const verdictLines = (row: Row): string => [row.v1, row.v2].map((v, i) => (v
  ? `- Judge pass ${i + 1}: **${v.score}** - ${v.note}` : "")).filter(Boolean).join("\n");

const rowBlock = (row: Row, withContext: boolean): string => {
  const parts = [
    `## ${row.key} (${row.cls}, turn ${row.turn})`,
    "",
  ];
  if (row.priorQuestion) {
    parts.push("**Earlier in this conversation (turn 1 question):**", "", quote(row.priorQuestion), "");
    if (withContext && row.priorAnswer) parts.push("**Turn 1 answer:**", "", quote(row.priorAnswer), "");
  }
  parts.push(
    "**Question:**",
    "",
    quote(row.question),
    "",
    "**Must contain:**",
    "",
    list(row.rubric.must_contain),
    "",
    "**Must not:**",
    "",
    list(row.rubric.must_not),
    "",
    "**Answer (gpt-oss-120b, gold context):**",
    "",
    quote(row.answer),
    "",
    "**Correctness verdicts (DeepSeek judge):**",
    "",
    verdictLines(row),
    "",
  );
  if (withContext) {
    parts.push(`**Excerpts the model was given (${row.context.length}), numbered as the model saw them:**`, "");
    row.context.forEach((c, i) => parts.push(`<details><summary>[${i + 1}] ${c.source} - ${c.id}</summary>`, "", "```text", c.text.trim(), "```", "", "</details>", ""));
  }
  return parts.join("\n");
};

const rank = (key: string): string => crypto.createHash("sha256").update(`${SEED}:${key}`).digest("hex");
const sample = Object.entries(PER_SCORE).flatMap(([score, n]) => rows
  .filter((r) => r.v1?.score === Number(score))
  .sort((a, b) => rank(a.key).localeCompare(rank(b.key)))
  .slice(0, n))
  .sort((a, b) => a.key.localeCompare(b.key));

const dist = [0, 1, 2].map((s) => `${s}: ${rows.filter((r) => r.v1?.score === s).length}`).join(", ");
const mean = (vs: Array<Verdict | undefined>) => (
  vs.reduce((a, v) => a + (v?.score ?? 0), 0) / vs.length
).toFixed(2);

fs.mkdirSync(outDir, { recursive: true });
const header = (title: string, note: string) => [
  `# ${title}`, "",
  `Generated by \`scripts/buildRubricReviewPacket.ts\` from run \`${run}\`${rejudge ? ` and re-judge \`${rejudge}\`` : ""}, arm \`${arm}\`. Do not edit by hand.`, "",
  note, "",
  `Pass 1 score distribution over ${rows.length} turns: ${dist}. Mean correctness: pass 1 ${mean(rows.map((r) => r.v1))}${rejudge ? `, pass 2 ${mean(rows.map((r) => r.v2))}` : ""}.`, "",
].join("\n");

fs.writeFileSync(path.join(outDir, "ALL_TURNS.md"), [
  header("All gold-context turns", "Every turn: question, rubric, answer and both judge verdicts. Excerpts are omitted here; see SAMPLE.md."),
  ...rows.map((r) => rowBlock(r, false)),
].join("\n"));

fs.writeFileSync(path.join(outDir, "SAMPLE.md"), [
  header(
    "Sampled turns with excerpts",
    `${sample.length} turns chosen before reading any answer: within each pass-1 score (0, 1, 2) the first ${PER_SCORE[0]}, ${PER_SCORE[1]} and ${PER_SCORE[2]} turns by SHA-256 of \`${SEED}:<fixture>#<turn>\`. Each carries the excerpts the model was given.`,
  ),
  ...sample.map((r) => rowBlock(r, true)),
].join("\n"));

// eslint-disable-next-line no-console
console.log(`Wrote ${rows.length} turns and a ${sample.length}-turn sample to ${outDir}`);
