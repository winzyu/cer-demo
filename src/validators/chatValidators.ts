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
  /**
   * Pod the caller has already chosen (the UI's pod selector), by name or `dev:` label.
   *
   * It is a **default** for the sensor tool, not a filter: the model may still name a different
   * device in its tool arguments and that choice wins. See `ChatOrchestrator.run`.
   */
  device?: string;
}

/**
 * Roles a **client** may supply. `system` is deliberately excluded: the system prompt carries
 * the scope and refusal policy, and accepting a caller-supplied system message would let anyone
 * override it by sending `{ role: "system", content: "ignore previous instructions" }`.
 */
const CLIENT_ROLES = ["user", "assistant"] as const;

/**
 * Cap on `device`. The longest real identifier is a `dev:` label (19 characters) and the longest
 * device name in the registry is well under this, so the bound only rejects junk — it exists
 * because the string is client-controlled and reaches an upstream URL and an error message.
 */
const MAX_DEVICE_LENGTH = 120;

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
 * Checks the shape of `device` only — whether any pod actually answers to it is the sensor
 * tool's business, and it reports a miss as a recoverable tool result rather than a 400
 * (see `parseChatRequest`).
 */
const parseDevice = (value: unknown): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("\"device\" must be a non-empty string when provided.");
  }
  const device = value.trim();
  if (device.length > MAX_DEVICE_LENGTH) {
    throw new ValidationError(`"device" must be at most ${MAX_DEVICE_LENGTH} characters.`);
  }
  return device;
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
    query, retrieval, stream, history, device,
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
    // A device the tool cannot match is deliberately *not* a 400: the caller may be a stale UI
    // naming a pod that has since gone, and the tool surfaces that as a recoverable `{ error }`
    // the model can act on mid-loop. Only the shape is checked here.
    ...(device !== undefined ? { device: parseDevice(device) } : {}),
  };
};
