import { NextFunction, Request, Response } from "express";
import { retrievalRegistry } from "../retrieval";
import type { RetrievalRegistry } from "../retrieval/RetrievalRegistry";
import type { Chunk } from "../types/retrieval.types";
import { buildMessages } from "../prompt/promptBuilder";
import { LlmService } from "../services/LlmService";
import { parseChatRequest } from "../validators/chatValidators";
import { createLogger } from "../utils/logger";
import { openSseStream, writeSseEvent } from "../utils/sse";

const log = createLogger("Chat");

/**
 * Chat endpoint: retrieve context, assemble the prompt, answer.
 *
 * Streaming is **opt-in** via `{ stream: true }`, not the default. The JSON path stays the
 * simple one because the Phase N2 bake-off harness captures whole answers plus token counts,
 * and non-browser callers should not have to parse SSE. Phase N7's chat UI will likely make
 * streaming the default for browsers — revisit then.
 */
export class ChatController {
  private readonly registry: RetrievalRegistry;

  private readonly llm: LlmService;

  constructor(registry: RetrievalRegistry = retrievalRegistry, llm: LlmService = new LlmService()) {
    this.registry = registry;
    this.llm = llm;
  }

  postChat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query, retrieval, stream } = parseChatRequest(req.body);

      // Selection rules (including the DEBUG_RETRIEVAL override rule) live in the
      // registry, so this controller stays a thin HTTP wrapper.
      const adapter = this.registry.resolve(retrieval);
      const chunks = await adapter.getContext(query);

      // Ordering is load-bearing for prompt caching — see promptBuilder.
      const messages = buildMessages({ query, chunks });

      if (stream) {
        await this.streamAnswer(req, res, messages, adapter.mode, chunks);
        return;
      }

      const answer = await this.llm.complete(messages);

      res.status(200).json({
        answer: answer.content,
        model: answer.model,
        mode: adapter.mode,
        // Retrieved context is returned so the caller can show provenance. N5 turns these
        // into inline quote citations.
        citations: chunks,
        usage: answer.usage,
      });
    } catch (error) {
      // Express 4 does not forward async rejections — without this, a failing
      // adapter or LLM call would hang the request instead of reaching the error handler.
      next(error);
    }
  };

  /**
   * Emits `meta` (provenance, before any token), then `token` events, then `done`.
   *
   * Citations go first deliberately: once tokens start arriving the UI needs somewhere to
   * anchor them, and after the first byte the status code can no longer change.
   */
  private streamAnswer = async (
    req: Request,
    res: Response,
    messages: ReturnType<typeof buildMessages>,
    mode: string,
    chunks: Chunk[],
  ): Promise<void> => {
    const controller = new AbortController();
    // A client that closes the tab should stop costing us tokens.
    req.on("close", () => controller.abort());

    openSseStream(res);
    writeSseEvent(res, "meta", { mode, citations: chunks });

    try {
      for await (const event of this.llm.completeStream(messages, controller.signal)) {
        if (event.text) {
          writeSseEvent(res, "token", { text: event.text });
        }
        if (event.usage) {
          writeSseEvent(res, "done", { model: event.model, usage: event.usage });
        }
      }
      writeSseEvent(res, "end", {});
    } catch (error) {
      // Headers are already sent, so the status code cannot be changed and the central
      // error handler cannot render this. Report it in-band instead of dying silently.
      const message = error instanceof Error ? error.message : "Stream failed.";
      log.error(`Stream failed: ${message}`);
      writeSseEvent(res, "error", { error: message, message });
    } finally {
      res.end();
    }
  };
}
