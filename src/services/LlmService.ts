import OpenAI from "openai";
import createError from "http-errors";
import { config } from "../config";
import type { ChatMessage } from "../types/chat.types";
import { createLogger } from "../utils/logger";

const log = createLogger("LLM");

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmAnswer {
  content: string;
  model: string;
  usage?: LlmUsage;
}

/**
 * One piece of a streamed answer. `usage` arrives on the final event, when the
 * provider sends it at all.
 */
export interface LlmStreamEvent {
  text?: string;
  model?: string;
  usage?: LlmUsage;
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

  /**
   * Streams the answer as it is generated.
   *
   * `signal` aborts the upstream request when the client disconnects — without it a caller
   * that closes the tab keeps generating tokens we still pay for.
   *
   * `stream_options.include_usage` asks for a final usage event. Support varies by provider,
   * so usage is optional throughout rather than assumed: the Phase N2 harness needs token
   * counts, and it must fall back to the non-streaming path if they do not arrive here.
   */
  async* completeStream(
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<LlmStreamEvent> {
    const model = config.fireworks.chatModel;
    if (!model) {
      throw createError(503, "LLM_MODEL is not configured.");
    }

    const openai = this.openai ?? getClient();

    const stream = await openai.chat.completions.create(
      {
        model,
        messages,
        max_tokens: config.fireworks.maxTokens,
        user: config.fireworks.user,
        stream: true,
        stream_options: { include_usage: true },
      },
      signal ? { signal } : undefined,
    );

    let emitted = false;

    for await (const part of stream) {
      const text = part.choices?.[0]?.delta?.content;
      if (text) {
        emitted = true;
        yield { text, model: part.model ?? model };
      }
      if (part.usage) {
        yield {
          model: part.model ?? model,
          usage: {
            promptTokens: part.usage.prompt_tokens,
            completionTokens: part.usage.completion_tokens,
            totalTokens: part.usage.total_tokens,
          },
        };
      }
    }

    if (!emitted) {
      // Same silent failure as the non-streaming path: the stream completes, nothing visible
      // was produced. Thrown rather than ending quietly so the caller can report it.
      throw createError(
        502,
        `Model "${model}" streamed an empty answer. This usually means max_tokens (${config.fireworks.maxTokens}) was exhausted by reasoning tokens; raise LLM_MAX_TOKENS.`,
      );
    }
  }
}
