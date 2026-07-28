import { ValidationError } from "../utils/errors";

export interface ChatRequest {
  query: string;
  /** Retrieval mode override. Honored only when DEBUG_RETRIEVAL is true — see RetrievalRegistry. */
  retrieval?: string;
  /** Opt in to a Server-Sent Events response instead of a single JSON body. */
  stream?: boolean;
}

/**
 * Validates the `POST /chat` body by hand, matching the config loader's approach
 * (conventions §8: no schema library in this service). Every failure is a
 * `ValidationError`, so the central error handler renders the house 400 shape.
 */
export const parseChatRequest = (body: unknown): ChatRequest => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("Request body must be a JSON object.");
  }

  const { query, retrieval, stream } = body as Record<string, unknown>;

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
  };
};
