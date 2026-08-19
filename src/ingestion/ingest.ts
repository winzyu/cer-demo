import fs from "fs";
import path from "path";
import { chunkText, filterChunks } from "./chunk";
import {
  DIRECT_FEED_SLICE, EXCLUDED_FILES, INGESTIBLE_EXTENSIONS, metaFor,
} from "./corpus";
import { extractText, type ExtractionMethod } from "./extract";
import { createLogger } from "../utils/logger";

const log = createLogger("Ingest");

export const DOCUMENTS_DIR = "documents";
export const CORPUS_OUTPUT = path.join("data", "corpus", "corpus.json");

export interface IngestedDocument {
  filename: string;
  title: string;
  sourceUrl?: string;
  method: ExtractionMethod;
  pages?: number;
  chars: number;
  /** Whole extracted text — what the direct-feed arm consumes. */
  text: string;
  /** Quality-filtered chunks — what the vector arms embed. */
  chunks: string[];
  chunksBeforeFilter: number;
  inDirectFeedSlice: boolean;
}

export interface Corpus {
  generatedAt: string;
  documents: IngestedDocument[];
}

/** Extracts, chunks, and filters one document. Returns null if nothing survives the filter. */
const ingestDocument = async (
  documentsDir: string,
  filename: string,
): Promise<IngestedDocument | null> => {
  const { text, method, pages } = await extractText(path.join(documentsDir, filename));

  const raw = chunkText(text);
  // `.md`/`.txt` are authored, structured text: a low alphabetic ratio there means a table,
  // not OCR noise. See QualityOptions.checkAlphaRatio.
  const chunks = filterChunks(raw, { checkAlphaRatio: method !== "text" });

  if (chunks.length === 0) {
    // Legacy behavior: a document with no surviving chunks is skipped entirely.
    log.warn(`${filename}: no chunks survived the quality filter — skipped.`);
    return null;
  }

  const meta = metaFor(filename);
  log.info(
    `${filename}: ${text.length} chars, ${chunks.length}/${raw.length} chunks kept (${method}).`,
  );

  return {
    filename,
    title: meta.title,
    sourceUrl: meta.sourceUrl,
    method,
    pages,
    chars: text.length,
    text,
    chunks,
    chunksBeforeFilter: raw.length,
    inDirectFeedSlice: DIRECT_FEED_SLICE.includes(filename),
  };
};

/**
 * Parses the corpus **once** into a deterministic artifact that every bake-off arm loads from.
 *
 * This is the important design choice: if each arm parsed the PDFs itself, differences in
 * extraction or chunking could show up as differences in answer quality and be misread as the
 * retrieval strategy winning or losing. Parsing once makes "same corpus source files" an actual
 * guarantee rather than an intention (docs/RETRIEVAL_BAKEOFF.md §4).
 *
 * Writing to disk rather than straight to Firestore also keeps the parse re-runnable without
 * credentials, and lets an arm with its own store seed from the artifact without touching
 * Firestore at all.
 */
export const ingestCorpus = async (
  documentsDir = DOCUMENTS_DIR,
): Promise<Corpus> => {
  const filenames = fs
    .readdirSync(documentsDir)
    .filter((name) => INGESTIBLE_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .filter((name) => !EXCLUDED_FILES.includes(name))
    .sort();

  const documents: IngestedDocument[] = [];

  // Sequential on purpose: extraction is memory-hungry (one 7.5 MB PDF here), and the
  // per-document log line is the progress indicator for a run that takes a while.
  // eslint-disable-next-line no-restricted-syntax
  for await (const filename of filenames) {
    // eslint-disable-next-line no-await-in-loop
    const document = await ingestDocument(documentsDir, filename);
    if (document) {
      documents.push(document);
    }
  }

  return { generatedAt: new Date().toISOString(), documents };
};

export const writeCorpus = (corpus: Corpus, outputPath = CORPUS_OUTPUT): void => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(corpus, null, 2), "utf8");
};

export const readCorpus = (inputPath = CORPUS_OUTPUT): Corpus => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Corpus artifact not found at ${inputPath}. Run \`npm run ingest\` first.`);
  }
  return JSON.parse(fs.readFileSync(inputPath, "utf8")) as Corpus;
};

/** Rough token estimate at the legacy 4-chars-per-token heuristic (MIGRATION_SPEC.md §10.1). */
export const estimateTokens = (chars: number): number => Math.round(chars / 4);
