import createError from "http-errors";

/**
 * Stable, machine-readable failure codes. Added **alongside** the `{ error, message }`
 * body (docs/migration/CONVENTIONS.md §6), never replacing it: `error` and `message` stay
 * exactly as they were, and `status` still never appears in the body.
 *
 * The set is deliberately small and closed. A code is a promise to a client — the UI
 * branches on it — so it is defined here once rather than invented at each throw site,
 * and anything outside the set is reported with no `code` at all rather than a guess.
 *
 * What is **not** here matters as much as what is:
 *
 * - **An empty window has no code, because it is not an error.** A pod that reported
 *   nothing in the requested window returns `value: null` / `n_samples: 0` plus
 *   `device_last_reported` (`DEVICE_API.md` §12b). Reclassifying that as a failure — or
 *   worse, as a `0` — fabricates a measurement, which the N2 quality floor treats as an
 *   automatic disqualification.
 * - **There is no `device_auth_retryable`.** `device_auth_expired` is terminal by design:
 *   this service has no refresh path, so the only correct response is to surface it.
 */
export const ERROR_CODES = [
  /** `FIREWORKS_API_KEY` is absent, so no LLM call can be made (503). */
  "llm_not_configured",
  /** The device API rejected the bearer token (401). Terminal — never retried. */
  "device_auth_expired",
  /** The device API did not answer inside `DEVICE_API_TIMEOUT_MS` (504). */
  "device_timeout",
  /** The device API is 5xx, unreachable, or not configured (502/503). */
  "device_unavailable",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const KNOWN_CODES: ReadonlySet<string> = new Set(ERROR_CODES);

/**
 * Narrows an arbitrary `code` property to our taxonomy.
 *
 * Load-bearing as a filter, not just a type guard: Node stamps its own `code` on system
 * errors (`ECONNREFUSED`, `ENOTFOUND`) and `http-errors` carries an index signature, so
 * without this check the handler would happily publish an internal errno as if it were a
 * documented part of the contract.
 */
export const isErrorCode = (value: unknown): value is ErrorCode => (
  typeof value === "string" && KNOWN_CODES.has(value)
);

/** An `http-errors` error carrying one of the codes above. */
export type CodedHttpError = createError.HttpError & { code: ErrorCode };

/**
 * Builds an `http-errors` error with a taxonomy code attached.
 *
 * The code travels on the error itself so the throw site — which is the only place that
 * knows *which* condition fired — names it, and the terminal handler only has to read it.
 */
export const codedError = (
  status: number,
  message: string,
  code: ErrorCode,
): CodedHttpError => {
  const error = createError(status, message) as CodedHttpError;
  error.code = code;
  return error;
};

/** The message the LLM and embedding services throw when the key is missing. */
const MISSING_LLM_KEY = /FIREWORKS_API_KEY/;

/**
 * Resolves the code to publish for an error, or `undefined` when it has none.
 *
 * An explicit code always wins. The fallback exists for the one condition thrown outside
 * this module's reach — `LlmService` and `EmbeddingService` raise the missing-key 503 —
 * and is kept narrow on purpose: it requires both the 503 status and the env var name, so
 * an unrelated 503 (a missing `LLM_MODEL`, say) is not mislabelled as a missing key.
 */
export const resolveErrorCode = (err: unknown): ErrorCode | undefined => {
  if (typeof err !== "object" || err === null) {
    return undefined;
  }

  const explicit = (err as { code?: unknown }).code;
  if (isErrorCode(explicit)) {
    return explicit;
  }

  const status = createError.isHttpError(err) ? err.statusCode : undefined;
  const message = typeof (err as { message?: unknown }).message === "string"
    ? (err as { message: string }).message
    : "";
  if (status === 503 && MISSING_LLM_KEY.test(message)) {
    return "llm_not_configured";
  }

  return undefined;
};

/**
 * Thin domain error classes over `http-errors`. They carry the correct `statusCode`
 * and are formatted by the central error handler (docs/migration/CONVENTIONS.md §6).
 */
export class NotFoundError extends createError.NotFound {
  constructor(message = "Resource not found") {
    super(message);
  }
}

export class ValidationError extends createError.BadRequest {
  constructor(message = "Validation error") {
    super(message);
  }
}

export class UnauthorizedError extends createError.Unauthorized {
  constructor(message = "Unauthorized") {
    super(message);
  }
}

export class ForbiddenError extends createError.Forbidden {
  constructor(message = "Forbidden") {
    super(message);
  }
}

export class ConflictError extends createError.Conflict {
  constructor(message = "Conflict") {
    super(message);
  }
}
