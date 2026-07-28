import { NextFunction, Request, Response } from "express";
import { retrievalRegistry } from "../retrieval";
import type { RetrievalRegistry } from "../retrieval/RetrievalRegistry";
import { parseChatRequest } from "../validators/chatValidators";

/**
 * Chat endpoint.
 *
 * **The response shape here is scaffolding, not the product.** C2 returns the retrieved
 * chunks directly so the adapter-selection path is observable and testable before any LLM
 * exists. C4 replaces the body with the model's answer and demotes chunks to citation
 * metadata; C5 makes it a stream. Nothing should be built against this shape — the static
 * frontend is not wired to it, and the dashboard re-point is Phase N7, long after it changes.
 */
export class ChatController {
  private readonly registry: RetrievalRegistry;

  constructor(registry: RetrievalRegistry = retrievalRegistry) {
    this.registry = registry;
  }

  postChat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query, retrieval } = parseChatRequest(req.body);

      // Selection rules (including the DEBUG_RETRIEVAL override rule) live in the
      // registry, so this controller stays a thin HTTP wrapper.
      const adapter = this.registry.resolve(retrieval);
      const chunks = await adapter.getContext(query);

      res.status(200).json({ query, mode: adapter.mode, chunks });
    } catch (error) {
      // Express 4 does not forward async rejections — without this, a failing
      // adapter would hang the request instead of reaching the error handler.
      next(error);
    }
  };
}
