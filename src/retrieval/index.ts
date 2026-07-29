import { config } from "../config";
import { RetrievalRegistry } from "./RetrievalRegistry";
import { StubAdapter } from "./adapters/StubAdapter";
import { DirectFeedAdapter } from "./adapters/DirectFeedAdapter";
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

export { RetrievalRegistry } from "./RetrievalRegistry";
export { StubAdapter } from "./adapters/StubAdapter";
export { DirectFeedAdapter } from "./adapters/DirectFeedAdapter";
export { ArtifactCorpusSource } from "./sources/ArtifactCorpusSource";
export { FirestoreCorpusSource, CORPUS_COLLECTION } from "./sources/FirestoreCorpusSource";
export type { CorpusDocument, CorpusSource } from "./sources/corpusSource";
export { DEFAULT_TOP_K, MAX_TOP_K, resolveTopK } from "./options";
export type {
  Chunk,
  GetContextOptions,
  RetrievalAdapter,
} from "../types/retrieval.types";
