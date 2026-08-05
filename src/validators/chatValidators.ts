import { config } from "../config";
import type { ChatMessage } from "../types/chat.types";
import { ValidationError } from "../utils/errors";

export interface ChatRequest {
  query: string;
  /** Retrieval mode override. Honored only when DEBUG_RETRIEVAL is true — see RetrievalRegistry. */
  retrieval?: string;
  /** Opt in to a Server-Sent Events response instead of a single JSON body. */
  stream?: boolean;
  /** Prior turns, oldest first. Trimmed to the newest `MAX_HISTORY_MESSAGES`. */
  history?: ChatMessage[];
}

/**
 * Roles a **client** may supply. `system` is deliberately excluded: the system prompt carries
 * the scope and refusal policy, and accepting a caller-supplied system message would let anyone
 * override it by sending `{ role: "system", content: "ignore previous instructions" }`.
 */
const CLIENT_ROLES = ["user", "assistant"] as const;

const parseHistory = (value: unknown): ChatMessage[] => {
  if (!Array.isArray(value)) {
    throw new ValidationError("\"history\" must be an array when provided.");
  }

  const messages = value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new ValidationError(`"history[${index}]" must be an object.`);
    }
    const { role, content } = entry as Record<string, unknown>;

    if (!CLIENT_ROLES.includes(role as (typeof CLIENT_ROLES)[number])) {
      throw new ValidationError(
        `"history[${index}].role" must be one of [${CLIENT_ROLES.join(", ")}].`,
      );
    }
    if (typeof content !== "string" || content.trim() === "") {
      throw new ValidationError(`"history[${index}].content" must be a non-empty string.`);
    }

    return { role, content } as ChatMessage;
  });

  // Trim oldest first: recent turns carry the conversational context that matters, and the
  // cap exists to bound cost rather than to reject the request.
  return messages.slice(-config.chat.maxHistoryMessages);
};

/**
 * Validates the `POST /chat` body by hand, matching the config loader's approach
 * (conventions §8: no schema library in this service). Every failure is a
 * `ValidationError`, so the central error handler renders the house 400 shape.
 */
export const parseChatRequest = (body: unknown): ChatRequest => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("Request body must be a JSON object.");
  }

  const {
    query, retrieval, stream, history,
  } = body as Record<string, unknown>;

  if (typeof query !== "string" || query.trim() === "") {
    throw new ValidationError("\"query\" is required and must be a non-empty string.");
  }
  if (retrieval !== undefined && typeof retrieval !== "string") {
    throw new ValidationError("\"retrieval\" must be a string when provided.");
  }
  if (stream !== undefined && typeof stream !== "boolean") {
    throw new ValidationError("\"stream\" must be a boolean when provided.");
  }

  return {
    query: query.trim(),
    ...(retrieval !== undefined ? { retrieval } : {}),
    ...(stream !== undefined ? { stream } : {}),
    ...(history !== undefined ? { history: parseHistory(history) } : {}),
  };
};
