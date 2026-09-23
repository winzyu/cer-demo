/** Offline correction audit. Writes a NEW record; never updates the historical review. */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import assert from "assert";
import { execFileSync } from "child_process";
import { loadFixtures, FIXTURE_DIR } from "../src/eval/fixtures";
import { loadLabels, LABEL_DIR } from "../src/eval/retrieval/labels";
import { readCorpus, CORPUS_OUTPUT } from "../src/ingestion/ingest";
import { Bm25Index, loadBm25Documents } from "../src/retrieval/lexical/Bm25Index";
import { GoldContextAdapter } from "../src/retrieval/adapters/GoldContextAdapter";
import { DIRECT_FEED_SLICE } from "../src/ingestion/corpus";

const BASE = "c41ffb5";
const HISTORY = "eval/reviews/wave1-agent-2026-09-21";
const OUT = "eval/reviews/wave1-corrections-2026-09-22/verification.json";
const hash = (bytes: string | Buffer): string => crypto.createHash("sha256").update(bytes).digest("hex");
const gitBytes = (file: string): Buffer => execFileSync("git", ["show", `${BASE}:${file}`]);
const rate = (hits: boolean[]): { hits: number; turns: number; percent: number } => ({
  hits: hits.filter(Boolean).length,
  turns: hits.length,
  percent: hits.length ? Number((100 * hits.filter(Boolean).length / hits.length).toFixed(2)) : 0,
});

