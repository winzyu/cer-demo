import fs from "fs";
import path from "path";
import { readCorpus } from "../../ingestion/ingest";
import type { FixtureLabels, LabelledQuery, RelevanceGrade } from "./types";

/**
 * Loads and validates the retrieval labels, in the same strict-and-loud style as the fixture
 * loader (`src/eval/fixtures.ts`): collect every problem, then throw once.
 *
 * The validation that matters is **chunk-id existence**. A label pointing at a chunk that is not
 * in the corpus scores as an eternal miss, and it looks exactly like a retriever failing. Since
 * chunk ids are content-derived, editing a labelled passage changes its id — so a stale label
 * surfaces here, at load, rather than as a mysterious recall drop nobody can reproduce.
 */

export const LABEL_DIR = path.resolve(__dirname, "../../../eval/retrieval-labels");

const isGrade = (value: unknown): value is RelevanceGrade => (
  value === 0 || value === 1 || value === 2
);

export interface LoadedLabels {
  fixtures: FixtureLabels[];
  /** Every labelled turn, flattened — what the runner iterates. */
  queries: Array<{ fixtureId: string; fixtureClass: string; label: LabelledQuery }>;
}

export const loadLabels = (
  dir: string = LABEL_DIR,
  corpusPath: string | undefined = undefined,
): LoadedLabels => {
  if (!fs.existsSync(dir)) {
    throw new Error(
      `No retrieval labels at ${dir}. They are the ground truth for \`npm run retrieval:eval\`; `
      + "see docs/RETRIEVAL_LABELS.md.",
    );
  }

  const corpus = readCorpus(corpusPath);
  const knownChunks = new Map<string, string>();
  corpus.documents.forEach((document) => {
    document.chunks.forEach((chunk) => knownChunks.set(chunk.id, chunk.text));
  });

  const filenames = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  if (filenames.length === 0) {
    throw new Error(`No label files found in ${dir}.`);
  }

  const errors: string[] = [];
  const fixtures: FixtureLabels[] = [];

  filenames.forEach((filename) => {
    const where = `eval/retrieval-labels/${filename}`;
    const raw = JSON.parse(fs.readFileSync(path.join(dir, filename), "utf8")) as FixtureLabels;

    if (raw.fixtureId !== filename.replace(/\.json$/, "")) {
      errors.push(`${where}: fixtureId "${raw.fixtureId}" must match the filename stem.`);
    }
    if (raw.set !== "committed" && raw.set !== "next") {
      errors.push(`${where}: set must be "committed" or "next".`);
    }
    if (typeof raw.fixtureClass !== "string" || raw.fixtureClass.trim() === "") {
      errors.push(`${where}: fixtureClass must be a non-empty string.`);
    }
    if (!Array.isArray(raw.turns) || raw.turns.length === 0) {
      errors.push(`${where}: turns must be a non-empty array.`);
      return;
    }

    raw.turns.forEach((turn, index) => {
      const at = `${where}.turns[${index}]`;
      if (typeof turn.query !== "string" || turn.query.trim() === "") {
        errors.push(`${at}.query must be a non-empty string.`);
      }
      if (!Array.isArray(turn.relevant)) {
        errors.push(`${at}.relevant must be an array.`);
        return;
      }
      if (turn.relevant.length === 0 && turn.noRelevantChunks === undefined) {
        // Silence is ambiguous: "nothing is relevant" and "nobody labelled this yet" score the
        // same and mean opposite things. The reason string is what separates them.
        errors.push(`${at}: empty relevant[] requires a noRelevantChunks reason.`);
      }
      turn.relevant.forEach((chunk, ci) => {
        const cat = `${at}.relevant[${ci}]`;
        if (!isGrade(chunk.grade)) {
          errors.push(`${cat}.grade must be 0, 1 or 2.`);
        }
        const text = knownChunks.get(chunk.chunkId);
        if (text === undefined) {
          errors.push(`${cat}.chunkId "${chunk.chunkId}" is not in the corpus artifact.`);
        } else if (typeof chunk.evidence === "string" && chunk.evidence.trim() !== ""
          && !text.includes(chunk.evidence)) {
          // Evidence is what makes a label auditable. If it is not literally in the chunk, the
          // label was written from memory or from a different chunk.
          errors.push(`${cat}.evidence is not a verbatim substring of chunk "${chunk.chunkId}".`);
        }
      });
    });

    fixtures.push(raw);
  });

  if (errors.length > 0) {
    throw new Error(`Invalid retrieval labels:\n- ${errors.join("\n- ")}`);
  }

  const queries = fixtures.flatMap((fixture) => fixture.turns.map((label) => ({
    fixtureId: fixture.fixtureId,
    fixtureClass: fixture.fixtureClass,
    label,
  })));

  return { fixtures, queries };
};
