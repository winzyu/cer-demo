import { config } from "../config";
import { RetrievalRegistry } from "./RetrievalRegistry";
import { StubAdapter } from "./adapters/StubAdapter";
import { DirectFeedAdapter } from "./adapters/DirectFeedAdapter";
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
 * Registration happens here — one place — so adding a bake-off arm (Firestore vector) is a
 * single line next to the others rather than a side effect scattered through module imports.
 */
export const retrievalRegistry = new RetrievalRegistry();

retrievalRegistry.register(new StubAdapter());
retrievalRegistry.register(new DirectFeedAdapter(createCorpusSource()));

/**
 * Bake-off arm ◆G10. Unlike the pgvector arm — now archived under `archive/pgvector-rag/` — this
 * one survives ◆G7: it runs on the store the service already uses, so keeping it costs no
 * infrastructure even if direct-feed wins.
 *
 * The Firestore client is constructed lazily and holds no connection, so registering this needs
 * no credentials — same reason the direct-feed arm can be registered with a Firestore source in a
 * process that never reads from it.
 */
retrievalRegistry.register(new FirestoreVectorAdapter());

export { RetrievalRegistry } from "./RetrievalRegistry";
export { StubAdapter } from "./adapters/StubAdapter";
export { DirectFeedAdapter } from "./adapters/DirectFeedAdapter";
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
export type {
  Chunk,
  GetContextOptions,
  RetrievalAdapter,
} from "../types/retrieval.types";
