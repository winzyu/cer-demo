import { config } from "../config";
import { pgVectorQueryClient } from "../config/pgvector";
import { RetrievalRegistry } from "./RetrievalRegistry";
import { StubAdapter } from "./adapters/StubAdapter";
import { DirectFeedAdapter } from "./adapters/DirectFeedAdapter";
import { PgVectorRagAdapter } from "./adapters/PgVectorRagAdapter";
import { FirestoreVectorAdapter } from "./adapters/FirestoreVectorAdapter";
import { ArtifactCorpusSource } from "./sources/ArtifactCorpusSource";
import { FirestoreCorpusSource } from "./sources/FirestoreCorpusSource";
import type { CorpusSource } from "./sources/corpusSource";

/** Builds the corpus source named by `CORPUS_SOURCE`. Construction is cheap and opens nothing. */
export const createCorpusSource = (name = config.retrieval.corpusSource): CorpusSource => (
  name === "firestore" ? new FirestoreCorpusSource() : new ArtifactCorpusSource()
);

/**
 * The process-wide registry, with the built-in adapters registered.
 *
 * Registration happens here — one place — so adding a bake-off arm (pgvector, Firestore vector)
 * is a single line next to the others rather than a side effect scattered through module imports.
 */
export const retrievalRegistry = new RetrievalRegistry();

retrievalRegistry.register(new StubAdapter());
retrievalRegistry.register(new DirectFeedAdapter(createCorpusSource()));

/**
 * ⚠️ Bake-off arm — **delete this registration, the adapter, `src/config/pgvector.ts`, the `pg`
 * dependency and `docker-compose.bakeoff.yml` once ◆G7 resolves.**
 *
 * Registered unconditionally rather than only when `PGVECTOR_URL` is set. A conditional
 * registration would make `DEFAULT_RETRIEVAL=pgvector-rag` fail as "unknown retrieval mode",
 * which reads as a typo; this way it fails as "PGVECTOR_URL is not configured", which is the
 * actual problem. The pool is lazy, so registering costs nothing when the arm is unused.
 */
retrievalRegistry.register(new PgVectorRagAdapter(pgVectorQueryClient));

/**
 * Bake-off arm ◆G10. Unlike the pgvector arm this one survives ◆G7: it runs on the store the
 * service already uses, so keeping it costs no infrastructure even if direct-feed wins.
 *
 * The Firestore client is constructed lazily and holds no connection, so registering this needs
 * no credentials — same reason the direct-feed arm can be registered with a Firestore source in a
 * process that never reads from it.
 */
retrievalRegistry.register(new FirestoreVectorAdapter());

export { RetrievalRegistry } from "./RetrievalRegistry";
export { StubAdapter } from "./adapters/StubAdapter";
export { DirectFeedAdapter } from "./adapters/DirectFeedAdapter";
export { PgVectorRagAdapter } from "./adapters/PgVectorRagAdapter";
export {
  CHUNK_COLLECTION,
  DISTANCE_FIELD,
  DISTANCE_MEASURE,
  FirestoreVectorAdapter,
  VECTOR_FIELD,
  chunkDocumentFields,
  chunkDocumentId,
} from "./adapters/FirestoreVectorAdapter";
export { ArtifactCorpusSource } from "./sources/ArtifactCorpusSource";
export { FirestoreCorpusSource, CORPUS_COLLECTION } from "./sources/FirestoreCorpusSource";
export type { CorpusDocument, CorpusSource } from "./sources/corpusSource";
export { DEFAULT_TOP_K, MAX_TOP_K, resolveTopK } from "./options";
export { HYBRID_FETCH, RRF_K, fuseRrf } from "./rrf";
export type {
  Chunk,
  GetContextOptions,
  RetrievalAdapter,
} from "../types/retrieval.types";
