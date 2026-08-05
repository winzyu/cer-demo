import type { Firestore } from "@google-cloud/firestore";
import { getFirestore } from "../../config/database";
import type { CorpusDocument, CorpusSource } from "./corpusSource";

/** Collection holding one document per corpus file. Written by `npm run seed:firestore`. */
export const CORPUS_COLLECTION = "corpus_documents";

/**
 * Firestore's hard per-document ceiling. Not a tunable — exceeding it fails the write.
 *
 * The real limit counts field names, index entries and overhead on top of the values, so the
 * guard below leaves headroom rather than measuring to the byte.
 */
export const FIRESTORE_DOCUMENT_LIMIT_BYTES = 1_048_576;

/** Refuse to attempt a write above this. ~10% below the hard limit. */
export const CORPUS_DOCUMENT_WARN_BYTES = 943_718;

/** The fields `seed:firestore` writes. Exactly the fields something reads — see below. */
export interface CorpusDocumentFields {
  filename: string;
  title: string;
  sourceUrl: string | null;
  text: string;
  inDirectFeedSlice: boolean;
  chars: number;
  method: string;
  generatedAt: string;
}

/**
 * Shapes one corpus document for Firestore.
 *
 * **`chunks` is deliberately not stored** (removed 2026-08-03). Nothing read it: the direct-feed
 * arm reads `text`, the pgvector seeder reads `data/corpus/corpus.json` directly, and the vector
 * arm needs its own per-chunk collection anyway — Firestore cannot index a vector inside an array
 * element. Storing it made `volunteer_stream_monitoring_a_methods_manual.pdf` serialise to
 * **1,005,018 bytes against a 1,048,576-byte limit — 96% full, ~43 KB of headroom**, so one
 * additional chunk would have broken seeding. Dropping it takes that document to **478,584 bytes
 * (46%)** and every other document below 17%.
 *
 * Lives beside the reader on purpose: a field written here but not read by `loadSlice` is dead
 * weight paid for on every seed, and a field read there but not written here is a runtime
 * `undefined`. Keeping both in one file is what makes that drift visible.
 */
export const corpusDocumentFields = (
  document: {
    filename: string;
    title: string;
    sourceUrl?: string;
    text: string;
    inDirectFeedSlice: boolean;
    chars: number;
    method: string;
  },
  generatedAt: string,
): CorpusDocumentFields => ({
  filename: document.filename,
  title: document.title,
  sourceUrl: document.sourceUrl ?? null,
  text: document.text,
  inDirectFeedSlice: document.inDirectFeedSlice,
  chars: document.chars,
  method: document.method,
  generatedAt,
});

/**
 * Approximate serialised size of a corpus document.
 *
 * Approximate is enough: it exists to catch a document drifting toward the ceiling while there is
 * still room to react, not to predict Firestore's accounting exactly.
 */
export const corpusDocumentBytes = (fields: CorpusDocumentFields): number => (
  Buffer.byteLength(JSON.stringify(fields), "utf8")
);

/**
 * Reads the slice from Firestore. Use this for measured bake-off runs so Firestore's read costs
 * are counted rather than assumed.
 *
 * Documents are ordered by `filename` so the prompt prefix is byte-identical between runs —
 * Firestore does not guarantee order otherwise, and an unstable order would silently destroy the
 * prompt-cache hit rate the direct-feed arm's entire cost case depends on.
 */
export class FirestoreCorpusSource implements CorpusSource {
  readonly name = "firestore";

  private readonly db?: Firestore;

  constructor(db?: Firestore) {
    this.db = db;
  }

  async loadSlice(): Promise<CorpusDocument[]> {
    const db = this.db ?? getFirestore();

    const snapshot = await db
      .collection(CORPUS_COLLECTION)
      .where("inDirectFeedSlice", "==", true)
      .orderBy("filename")
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        filename: data.filename as string,
        title: data.title as string,
        sourceUrl: data.sourceUrl as string | undefined,
        text: data.text as string,
      };
    });
  }
}
