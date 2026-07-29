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
import { CORPUS_COLLECTION } from "../src/retrieval/sources/FirestoreCorpusSource";
import { createLogger } from "../src/utils/logger";

const log = createLogger("Seed");

/** Firestore ids cannot contain "/" and are awkward with spaces; keep them stable and derived. */
const documentId = (filename: string): string => filename.replace(/[^a-zA-Z0-9._-]/g, "_");

const main = async (): Promise<void> => {
  const corpus = readCorpus();
  const db = getFirestore();

  // Batched: one write per document, committed together, so a partial failure does not leave
  // the slice half-populated — which would silently degrade the arm rather than fail it.
  const batch = db.batch();

  corpus.documents.forEach((document) => {
    const ref = db.collection(CORPUS_COLLECTION).doc(documentId(document.filename));
    batch.set(ref, {
      filename: document.filename,
      title: document.title,
      sourceUrl: document.sourceUrl ?? null,
      text: document.text,
      chunks: document.chunks,
      inDirectFeedSlice: document.inDirectFeedSlice,
      chars: document.chars,
      method: document.method,
      generatedAt: corpus.generatedAt,
    });
  });

  await batch.commit();

  const slice = corpus.documents.filter((d) => d.inDirectFeedSlice);
  log.info(`Wrote ${corpus.documents.length} documents to "${CORPUS_COLLECTION}".`);
  log.info(`  direct-feed slice: ${slice.length} documents`);
  log.info("Set CORPUS_SOURCE=firestore to read from Firestore instead of the local artifact.");
};

main().catch((error: unknown) => {
  log.error("Seeding failed", error instanceof Error ? error : undefined);
  process.exitCode = 1;
});
