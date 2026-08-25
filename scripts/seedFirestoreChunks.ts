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

/**
 * Deletes every chunk document, in batches.
 *
 * **Why this had to exist.** The seeder is idempotent by *filename*: it skips a document already
 * present and never deletes. That is right for re-running after an interruption and wrong after a
 * corpus change, and the failure is silent — on 2026-08-24 this collection still held 305 chunks
 * under the pre-2026-08-24 positional id scheme, 289 of them belonging to files that had left the
 * corpus (`tm9a6.2.pdf`, `tm9a6.8.pdf`, the volunteer manual). `firestore-vector` was retrieving
 * from a corpus that no longer existed, and nothing in a re-seed would ever have corrected it.
 *
 * Chunk ids are content-derived now, so a changed chunk writes a *new* document rather than
 * overwriting the old one — which makes stale accumulation the default, not the exception. Hence
 * an explicit wipe rather than a smarter merge.
 */
const wipeChunks = async (db: FirebaseFirestore.Firestore): Promise<number> => {
  let deleted = 0;
  // Paged rather than one query: the collection can exceed a single batch's 500-write limit.
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(CHUNK_COLLECTION).limit(MAX_BATCH_WRITES).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
    deleted += snapshot.size;
    log.info(`  deleted ${deleted}…`);
  }
  return deleted;
};

const main = async (): Promise<void> => {
  const corpus = readCorpus();
  const db = getFirestore();
  const embeddings = new EmbeddingService();

  if (process.argv.includes("--wipe")) {
    log.warn(`--wipe: deleting every document in "${CHUNK_COLLECTION}" before seeding.`);
    const deleted = await wipeChunks(db);
    log.info(`Wiped ${deleted} chunk documents.`);
  }

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
      const vectors = await embeddings.embedDocuments(document.chunks.map((c) => c.text));

      // One batch per document: a failure part-way leaves no half-seeded document for the
      // idempotency check above to later skip over as though it were complete.
      const batch = db.batch();

      document.chunks.forEach((chunk, chunkIndex) => {
        batch.set(
          db.collection(CHUNK_COLLECTION).doc(chunkDocumentId(chunk)),
          chunkDocumentFields(document, chunk, vectors[chunkIndex]),
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
