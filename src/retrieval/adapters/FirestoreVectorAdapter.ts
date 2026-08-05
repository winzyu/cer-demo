import { FieldValue } from "@google-cloud/firestore";
import type { Firestore, VectorValue } from "@google-cloud/firestore";
import { getFirestore } from "../../config/database";
import { EmbeddingService } from "../../services/EmbeddingService";
import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../types/retrieval.types";
import { createLogger } from "../../utils/logger";
import { resolveTopK } from "../options";

const log = createLogger("FirestoreVector");

/**
 * The `firestore-vector` arm: dense RAG on Firestore's own vector search (◆G10).
 *
 * This arm answers a narrower question than the other two: *if RAG wins, is the store we already
 * run good enough, or does winning require standing Postgres back up?* So it is deliberately not
 * a better RAG — it is `pgvector-rag` with the store swapped and the lexical branch removed,
 * because **Firestore has no full-text search** (`RETRIEVAL_BAKEOFF.md` §2). Same chunks, same
 * embedding model, same prefixes, same top-k. The missing lexical branch is the finding, not a
 * shortcut: it is exactly the weakness the legacy hybrid was built to cover, and the eval has a
 * class of exact-token questions ("ORP", "NTU", "KCl creep") aimed at it.
 */

/**
 * Per-chunk collection, separate from `corpus_documents`. It has to be separate: Firestore cannot
 * index a vector held inside an array element, so the one-document-per-file shape the direct-feed
 * arm reads can never carry a searchable embedding.
 */
export const CHUNK_COLLECTION = "corpus_chunks";

/** Must match the vector index created on this collection group. */
export const VECTOR_FIELD = "embedding";

/**
 * Cosine, to match pgvector's `<=>`. Changing this changes every ranking in the arm, and the two
 * RAG arms would no longer be measuring the same notion of similarity.
 */
export const DISTANCE_MEASURE = "COSINE" as const;

/** Where `findNearest` writes the computed distance on each returned document. */
export const DISTANCE_FIELD = "vector_distance";

/**
 * Firestore ids cannot contain "/". Derived and stable, so re-seeding overwrites rather than
 * duplicating. The zero-padded index keeps a document's chunks in reading order under a plain id
 * sort, which makes a seeded collection browsable in the console.
 */
export const chunkDocumentId = (filename: string, chunkIndex: number): string => (
  `${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}__${String(chunkIndex).padStart(4, "0")}`
);

/** The fields the chunk seeder writes. Exactly the fields `getContext` reads back. */
export interface ChunkDocumentFields {
  filename: string;
  title: string;
  sourceUrl: string | null;
  chunkIndex: number;
  text: string;
  embedding: VectorValue;
}

/**
 * Shapes one chunk for Firestore.
 *
 * **The `FieldValue.vector()` wrapper is load-bearing.** Writing a plain `number[]` stores an
 * array, not a vector: the index never matches it, and `findNearest` then returns *nothing, with
 * no error* — the same silent-degradation shape as the `encoding_format` bug that nearly decided
 * this bake-off (see `EmbeddingService`). An arm that retrieves nothing still answers fluently and
 * ungrounded, so it would have read as "Firestore vector search is bad" rather than as a bug.
 *
 * Lives beside the reader for the same reason `corpusDocumentFields` does: a field written here
 * but never read is dead weight, and one read but never written is a runtime `undefined`.
 */
export const chunkDocumentFields = (
  document: { filename: string; title: string; sourceUrl?: string },
  chunkIndex: number,
  text: string,
  embedding: number[],
): ChunkDocumentFields => ({
  filename: document.filename,
  title: document.title,
  sourceUrl: document.sourceUrl ?? null,
  chunkIndex,
  text,
  embedding: FieldValue.vector(embedding),
});

export class FirestoreVectorAdapter implements RetrievalAdapter {
  readonly mode = "firestore-vector";

  private readonly db?: Firestore;

  private readonly embeddings: EmbeddingService;

  constructor(db?: Firestore, embeddings: EmbeddingService = new EmbeddingService()) {
    this.db = db;
    this.embeddings = embeddings;
  }

  async getContext(query: string, opts?: GetContextOptions): Promise<Chunk[]> {
    // Same degenerate-case guards as every other adapter, so the arms stay comparable rather
    // than each inventing its own edge-case behaviour. Guarding before the embedding call also
    // means an empty query costs nothing.
    const topK = resolveTopK(opts);
    if (query.trim() === "" || topK === 0) {
      return [];
    }

    const db = this.db ?? getFirestore();
    const embedding = await this.embeddings.embedQuery(query);

    // `limit` is topK directly, not the pgvector arm's fetch-20. That depth exists to give RRF
    // something to fuse across two branches; with a single branch and no fusion, over-fetching
    // would only pay for reads the arm then discards.
    const snapshot = await db
      .collection(CHUNK_COLLECTION)
      .findNearest({
        vectorField: VECTOR_FIELD,
        queryVector: FieldValue.vector(embedding),
        limit: topK,
        distanceMeasure: DISTANCE_MEASURE,
        distanceResultField: DISTANCE_FIELD,
      })
      .get();

    if (snapshot.docs.length === 0) {
      // Loud, because this is the arm's silent-failure mode. An unseeded collection, a missing
      // vector index, and an embedding written as a plain array all produce zero results with no
      // error — and the model answers anyway, ungrounded.
      log.warn(
        `No chunks matched "${query.slice(0, 60)}". If this repeats, the collection is probably `
        + "unseeded (`npm run seed:firestore-chunks`), the vector index is missing, or the "
        + "embeddings were written as plain arrays instead of FieldValue.vector().",
      );
    }

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      const distance = data[DISTANCE_FIELD] as number | undefined;

      return {
        id: doc.id,
        text: data.text as string,
        // Matches the other two arms' convention so citations are comparable across arms.
        source: (data.sourceUrl as string | null) ?? (data.filename as string),
        // Firestore returns cosine *distance* (0 = identical); pgvector's fused RRF score is
        // higher-is-better. Converting to similarity keeps `score` monotonic in the same
        // direction across arms. The magnitudes are still not comparable — one is a similarity,
        // the other a fused rank score — and nothing in the rubric compares them.
        ...(distance === undefined ? {} : { score: 1 - distance }),
      };
    });
  }
}
