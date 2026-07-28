import { NextFunction, Request, Response } from "express";
import { retrievalRegistry } from "../retrieval";
import type { RetrievalRegistry } from "../retrieval/RetrievalRegistry";
import { buildMessages } from "../prompt/promptBuilder";
import { LlmService } from "../services/LlmService";
import { parseChatRequest } from "../validators/chatValidators";

/**
 * Chat endpoint: retrieve context, assemble the prompt, answer.
 *
 * **The response shape is still provisional.** C4 returns a complete answer; C5 turns it into
 * a stream, which changes the envelope again. Nothing is built against it yet — the static
 * frontend is unwired and the dashboard re-point is Phase N7.
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
      const { query, retrieval } = parseChatRequest(req.body);

      // Selection rules (including the DEBUG_RETRIEVAL override rule) live in the
      // registry, so this controller stays a thin HTTP wrapper.
      const adapter = this.registry.resolve(retrieval);
      const chunks = await adapter.getContext(query);

      // Ordering is load-bearing for prompt caching — see promptBuilder.
      const messages = buildMessages({ query, chunks });
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
}
