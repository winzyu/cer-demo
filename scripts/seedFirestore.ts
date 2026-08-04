/**
 * CLI: upload the ingestion artifact to Firestore.
 *
 *   npm run ingest && npm run seed:firestore
 *
 * Idempotent — document ids are derived from the filename, so re-running overwrites rather than
 * duplicating. Requires Firestore credentials; `npm run ingest` alone does not.
 */
import { getFirestore } from "../src/config/database";
import { readCorpus } from "../src/ingestion/ingest";
import {
  CORPUS_COLLECTION, CORPUS_DOCUMENT_WARN_BYTES, corpusDocumentBytes, corpusDocumentFields,
} from "../src/retrieval/sources/FirestoreCorpusSource";
import { createLogger } from "../src/utils/logger";

const log = createLogger("Seed");

/** Firestore ids cannot contain "/" and are awkward with spaces; keep them stable and derived. */
const documentId = (filename: string): string => filename.replace(/[^a-zA-Z0-9._-]/g, "_");

const main = async (): Promise<void> => {
  const corpus = readCorpus();
  const db = getFirestore();

  const shaped = corpus.documents.map((document) => ({
    document,
    fields: corpusDocumentFields(document, corpus.generatedAt),
  }));

  // Size-check every document BEFORE writing anything. Firestore rejects an oversized document at
  // commit time with an error that names the batch, not the file — and because the writes are
  // batched, one bad document fails the whole seed. Checking up front names the culprit.
  const oversized = shaped.filter(({ fields }) => corpusDocumentBytes(fields) > CORPUS_DOCUMENT_WARN_BYTES);

  if (oversized.length > 0) {
    const detail = oversized
      .map(({ document, fields }) => `  ${document.filename}: ${corpusDocumentBytes(fields).toLocaleString()} bytes`)
      .join("\n");
    throw new Error(
      `${oversized.length} document(s) are at or near Firestore's 1,048,576-byte limit:\n${detail}\n`
      + "Split the document or store its text outside Firestore — do not raise the threshold.",
    );
  }

  // Batched: one write per document, committed together, so a partial failure does not leave
  // the slice half-populated — which would silently degrade the arm rather than fail it.
  const batch = db.batch();

  shaped.forEach(({ document, fields }) => {
    batch.set(db.collection(CORPUS_COLLECTION).doc(documentId(document.filename)), fields);
  });

  await batch.commit();

  const slice = corpus.documents.filter((d) => d.inDirectFeedSlice);
  const largest = Math.max(...shaped.map(({ fields }) => corpusDocumentBytes(fields)));

  log.info(`Wrote ${corpus.documents.length} documents to "${CORPUS_COLLECTION}".`);
  log.info(`  direct-feed slice: ${slice.length} documents`);
  log.info(`  largest document:  ${largest.toLocaleString()} bytes (${((largest / 1_048_576) * 100).toFixed(1)}% of the limit)`);
  log.info("Set CORPUS_SOURCE=firestore to read from Firestore instead of the local artifact.");
};

main().catch((error: unknown) => {
  log.error("Seeding failed", error instanceof Error ? error : undefined);
  process.exitCode = 1;
});
