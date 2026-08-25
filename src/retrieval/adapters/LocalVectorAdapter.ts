import fs from "fs";
import path from "path";
import { config } from "../../config";
import { EMBEDDING_DIMENSIONS, EmbeddingService } from "../../services/EmbeddingService";
import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../types/retrieval.types";
import { createLogger } from "../../utils/logger";
import { resolveTopK } from "../options";

const log = createLogger("LocalVector");

/**
 * The `local-vector` arm: exact cosine similarity over the whole corpus, in process.
 *
 * Same embeddings, same distance measure, same top-k as `firestore-vector` — the only thing that
 * changes is where the vectors live and who computes the distance. The corpus is 393 chunks ×
 * 768 dimensions ≈ 1.2 MB, so "the whole index" is smaller than a single PDF in `documents/` and
 * an exhaustive scan costs well under a millisecond. There is no approximation to tune and no
 * index to create.
 *
 * Two things motivate it over the Firestore arm rather than replacing it:
 *
 * - **Cost and determinism for the eval harness.** Retrieval tuning currently pays per-query
 *   Firestore reads and an LLM sweep per iteration. With the cache built once, a retrieval-only
 *   sweep is free, offline, and byte-identical run to run.
 * - **No silent-empty failure.** `findNearest` returns *nothing, with no error* when the
 *   collection is unseeded, the vector index is missing, or an embedding was written as a plain
 *   `number[]` instead of `FieldValue.vector()` — and the model then answers fluently and
 *   ungrounded. Every equivalent condition here (no cache, wrong model, wrong width, a
 *   degenerate vector) throws with the command that fixes it. That is the entire argument for
 *   this adapter, so nothing in it may return `[]` for a setup problem.
 *
 * Firestore's vector index on `corpus_chunks` is configured `flat` — exhaustive, not approximate
 * — so given the same embeddings the two arms should rank *identically*.
 * `scripts/compareVectorArms.ts` checks that rather than assuming it.
 */

/**
 * Where the pre-built cache lives. Repo-relative like `CORPUS_OUTPUT`, and under the same
 * git-ignored `data/` tree: the cache is derived, machine-local, and does **not** travel with a
 * clone. A fresh checkout has to run `npm run embed:cache` before this arm works.
 */
export const EMBEDDING_CACHE_PATH = path.join("data", "embeddings", "cache.json");

/** The command that produces (or repairs) the cache. Named in every failure message below. */
export const BUILD_COMMAND = "npm run embed:cache";

/**
 * One cached chunk: its identity, its vector, and everything `getContext` needs to return a
 * `Chunk` without re-reading `corpus.json`.
 *
 * `id` is carried *inside* the entry rather than used as an object key, even though the cache is
 * keyed by id for reuse purposes. A map from id to a body that also holds an id has two places to
 * disagree; an array of self-describing entries has one, and it preserves corpus order so a
 * rebuild produces a reviewable diff.
 */
export interface CachedChunk {
  id: string;
  /** `sourceUrl ?? filename`, matching what the other arms put on a citation. */
  source: string;
  text: string;
  embedding: number[];
}

/**
 * The on-disk artifact.
 *
 * The header exists so a cache built with one embedding model can never be *mixed* with, or
 * silently searched by, another. Vectors from two models share a dimension count and nothing
 * else: cosine between them is noise that looks exactly like a working ranking.
 */
export interface EmbeddingCache {
  /** Fireworks model id the vectors came from — must equal `config.fireworks.embeddingModel`. */
  model: string;
  dimensions: number;
  /** Redundant with `chunks.length`, and checked against it: a truncated write is detectable. */
  chunkCount: number;
  generatedAt: string;
  chunks: CachedChunk[];
}

/** Dot product of two equal-length vectors. Exported because the cosine math is worth testing. */
export const dotProduct = (a: number[], b: number[]): number => {
  if (a.length !== b.length) {
    throw new Error(`Cannot take a dot product of ${a.length} and ${b.length} dimensions.`);
  }
  // An index loop rather than `reduce`: this runs 393 times per query over 768 floats, and the
  // allocation-free form is the one that keeps a full-corpus scan in the microsecond range.
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
};

