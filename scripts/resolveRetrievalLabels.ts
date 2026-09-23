/**
 * Phase 1e, mechanical half: resolve the claim ids named in each `eval/fixtures-wave1/*.json`
 * fixture's `notes` prose against `eval/claims/*.json`, and emit draft `FixtureLabels`
 * (`src/eval/retrieval/types.ts`) into `eval/retrieval-labels/`.
 *
 * **What this does not do.** It does not run a candidate sweep for chunks the notes never
 * mention, and it does not place hard negatives — both are a later, human pass
 * (`docs/EVAL_REBUILD.md` §1e). A label here is real ground truth only for the claim ids that
 * happen to be named and resolve; everything else is a reported gap, not a guess.
 *
 * Per-turn retrieval_evidence overrides notes using verbatim filename/quote anchors.
 * Refusal fixtures must provide it: missing requested values do not imply missing explanatory
 * context. Explicit anchors fail closed if they no longer resolve in the current corpus.
 * Other fixtures retain provisional fixture-wide claim labels until the Phase 1e split.
 * This script does not delete stale output files; verify output membership after generation.
 *
 *   npx ts-node scripts/resolveRetrievalLabels.ts
 *   npx ts-node scripts/resolveRetrievalLabels.ts --out=eval/retrieval-labels
 */
import fs from "fs";
import path from "path";
import { readCorpus } from "../src/ingestion/ingest";
import { createLogger } from "../src/utils/logger";

const log = createLogger("ResolveRetrievalLabels");

const FIXTURES_DIR = path.resolve(__dirname, "../eval/fixtures-wave1");
const CLAIMS_DIR = path.resolve(__dirname, "../eval/claims");
const DEFAULT_OUT = path.resolve(__dirname, "../eval/retrieval-labels");

const arg = (name: string): string | undefined => process.argv
  .find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

interface ClaimResolution {
  chunkId: string;
  filename: string;
  locator: string;
  quote: string;
}

interface ClaimsChunk {
  chunkId: string;
  locator: string;
  claims: Array<{ id: string; quote: string }>;
}

/** claim id -> where it lives in the corpus. Built once from every `eval/claims/*.json` file. */
const loadClaimIndex = (): Map<string, ClaimResolution> => {
  const index = new Map<string, ClaimResolution>();
  fs.readdirSync(CLAIMS_DIR).filter((f) => f.endsWith(".json")).forEach((file) => {
    const doc = JSON.parse(fs.readFileSync(path.join(CLAIMS_DIR, file), "utf8"));
    (doc.chunks ?? []).forEach((chunk: ClaimsChunk) => {
      chunk.claims.forEach((claim) => {
        index.set(claim.id, {
          chunkId: chunk.chunkId,
          filename: doc.filename,
          locator: chunk.locator,
          quote: claim.quote,
        });
      });
    });
  });
  return index;
};

/**
 * Claim ids are alnum, 3+ hyphen-separated segments, last segment exactly 2 digits — verified
 * against all 2,250 ids in `eval/claims/`. That final-segment check is what keeps this from
 * matching every other hyphenated phrase in the notes prose (document filenames, cross-fixture
 * mentions, "plus-or-minus", "out-of-scope"...); it still occasionally matches a real phrase
 * that happens to end in two digits (e.g. "in-situ-vs-25"), which the exact-match against
 * `loadClaimIndex()` below is what actually decides — this regex only picks the candidates the
 * coverage report calls "named".
 */
const CLAIM_ID_SHAPE = /\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+){2,}\b/g;

const namedClaimIds = (notes: string): string[] => [...new Set(
  (notes.match(CLAIM_ID_SHAPE) ?? []).filter((token) => /-\d{2}$/.test(token)),
)];

interface RelevantChunkDraft {
  chunkId: string;
  contentHash: string;
  filename: string;
  grade: number;
  evidence: string;
  /** Extra, additive field: the human locator, so a re-chunk can re-resolve rather than void. */
  locator: string;
  /** Extra, additive field: which named claim ids resolved to this chunk, for traceability. */
  claimIds: string[];
}

