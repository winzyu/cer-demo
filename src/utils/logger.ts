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

/** Most severe first; a configured level enables itself and everything above it. */
const LEVELS = ["silent", "error", "warn", "info"] as const;

export type LogLevel = typeof LEVELS[number];

const DEFAULT_LEVEL: LogLevel = "info";

/**
 * Read straight from the environment rather than from `src/config`.
 *
 * `config/index.ts` calls `createLogger` at module scope to report its own missing-variable
 * warnings, so importing config here would close a cycle. `LOG_LEVEL` needs no validation
 * beyond "is it one of four words", which is cheap to do in place.
 *
 * Resolved per call, not memoized: the integration suites rebuild the app with
 * `jest.resetModules()` and a different environment, and a value captured at first import
 * would outlive the configuration it came from.
 */
const threshold = (): number => {
  const raw = (process.env.LOG_LEVEL ?? "").trim().toLowerCase();
  const index = LEVELS.indexOf(raw as LogLevel);
  return index === -1 ? LEVELS.indexOf(DEFAULT_LEVEL) : index;
};

const enabled = (level: Exclude<LogLevel, "silent">): boolean => (
  LEVELS.indexOf(level) <= threshold()
);

export const createLogger = (tag: string): Logger => {
  const format = (message: string): string => `[${tag}] ${message}`;
  return {
    info: (message) => { if (enabled("info")) console.log(format(message)); },
    warn: (message) => { if (enabled("warn")) console.warn(format(message)); },
    error: (message, error) => {
      if (enabled("error")) console.error(format(message), error ?? "");
    },
  };
};
