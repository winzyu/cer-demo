import { NextFunction, Request, Response } from "express";
import {
  quotaErrorCode, quotaErrorMessage, quotaKeyFor, quotaService,
} from "../quota";
import type { QuotaService } from "../quota";
import { codedError } from "../utils/errors";
import { createLogger } from "../utils/logger";

const log = createLogger("Quota");

/**
 * Refuses a chat request whose bucket is spent.
 *
 * ## Why the gate is middleware, and why it sits *before* the controller
 *
 * A streamed chat answers with SSE, and `openSseStream` writes the status line before the first
 * token. After that the status code is frozen: a refusal discovered inside the handler could
 * only be reported as an in-band `error` event on a 200, which is exactly the shape a client
 * cannot act on and a proxy cannot cache-bust. Running the check as middleware means an
 * over-quota request — streamed or not — is refused as a real **429 with a JSON body**, before
 * any decision about streaming is made. This mirrors the existing rule that validation 400s
 * arrive as JSON rather than as SSE (`chat.test.ts`, "still applies validation before opening
 * the stream").
 *
 * ## What it deliberately does not do
 *
 * It does not *count*. Recording belongs to `ChatController`, after `parseChatRequest` succeeds
 * and again when the model reports its usage, so a 400 does not consume an allowance and token
 * cost is attributed to the answer that incurred it. The gate reads; the controller writes.
 */
export const quotaGuard = (service: QuotaService = quotaService) => (
  (req: Request, res: Response, next: NextFunction): void => {
    const decision = service.check(quotaKeyFor(req));
    if (decision.allowed) {
      next();
      return;
    }

    const message = quotaErrorMessage(decision);
    // The key is logged, not the token it was derived from — `quotaKeyFor` hashes before it
    // ever reaches here, so this line is safe to keep in a shipped log.
    log.warn(`Refused ${decision.key}: ${message}`);
    // Set before `next`: the terminal handler only writes a body, so headers staged here survive.
    res.setHeader("Retry-After", String(decision.retryAfterSeconds));
    next(codedError(429, message, quotaErrorCode(decision)));
  }
);