interface FixtureCoverage {
  fixtureId: string;
  fixtureClass: string;
  isRefusal: boolean;
  named: string[];
  resolved: string[];
  unresolved: string[];
  distinctChunks: string[];
  written: boolean;
}

const main = (): void => {
  const outDir = path.resolve(arg("out") ?? DEFAULT_OUT);
  fs.mkdirSync(outDir, { recursive: true });

  const claimIndex = loadClaimIndex();
  const corpus = readCorpus();
  const knownChunks = new Set<string>();
  corpus.documents.forEach((d) => d.chunks.forEach((c) => knownChunks.add(c.id)));

  const fixtureDir = path.resolve(arg("fixtures") ?? FIXTURES_DIR);
  const fixtureFiles = fs.readdirSync(fixtureDir).filter((f) => f.endsWith(".json")).sort();
  const coverage: FixtureCoverage[] = [];
  const outputs: Array<{ file: string; body: string }> = [];
  const stale = fs.readdirSync(outDir).filter((file) => file.endsWith(".json")
    && !fixtureFiles.includes(file));
  if (stale.length > 0) throw new Error(`Stale label files require review: ${stale.join(", ")}`);

  fixtureFiles.forEach((file) => {
    const fixtureId = file.replace(/\.json$/, "");
    const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, file), "utf8"));
    const isRefusal = fixture.class === "refusal";
    const named = namedClaimIds(fixture.notes ?? "");

    const resolved: string[] = [];
    const unresolved: string[] = [];
    const byChunk = new Map<string, { resolution: ClaimResolution; claimIds: string[] }>();

    named.forEach((id) => {
      const resolution = claimIndex.get(id);
      if (!resolution) {
        unresolved.push(id);
        return;
      }
      if (!knownChunks.has(resolution.chunkId)) {
        // Claims inventory and live corpus disagree — do not fabricate a label against a chunk
        // that no longer exists.
        unresolved.push(`${id} (chunk ${resolution.chunkId} not in corpus)`);
        return;
      }
      const source = corpus.documents.find((d) => d.filename === resolution.filename);
      const chunk = source?.chunks.find((c) => c.id === resolution.chunkId);
      if (!chunk?.text.includes(resolution.quote)) {
        throw new Error(`${fixtureId}: claim ${id} quote does not match its current chunk`);
      }
      resolved.push(id);
      const entry = byChunk.get(resolution.chunkId);
      if (entry) {
        entry.claimIds.push(id);
      } else {
        byChunk.set(resolution.chunkId, { resolution, claimIds: [id] });
      }
    });

    const fallback: RelevantChunkDraft[] = [...byChunk.entries()].map(
      ([chunkId, { resolution, claimIds }]) => ({
        chunkId,
        contentHash: chunkId.split("__").pop() as string,
        filename: resolution.filename,
        grade: 2,
        evidence: resolution.quote,
        locator: resolution.locator,
        claimIds,
      }),
    );

    const turns = (fixture.turns ?? []).map((turn: {
      content: string;
      retrieval_evidence?: Array<{ filename: string; quote: string }>;
    }, i: number) => {
      let relevant = fallback;
      if (turn.retrieval_evidence !== undefined) {
        const selected = new Map<string, RelevantChunkDraft>();
        if (turn.retrieval_evidence.length === 0) {
          throw new Error(`${fixtureId} turn ${i + 1}: empty explicit evidence`);
        }
        turn.retrieval_evidence.forEach(({ filename, quote }) => {
          if (!quote || !fixture.answerable_from.includes(filename)) {
            throw new Error(`${fixtureId} turn ${i + 1}: invalid evidence source or quote`);
          }
          const document = corpus.documents.find((d) => d.filename === filename);
          const matches = document?.chunks.filter((c) => c.text.includes(quote)) ?? [];
          if (matches.length === 0) {
            throw new Error(`${fixtureId} turn ${i + 1}: unresolved evidence in ${filename}: ${quote}`);
          }
          matches.forEach((chunk) => selected.set(chunk.id, {
            chunkId: chunk.id,
            contentHash: chunk.id.split("__").pop() as string,
            filename,
            grade: isRefusal ? 1 : 2,
            evidence: quote,
            locator: `${filename}: verbatim per-turn fixture evidence`,
            claimIds: [],
          }));
        });
        relevant = [...selected.values()];
      } else if (isRefusal) {
        // Refusal notes can name tempting but irrelevant claims. Do not infer that these
        // are gold explanations, or that an unsupported requested value needs no context.
        throw new Error(`${fixtureId} turn ${i + 1}: refusal needs explicit explanatory evidence`);
      }
      if (relevant.length === 0) {
        throw new Error(`${fixtureId} turn ${i + 1}: no evidence resolved; labels not written`);
      }
      return { turn: i + 1, query: turn.content, relevant };
    });

    const label = {
      fixtureId,
      // FixtureLabels.set only admits "committed" | "next"; wave1 replaced both the old
      // committed-30 and next-18 sets and there is no "next" batch right now, so "committed" is
      // the only defensible value here. Flagged in the report — this is a judgment call, not a
      // fact read off the data.
      set: "committed",
      fixtureClass: fixture.class,
      turns,
    };

    outputs.push({ file: `${fixtureId}.json`, body: `${JSON.stringify(label, null, 2)}\n` });

    coverage.push({
      fixtureId,
      fixtureClass: fixture.class,
      isRefusal,
      named,
      resolved,
      unresolved,
      distinctChunks: [...new Set<string>(turns.flatMap((turn: { relevant: RelevantChunkDraft[] }) => turn.relevant.map((chunk) => chunk.chunkId)))],
      written: true,
    });
  });

  outputs.forEach(({ file, body }) => fs.writeFileSync(path.join(outDir, file), body, "utf8"));

  // ---- coverage report ----

  log.info(`${coverage.length} fixtures processed, ${coverage.filter((c) => c.written).length} label files written to ${path.relative(process.cwd(), outDir)}\n`);

  log.info("Per fixture: named / resolved / unresolved claim ids, distinct chunks:");
  coverage.forEach((c) => {
    let tag = "";
    if (c.isRefusal) tag = " [refusal]";
    else if (!c.written) tag = "  <-- NOT WRITTEN, needs manual labelling";
    log.info(`  ${c.fixtureId.padEnd(48)} named=${c.named.length} resolved=${c.resolved.length} unresolved=${c.unresolved.length} chunks=${c.distinctChunks.length}${tag}`);
    if (c.unresolved.length > 0) {
      log.info(`      unresolved: ${c.unresolved.join(", ")}`);
    }
  });

  const noneNamed = coverage.filter((c) => c.named.length === 0);
  log.info(`\nFixtures naming zero claim ids (${noneNamed.length}):`);
  noneNamed.forEach((c) => log.info(`  ${c.fixtureId}${c.isRefusal ? " [explicit per-turn evidence]" : "  <-- NOT a refusal fixture, needs manual labelling"}`));

  const notWritten = coverage.filter((c) => !c.written);
  log.info(`\nFixtures with no label file written (${notWritten.length}):`);
  notWritten.forEach((c) => log.info(`  ${c.fixtureId}`));

  const dist = { 1: 0, 2: 0, "3+": 0 };
  coverage.filter((c) => c.written && !c.isRefusal).forEach((c) => {
    const n = c.distinctChunks.length;
    if (n <= 1) dist[1] += 1;
    else if (n === 2) dist[2] += 1;
    else dist["3+"] += 1;
  });
  log.info("\nDistinct-chunk distribution (non-refusal, written fixtures):");
  log.info(`  1 chunk: ${dist[1]}   2 chunks: ${dist[2]}   3+ chunks: ${dist["3+"]}`);

  const refusalCount = coverage.filter((c) => c.isRefusal).length;
  log.info(`\nRefusal-class fixtures: ${refusalCount}, with explicit per-turn explanatory evidence.`);

  const totalUnresolved = coverage.reduce((sum, c) => sum + c.unresolved.length, 0);
  const totalResolved = coverage.reduce((sum, c) => sum + c.resolved.length, 0);
  log.info(`\nTotals: ${totalResolved} claim ids resolved, ${totalUnresolved} unresolved, across ${coverage.reduce((sum, c) => sum + c.named.length, 0)} named.`);
};

main();
