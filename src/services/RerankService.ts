import OpenAI from "openai";
import createError from "http-errors";
import { config } from "../config";

/**
 * Fireworks cross-encoder reranking (`/v1/rerank`) for the `*-rerank` retrieval modes.
 *
 * The OpenAI SDK has no rerank resource, but its generic `post` reuses the same base URL, key,
 * retries and timeout as the chat and embedding clients, so no second HTTP stack is needed.
 */

/** Scores documents against a query; one score per document, in input order, higher is better. */
export interface Reranker {
  score(query: string, documents: string[]): Promise<number[]>;
}

interface RerankResponse {
  data: Array<{ index: number; relevance_score: number }>;
}

let client: OpenAI | undefined;

/** Lazy and memoized, like the embedding client: importing this must not require credentials. */
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

export class RerankService implements Reranker {
  private readonly openai?: OpenAI;

  private readonly model: string;

  constructor(openai?: OpenAI, model = config.fireworks.rerankModel) {
    this.openai = openai;
    this.model = model;
  }

  async score(query: string, documents: string[]): Promise<number[]> {
    if (documents.length === 0) {
      return [];
    }
    const response = await (this.openai ?? getClient()).post<RerankResponse>("/rerank", {
      body: {
        model: this.model, query, documents, top_n: documents.length, return_documents: false,
      },
    });

    // Throw rather than fall back to the input order: a silently unranked pool would look like a
    // working reranker that happens to score worse.
    const scores: number[] = new Array(documents.length).fill(Number.NaN);
    response.data.forEach(({ index, relevance_score: score }) => {
      scores[index] = score;
    });
    if (scores.some(Number.isNaN)) {
      throw new Error(
        `Reranker returned ${response.data.length} score(s) for ${documents.length} document(s).`,
      );
    }
    return scores;
  }
}
