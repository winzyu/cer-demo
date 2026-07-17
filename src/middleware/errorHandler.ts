import { Request, Response, NextFunction } from "express";
import createError from "http-errors";
import { config } from "../config";
import { createLogger } from "../utils/logger";

const log = createLogger("Error");

/**
 * Terminal error handler. Response shape follows docs/migration/CONVENTIONS.md §6:
 * `error` is mandatory (the deployed client reads it), `message` mirrors it, and no
 * `status` field is placed in the body (the HTTP status line carries it). The stack is
 * only exposed outside production.
 */
export const errorHandler = (
  err: Error | createError.HttpError,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const isHttpError = createError.isHttpError(err);
  const statusCode = isHttpError ? err.statusCode : 500;
  const message = err.message || "Internal Server Error";

  if (statusCode >= 500) {
    log.error(message, err);
  }

  res.status(statusCode).json({
    error: message,
    message,
    ...(config.isProduction ? {} : { stack: err.stack }),
  });
};
