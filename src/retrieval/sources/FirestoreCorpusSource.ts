import type { Firestore } from "@google-cloud/firestore";
import { getFirestore } from "../../config/database";
import type { CorpusDocument, CorpusSource } from "./corpusSource";

/** Collection holding one document per corpus file. Written by `npm run seed:firestore`. */
export const CORPUS_COLLECTION = "corpus_documents";

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
