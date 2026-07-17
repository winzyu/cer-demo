/* eslint-disable no-console */

/**
 * Minimal tagged logger. Conventions (docs/migration/CONVENTIONS.md §9) call for
 * `morgan` HTTP logging plus bracketed-tag `console.*` diagnostics and no logging
 * library — this centralizes the tag formatting so those diagnostics stay consistent.
 */
export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string, error?: unknown) => void;
}

export const createLogger = (tag: string): Logger => {
  const format = (message: string): string => `[${tag}] ${message}`;
  return {
    info: (message) => console.log(format(message)),
    warn: (message) => console.warn(format(message)),
    error: (message, error) => console.error(format(message), error ?? ""),
  };
};
