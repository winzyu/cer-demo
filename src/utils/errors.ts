import createError from "http-errors";

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
