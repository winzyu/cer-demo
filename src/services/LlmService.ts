import OpenAI from "openai";
import createError from "http-errors";
import { config } from "../config";
import type { ChatMessage } from "../types/chat.types";
import { createLogger } from "../utils/logger";

const log = createLogger("LLM");

export interface LlmAnswer {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

let client: OpenAI | undefined;

/**
 * Memoized Fireworks client. Construction is lazy so the service still boots and passes
 * /health without credentials — the key is only required when a chat request arrives.
 */
const getClient = (): OpenAI => {
  if (!client) {
    const { apiKey, baseUrl } = config.fireworks;
    if (!apiKey) {
      throw createError(503, "FIREWORKS_API_KEY is not configured.");
    }
    client = new OpenAI({ apiKey, baseURL: baseUrl });
    log.info(`Client initialized (baseUrl=${baseUrl}).`);
  }
  return client;
};

/** Test seam: drop the memoized client so a fake can be injected or config re-read. */
export const resetClient = (): void => {
  client = undefined;
};

/**
 * Wraps the Fireworks chat-completions call. Fireworks speaks the OpenAI API, so the
 * official SDK is pointed at its base URL (`MIGRATION_SPEC.md` §4).
 *
 * No tools are offered: retrieval runs before this call and arrives as prompt context, so
 * there is nothing for the model to call. The legacy tool-round loop returns in Phase N3
 * with `query_sensor_data` (see timeline ◆G11).
 */
export class LlmService {
  private readonly openai?: OpenAI;

  constructor(openai?: OpenAI) {
    this.openai = openai;
  }

  async complete(messages: ChatMessage[]): Promise<LlmAnswer> {
    const model = config.fireworks.chatModel;
    if (!model) {
      throw createError(503, "LLM_MODEL is not configured.");
    }

    const openai = this.openai ?? getClient();

    const response = await openai.chat.completions.create({
      model,
      messages,
      max_tokens: config.fireworks.maxTokens,
      // Cache affinity on serverless — see FireworksConfig.user.
      user: config.fireworks.user,
      stream: false,
    });

    const content = response.choices[0]?.message?.content ?? "";

    if (content.trim() === "") {
      // The documented gpt-oss failure mode: reasoning tokens consume the budget and the
      // visible answer is truncated to nothing. Surfaced explicitly because the API call
      // itself succeeds — silence here is otherwise indistinguishable from a valid answer.
      throw createError(
        502,
        `Model "${model}" returned an empty answer. This usually means max_tokens (${config.fireworks.maxTokens}) was exhausted by reasoning tokens; raise LLM_MAX_TOKENS.`,
      );
    }

    return {
      content,
      model: response.model ?? model,
      usage: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      },
    };
  }
}
