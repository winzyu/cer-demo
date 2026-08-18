import { Request, Response, NextFunction } from "express";
import createError from "http-errors";
import { config } from "../config";
import { resolveErrorCode } from "../utils/errors";
import { createLogger } from "../utils/logger";

const log = createLogger("Error");

/**
 * Terminal error handler. Response shape follows docs/migration/CONVENTIONS.md §6:
 * `error` is mandatory (the deployed client reads it), `message` mirrors it, and no
 * `status` field is placed in the body (the HTTP status line carries it). The stack is
 * only exposed outside production.
 *
 * `code` is an **additive** field: present only for the conditions in `ERROR_CODES`, and
 * omitted entirely otherwise, so nothing about the existing body changes. It exists
 * because `error` and `message` are human prose — a client that wants to tell "your device
 * token is dead" from "the device API is down" cannot do it by matching on a sentence, and
 * both arrive today as an indistinguishable 5xx.
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
  const code = resolveErrorCode(err);

  if (statusCode >= 500) {
    log.error(message, err);
  }

  res.status(statusCode).json({
    error: message,
    message,
    ...(code ? { code } : {}),
    ...(config.isProduction ? {} : { stack: err.stack }),
  });
};
