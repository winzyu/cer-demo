import OpenAI from "openai";
import createError from "http-errors";
import { config } from "../config";
import { createLogger } from "../utils/logger";

const log = createLogger("Embedding");

/**
 * Fireworks embeddings for the Phase N2 RAG arms (`MIGRATION_SPEC.md` §4.4).
 *
 * Only the vector arms need this. The direct-feed arm needs no embedding model at all — which is
 * itself one of the cost differences the bake-off is measuring.
 */

/** `nomic-ai/nomic-embed-text-v1.5` — must match `VECTOR(768)` in the schema. */
export const EMBEDDING_DIMENSIONS = 768;

/** Legacy ingestion batch size, kept for parity (`MIGRATION_SPEC.md` §4.4). */
export const EMBED_BATCH = 32;

/**
 * nomic-embed-text-v1.5 is an **asymmetric** model: it is trained with distinct task prefixes for
 * the query side and the document side, and dropping them measurably degrades retrieval. The
 * migration checklist calls this out specifically — it is the kind of omission that produces a
 * working-but-worse system with no error anywhere.
 *
 * Both prefixes include the trailing space; it is part of the token sequence the model expects.
 */
export const QUERY_PREFIX = "search_query: ";
export const DOCUMENT_PREFIX = "search_document: ";

let client: OpenAI | undefined;

/** Lazy and memoized, like the chat client — importing this must not require credentials. */
const getClient = (): OpenAI => {
  if (!client) {
    const { apiKey, baseUrl } = config.fireworks;
    if (!apiKey) {
      throw createError(503, "FIREWORKS_API_KEY is not configured.");
    }
    client = new OpenAI({ apiKey, baseURL: baseUrl });
  }
  return client;
};

/** Splits into fixed-size batches. Exported because the batching boundary is worth testing. */
export const batched = <T>(items: T[], size: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

export class EmbeddingService {
  private readonly openai?: OpenAI;

  constructor(openai?: OpenAI) {
    this.openai = openai;
  }

  /** Embeds a search query. Single-item by definition — one query, one vector. */
  async embedQuery(query: string): Promise<number[]> {
    const [vector] = await this.embed([`${QUERY_PREFIX}${query}`]);
    return vector;
  }

  /** Embeds corpus chunks for ingestion, in batches of `EMBED_BATCH`. */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    const batches = batched(texts, EMBED_BATCH);
    const vectors: number[][] = [];

    for (let i = 0; i < batches.length; i += 1) {
      // Sequential on purpose: parallel batches would hit rate limits on a serverless endpoint,
      // and ingestion is a one-off that does not need the throughput.
      // eslint-disable-next-line no-await-in-loop
      const batch = await this.embed(batches[i].map((text) => `${DOCUMENT_PREFIX}${text}`));
      vectors.push(...batch);
      log.info(`Embedded batch ${i + 1}/${batches.length} (${vectors.length}/${texts.length}).`);
    }

    return vectors;
  }

  private async embed(inputs: string[]): Promise<number[][]> {
    const openai = this.openai ?? getClient();

    const response = await openai.embeddings.create({
      model: config.fireworks.embeddingModel,
      input: inputs,
      // **Load-bearing — do not remove.** Omitting `encoding_format` against Fireworks returns a
      // corrupt 192-element all-zero vector instead of the real 768-dim embedding (observed
      // 2026-07-30 with nomic-embed-text-v1.5). Passing either "float" or "base64" explicitly
      // returns a correct unit vector. Left unset, every dense search would rank by distances
      // between zero vectors — arbitrary results, no error, and the RAG arm would have lost the
      // bake-off to a bug rather than to retrieval.
      encoding_format: "float",
    });

    // The API does not guarantee ordering; `index` does. Sorting by it rather than trusting
    // array order avoids silently pairing a chunk with another chunk's vector — a corruption
    // that would look like poor retrieval quality rather than a bug.
    const vectors = [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);

    if (vectors.length !== inputs.length) {
      throw createError(502, `Embedding API returned ${vectors.length} vectors for ${inputs.length} inputs.`);
    }

    const wrong = vectors.find((vector) => vector.length !== EMBEDDING_DIMENSIONS);
    if (wrong) {
      // Caught here rather than at write time, where the store reports a wrong-width vector as
      // an opaque type or index error — if it reports it at all.
      throw createError(
        502,
        `Embedding model "${config.fireworks.embeddingModel}" returned ${wrong.length} dimensions; `
        + `the schema expects ${EMBEDDING_DIMENSIONS}. Changing the embedding model requires a schema change.`,
      );
    }

    // A degenerate vector has the right *shape* and no meaning: cosine distance between zero
    // vectors is undefined, so dense retrieval silently returns arbitrary rows. The dimension
    // check above would not catch it. This is not hypothetical — see the encoding_format note.
    const degenerate = vectors.findIndex((vector) => vector.every((value) => value === 0));
    if (degenerate !== -1) {
      throw createError(
        502,
        `Embedding model "${config.fireworks.embeddingModel}" returned an all-zero vector for input `
        + `${degenerate}. Dense retrieval built on this would rank arbitrarily. Check that `
        + "`encoding_format` is still being sent.",
      );
    }

    return vectors;
  }
}
