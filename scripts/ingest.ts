/**
 * CLI: parse `documents/` into `data/corpus/corpus.json`.
 *
 *   npm run ingest
 *
 * Idempotent — re-running overwrites the artifact from the same sources. Prints a summary
 * including the direct-feed slice size, which is the ◆G9 number the bake-off depends on.
 */
import {
  CORPUS_OUTPUT, estimateTokens, ingestCorpus, writeCorpus,
} from "../src/ingestion/ingest";
import { createLogger } from "../src/utils/logger";

const log = createLogger("Ingest");

const main = async (): Promise<void> => {
  const corpus = await ingestCorpus();
  writeCorpus(corpus);

  const totalChars = corpus.documents.reduce((sum, d) => sum + d.chars, 0);
  const totalChunks = corpus.documents.reduce((sum, d) => sum + d.chunks.length, 0);
  const sliceChars = corpus.documents
    .filter((d) => d.inDirectFeedSlice)
    .reduce((sum, d) => sum + d.chars, 0);

  log.info(`Wrote ${CORPUS_OUTPUT}`);
  log.info(`  documents:        ${corpus.documents.length}`);
  log.info(`  total chars:      ${totalChars.toLocaleString()} (~${estimateTokens(totalChars).toLocaleString()} tokens)`);
  log.info(`  surviving chunks: ${totalChunks}`);
  log.info(`  direct-feed slice: ${sliceChars.toLocaleString()} chars (~${estimateTokens(sliceChars).toLocaleString()} tokens)`);
};

main().catch((error: unknown) => {
  log.error("Ingestion failed", error instanceof Error ? error : undefined);
  process.exitCode = 1;
});