const main = async (): Promise<void> => {
  // Check captured transcripts and the entire old review byte-for-byte against the base.
  const protectedFiles = execFileSync("git", ["ls-tree", "-r", "--name-only", BASE,
    "--", HISTORY, "eval/transcripts"], { encoding: "utf8" }).trim().split("\n");
  protectedFiles.forEach((file) => assert.equal(hash(fs.readFileSync(file)), hash(gitBytes(file)), file));
  const oldManifest = JSON.parse(fs.readFileSync(`${HISTORY}/manifest.json`, "utf8"));
  assert.equal(hash(fs.readFileSync(CORPUS_OUTPUT)), oldManifest.corpus_sha256, "corpus changed");
  const fixtures = loadFixtures();
  const labels = loadLabels();
  assert.equal(fixtures.length, 45);
  assert.equal(labels.fixtures.length, fixtures.length);
  const corpus = readCorpus();
  const byChunk = new Map(corpus.documents.flatMap((d) => d.chunks.map((c) => [c.id, d.filename])));
  const claims = new Map<string, string>();
  const claimQuoteExceptions: string[] = [];
  fs.readdirSync("eval/claims").filter((f) => f.endsWith(".json")).forEach((file) => {
    const doc = JSON.parse(fs.readFileSync(`eval/claims/${file}`, "utf8"));
    doc.chunks.forEach((chunk: { chunkId: string; claims: Array<{ id: string; quote: string }> }) => {
      assert(byChunk.has(chunk.chunkId), `dead claim chunk: ${chunk.chunkId}`);
      const text = corpus.documents.flatMap((d) => d.chunks).find((c) => c.id === chunk.chunkId)!.text;
      chunk.claims.forEach((claim) => {
        claims.set(claim.id, chunk.chunkId);
        if (!text.includes(claim.quote)) claimQuoteExceptions.push(claim.id);
      });
    });
  });
  const index = new Bm25Index(loadBm25Documents());
  const adapter = new GoldContextAdapter();
  const rows: Array<{ fixture: string; class: string; turn: number; topChunk: string | null;
    documentHit: boolean; provenanceHit: boolean | null; labelledChunkHit: boolean;
    contextChunks: number }> = [];
  const fixtureHashes: Record<string, string> = {};
  const changedFixtures: string[] = [];
  const changedQuestions: string[] = [];
  let conditions = 0;
  for (const fixture of fixtures) {
    const file = `eval/fixtures-wave1/${fixture.id}.json`;
    fixtureHashes[fixture.id] = hash(fs.readFileSync(path.join(FIXTURE_DIR, `${fixture.id}.json`)));
    const original = JSON.parse(gitBytes(file).toString());
    if (hash(gitBytes(file)) !== fixtureHashes[fixture.id]) changedFixtures.push(fixture.id);
    const provenance = new Set((fixture.notes.match(/\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+){2,}\b/g) ?? [])
      .flatMap((id) => (claims.has(id) ? [claims.get(id)!] : [])));
    for (const [i, turn] of fixture.turns.entries()) {
      if (turn.content !== original.turns[i].content) changedQuestions.push(`${fixture.id}:T${i + 1}`);
      conditions += turn.rubric.must_contain.length + turn.rubric.must_not.length;
      const matching = labels.queries.filter((q) => q.fixtureId === fixture.id && q.label.turn === i + 1);
      assert.equal(matching.length, 1);
      const label = matching[0].label;
      assert.equal(label.query, turn.content);
      const context = await adapter.getContext(turn.content);
      assert.equal(context.length, label.relevant.length);
      (turn.retrieval_evidence ?? []).forEach((evidence) => {
        assert(context.some((chunk) => chunk.text.includes(evidence.quote)), `${fixture.id}: missing quote`);
      });
      if (fixture.class === "refusal") {
        assert(turn.requires_refusal && context.length > 0 && !label.noRelevantChunks);
        assert(turn.retrieval_evidence?.length);
      }
      const first = index.search(turn.content, 1)[0];
      const filename = first ? byChunk.get(first.id) : undefined;
      rows.push({
        fixture: fixture.id, class: fixture.class, turn: i + 1,
        topChunk: first?.id ?? null,
        documentHit: Boolean(filename && fixture.answerable_from.includes(filename)),
        // Keep the old notes-based estimator separate from the expanded explanatory gold set.
        provenanceHit: provenance.size ? provenance.has(first?.id) : null,
        labelledChunkHit: label.relevant.some((chunk) => chunk.chunkId === first?.id),
        contextChunks: context.length,
      });
    }
  }
  assert.equal(rows.length, 90);
  assert.equal(labels.queries.length, rows.length);
  const inputFiles = ["src/prompt/systemPrompt.ts", "src/eval/judge/prompts.ts",
    "scripts/resolveRetrievalLabels.ts", "scripts/verifyWave1Corrections.ts",
    "scripts/verifyWave1LabelFailures.py",
    "src/eval/types.ts", "src/eval/fixtures.ts", "src/eval/gates/runner.ts",
    "src/tools/getPodThresholds.ts",
    ...fs.readdirSync("eval/claims").filter((f) => f.endsWith(".json")).map((f) => `eval/claims/${f}`),
    ...fs.readdirSync(LABEL_DIR).filter((f) => f.endsWith(".json")).map((f) => `eval/retrieval-labels/${f}`)];
  const record = {
    base: BASE, historicalReview: HISTORY, historicalFilesAndTranscriptsUnchanged: true,
    corpusSha256: hash(fs.readFileSync(CORPUS_OUTPUT)), documents: corpus.documents.length,
    chunks: byChunk.size, fixtures: fixtures.length, turns: rows.length, conditions,
    humanVerificationComplete: false, paidCaptures: 0,
    changedFixtures, changedQuestions, fixtureHashes,
    inputHashes: Object.fromEntries(inputFiles.map((file) => [file, hash(fs.readFileSync(file))])),
    claimQuoteExceptions,
    contamination: {
      method: "Default BM25, rank 1, verbatim question per turn without history; no API calls",
      document: rate(rows.map((r) => r.documentHit)),
      notesProvenance: rate(rows.flatMap((r) => r.provenanceHit === null ? [] : [r.provenanceHit])),
      labelledChunk: rate(rows.map((r) => r.labelledChunkHit)),
      perClass: Object.fromEntries([...new Set(rows.map((r) => r.class))].map((cls) => [cls, {
        document: rate(rows.filter((r) => r.class === cls).map((r) => r.documentHit)),
        labelledChunk: rate(rows.filter((r) => r.class === cls).map((r) => r.labelledChunkHit)),
      }])),
    },
    outsideSlice: {
      explanation: "Includes refusal explanatory sources; not equivalent to whole-request answerability",
      outsideOnlyTurns: fixtures.filter((f) => f.answerable_from.length > 0
        && f.answerable_from.every((file) => !DIRECT_FEED_SLICE.includes(file))).length * 2,
      turnsWithSources: fixtures.filter((f) => f.answerable_from.length > 0).length * 2,
    },
    rows,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ fixtures: record.fixtures, turns: record.turns,
    conditions, changedFixtures: changedFixtures.length, changedQuestions: changedQuestions.length,
    contamination: record.contamination, claimQuoteExceptions }, null, 2)}\n`);
};
void main();
