import { RetrievalRegistry } from "./RetrievalRegistry";
import { StubAdapter } from "./adapters/StubAdapter";

/**
 * The process-wide registry, with the built-in adapters registered.
 *
 * Registration happens here — one place — so adding a bake-off arm (direct-feed,
 * pgvector, Firestore vector) is a single line next to the others rather than a
 * side effect scattered through module imports.
 */
export const retrievalRegistry = new RetrievalRegistry();

retrievalRegistry.register(new StubAdapter());

export { RetrievalRegistry } from "./RetrievalRegistry";
export { StubAdapter } from "./adapters/StubAdapter";
export { DEFAULT_TOP_K, MAX_TOP_K, resolveTopK } from "./options";
export type {
  Chunk,
  GetContextOptions,
  RetrievalAdapter,
} from "../types/retrieval.types";