/** Euclidean norm. Zero means a degenerate vector — see the guards below. */
export const magnitude = (vector: number[]): number => Math.sqrt(dotProduct(vector, vector));

/**
 * Cosine similarity, higher-is-better, in [-1, 1].
 *
 * Firestore reports cosine *distance* and `FirestoreVectorAdapter` returns `1 - distance`, which
 * is this same quantity. The two arms' `score` fields are therefore directly comparable — that is
 * what makes the equivalence check a diff of ids *and* scores rather than ids alone.
 */
export const cosineSimilarity = (a: number[], b: number[]): number => {
  const denominator = magnitude(a) * magnitude(b);
  if (denominator === 0) {
    throw new Error("Cosine similarity is undefined for a zero vector.");
  }
  return dotProduct(a, b) / denominator;
};

/** A cached chunk with its norm precomputed, so a query costs one dot product per chunk. */
interface IndexedChunk extends CachedChunk {
  norm: number;
}

interface LocalVectorIndex {
  model: string;
  dimensions: number;
  chunks: IndexedChunk[];
}

/** Wrapped so every failure path names the same fix. */
const cacheError = (cachePath: string, problem: string): Error => new Error(
  `Embedding cache at ${cachePath} ${problem} Run \`${BUILD_COMMAND}\` to rebuild it.`,
);

/**
 * Validates a parsed cache against what this process expects, collecting every problem before
 * throwing — the same fail-once-with-the-whole-list shape `src/config/index.ts` uses. A cache
 * that fails here is never partially used: an arm running on half a valid index is exactly the
 * quiet degradation this adapter exists to remove.
 */
export const validateEmbeddingCache = (
  cache: EmbeddingCache,
  cachePath: string,
  expectedModel: string = config.fireworks.embeddingModel,
): void => {
  const errors: string[] = [];

  if (cache.model !== expectedModel) {
    errors.push(
      `was built with model "${cache.model}" but this process is configured for `
      + `"${expectedModel}". Vectors from two models are not comparable`,
    );
  }
  if (cache.dimensions !== EMBEDDING_DIMENSIONS) {
    errors.push(`declares ${cache.dimensions} dimensions; this build expects ${EMBEDDING_DIMENSIONS}`);
  }
  if (!Array.isArray(cache.chunks) || cache.chunks.length === 0) {
    // An empty index would rank nothing and return nothing — the silent-empty result again.
    errors.push("holds no chunks");
  } else {
    if (cache.chunkCount !== cache.chunks.length) {
      errors.push(
        `declares ${cache.chunkCount} chunks but holds ${cache.chunks.length}, so the write was `
        + "interrupted or the file was edited by hand",
      );
    }

    const wrongWidth = cache.chunks.find((chunk) => chunk.embedding.length !== cache.dimensions);
    if (wrongWidth) {
      errors.push(
        `holds a ${wrongWidth.embedding.length}-dimension vector for chunk "${wrongWidth.id}"`,
      );
    }

    // The `encoding_format` bug's signature (see `EmbeddingService`): right shape, no meaning.
    // `EmbeddingService` rejects these at build time, so reaching here means the file was
    // hand-edited or truncated — still worth catching, because cosine against a zero vector is
    // undefined and would rank arbitrarily instead of failing.
    const degenerate = cache.chunks.find((chunk) => chunk.embedding.every((v) => v === 0));
    if (degenerate) {
      errors.push(`holds an all-zero vector for chunk "${degenerate.id}"`);
    }
  }

  if (errors.length > 0) {
    throw cacheError(cachePath, `is unusable:\n  - ${errors.join("\n  - ")}\n `);
  }
};

