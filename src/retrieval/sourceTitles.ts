import { CORPUS_OUTPUT, readCorpus } from "../ingestion/ingest";
import type { Chunk } from "../types/retrieval.types";
import { createLogger } from "../utils/logger";

const log = createLogger("SourceTitles");

/**
 * Document titles by citation source (`sourceUrl ?? filename`, what every arm puts on a chunk).
 *
 * Looked up at the response boundary rather than carried on `Chunk`: the prompt reads only
 * `source` and `text`, so a title on the chunk would reach no model anyway, and the arms that
 * build chunks from the embedding cache have no title without regenerating it.
 */
export const loadSourceTitles = (corpusPath: string = CORPUS_OUTPUT): Map<string, string> => {
  try {
    return new Map(readCorpus(corpusPath).documents
      .filter((document) => document.title)
      .map((document) => [document.sourceUrl ?? document.filename, document.title]));
  } catch (error) {
    // A missing artifact costs the page its titles, not the answer: it falls back to the address.
    log.warn(`No document titles for citations: ${(error as Error).message}`);
    return new Map();
  }
};

let cached: Map<string, string> | undefined;

/** The chunks as sent to a caller, each with its document's `title` where the corpus has one. */
export const withSourceTitles = (
  chunks: Chunk[],
  titles: Map<string, string> = (cached ??= loadSourceTitles()),
): Array<Chunk & { title?: string }> => chunks.map((chunk) => {
  const title = titles.get(chunk.source);
  return title ? { ...chunk, title } : chunk;
});
