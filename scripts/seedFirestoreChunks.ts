/**
 * CLI: embed the corpus and upload it, one Firestore document per chunk, for the
 * `firestore-vector` bake-off arm.
 *
 *   npm run ingest && npm run seed:firestore-chunks
 *
 * Reads **`data/corpus/corpus.json`**, the same artifact every other arm loads, rather than
 * re-parsing the PDFs — the one-parse rule (`RETRIEVAL_BAKEOFF.md` §4). If this seeder extracted
 * or re-chunked its own text, extraction differences would surface as answer-quality differences
 * and be misread as one retrieval strategy beating another.
 *
 * Separate from `seed:firestore` on purpose. That one writes `corpus_documents` (one document per
 * file, no embeddings, no cost); this one calls the embedding API. Folding them together would
 * make every corpus re-seed pay for vectors the direct-feed arm never uses.
 *
 * Idempotent by filename, checked **before** embedding, so a re-run costs nothing rather than
 * re-paying for vectors it would then overwrite with identical ones.
 */
import { getFirestore } from "../src/config/database";
import { readCorpus } from "../src/ingestion/ingest";
import { EmbeddingService } from "../src/services/EmbeddingService";
import {
  CHUNK_COLLECTION, chunkDocumentFields, chunkDocumentId,
} from "../src/retrieval/adapters/FirestoreVectorAdapter";
import { createLogger } from "../src/utils/logger";

const log = createLogger("SeedChunks");

/**
 * Firestore commits at most 500 writes per batch. The largest document is ~201 chunks today, so
 * one batch per document fits comfortably — but the cap is asserted rather than assumed, because
 * exceeding it fails the commit rather than degrading.
 */
const MAX_BATCH_WRITES = 500;

const main = async (): Promise<void> => {
  const corpus = readCorpus();
  const db = getFirestore();
  const embeddings = new EmbeddingService();

  log.info(`Artifact: ${corpus.documents.length} documents.`);

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < corpus.documents.length; i += 1) {
    const document = corpus.documents[i];

    // eslint-disable-next-line no-await-in-loop
    const existing = await db
      .collection(CHUNK_COLLECTION)
      .where("filename", "==", document.filename)
      .limit(1)
      .get();

    let skipReason: string | undefined;
    if (!existing.empty) {
      skipReason = "already seeded";
    } else if (document.chunks.length === 0) {
      skipReason = "no surviving chunks";
    } else if (document.chunks.length > MAX_BATCH_WRITES) {
      skipReason = `${document.chunks.length} chunks exceeds the ${MAX_BATCH_WRITES}-write batch limit`;
    }

    if (skipReason) {
      log.info(`  ${document.filename}: ${skipReason}, skipping.`);
      skipped += 1;
    } else {
      log.info(`  ${document.filename}: embedding ${document.chunks.length} chunks…`);
      // eslint-disable-next-line no-await-in-loop
      const vectors = await embeddings.embedDocuments(document.chunks);

      // One batch per document: a failure part-way leaves no half-seeded document for the
      // idempotency check above to later skip over as though it were complete.
      const batch = db.batch();

      document.chunks.forEach((text, chunkIndex) => {
        batch.set(
          db.collection(CHUNK_COLLECTION).doc(chunkDocumentId(document.filename, chunkIndex)),
          chunkDocumentFields(document, chunkIndex, text, vectors[chunkIndex]),
        );
      });

      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      inserted += 1;
    }
  }

  const total = await db.collection(CHUNK_COLLECTION).count().get();

  log.info(
    `Done. ${inserted} document(s) seeded, ${skipped} skipped, `
    + `${total.data().count} chunks in "${CHUNK_COLLECTION}".`,
  );
  log.info("Set DEFAULT_RETRIEVAL=firestore-vector (or send retrieval=firestore-vector) to use it.");
};

main().catch((error: unknown) => {
  log.error("Seeding failed", error instanceof Error ? error : undefined);
  process.exitCode = 1;
});