/** Reads and validates the cache. Throws — never returns an empty or partial index. */
export const readEmbeddingCache = (
  cachePath: string = EMBEDDING_CACHE_PATH,
  expectedModel: string = config.fireworks.embeddingModel,
): EmbeddingCache => {
  if (!fs.existsSync(cachePath)) {
    throw new Error(
      `Embedding cache not found at ${cachePath}. Run \`${BUILD_COMMAND}\` to build it `
      + "(it is derived from data/corpus/corpus.json and is not checked into the repo).",
    );
  }

  let cache: EmbeddingCache;
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, "utf8")) as EmbeddingCache;
  } catch (error) {
    throw cacheError(cachePath, `is not valid JSON (${(error as Error).message}).`);
  }

  validateEmbeddingCache(cache, cachePath, expectedModel);
  return cache;
};

export class LocalVectorAdapter implements RetrievalAdapter {
  readonly mode = "local-vector";

  private readonly cachePath: string;

  private readonly embeddings: EmbeddingService;

  /**
   * The index is identical on every request, so it is read and normed once per process — the
   * same reason `DirectFeedAdapter` caches its slice. A failure is deliberately *not* cached:
   * rebuilding the cache should fix the arm without restarting the service.
   */
  private index?: LocalVectorIndex;

  constructor(cachePath: string = EMBEDDING_CACHE_PATH, embeddings = new EmbeddingService()) {
    this.cachePath = cachePath;
    this.embeddings = embeddings;
  }

  async getContext(query: string, opts?: GetContextOptions): Promise<Chunk[]> {
    // Same degenerate-case guards as every other adapter, so the arms stay comparable rather
    // than each inventing its own edge-case behaviour. Guarding first also means an empty query
    // costs nothing — here that is the one network call this adapter makes.
    const topK = resolveTopK(opts);
    if (query.trim() === "" || topK === 0) {
      return [];
    }

    // Loaded *before* embedding: a missing or mismatched cache is a setup problem, and paying
    // the embedding API to discover it would be waste on top of a failure.
    const index = this.load();

    const embedding = await this.embeddings.embedQuery(query);
    if (embedding.length !== index.dimensions) {
      throw cacheError(
        this.cachePath,
        `holds ${index.dimensions}-dimension vectors but the query embedded to `
        + `${embedding.length}, so the configured embedding model changed since it was built.`,
      );
    }

    const queryNorm = magnitude(embedding);
    if (queryNorm === 0) {
      // `EmbeddingService` already rejects all-zero vectors; this is the last line before the
      // arithmetic, where a zero norm would silently produce NaN scores and an arbitrary order.
      throw new Error(
        `Query "${query.slice(0, 60)}" embedded to an all-zero vector — cosine is undefined. `
        + "Check that `encoding_format` is still being sent (see EmbeddingService).",
      );
    }

    return index.chunks
      .map((chunk) => ({
        chunk,
        score: dotProduct(embedding, chunk.embedding) / (queryNorm * chunk.norm),
      }))
      // Ties are broken by id so a ranking is reproducible across runs and machines. Firestore's
      // own tie-break is unspecified, so an exact-tie disagreement between the arms is expected
      // and is not evidence that the two indexes differ.
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, topK)
      .map(({ chunk, score }) => ({
        id: chunk.id,
        text: chunk.text,
        source: chunk.source,
        score,
      }));
  }

  private load(): LocalVectorIndex {
    if (!this.index) {
      const cache = readEmbeddingCache(this.cachePath, config.fireworks.embeddingModel);

      const chunks = cache.chunks.map((chunk) => ({ ...chunk, norm: magnitude(chunk.embedding) }));

      // Validation already rejected all-zero vectors, so any zero norm left here is a vector of
      // values too small to square into a representable norm. Caught rather than divided by.
      const zero = chunks.find((chunk) => chunk.norm === 0);
      if (zero) {
        throw cacheError(this.cachePath, `holds a zero-norm vector for chunk "${zero.id}".`);
      }

      log.info(
        `Loaded ${chunks.length} chunks × ${cache.dimensions} dims from ${this.cachePath} `
        + `(model ${cache.model}, built ${cache.generatedAt}).`,
      );

      this.index = { model: cache.model, dimensions: cache.dimensions, chunks };
    }
    return this.index;
  }
}
