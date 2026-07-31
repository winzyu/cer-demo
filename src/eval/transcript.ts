import type { LlmUsage } from "../services/LlmService";
import type { Chunk } from "../types/retrieval.types";

/**
 * The captured artifact of one conversation replayed against one arm on one pass
 * (`RETRIEVAL_BAKEOFF.md` §7a).
 *
 * Capture and grading are deliberately separate: everything a grader could need is written here,
 * so scores can be re-derived — or re-derived with a *better rubric* — without re-running a paid
 * sweep.
 */

export type EvalPass = "cold" | "warm";

export interface TurnTiming {
  /** Time to first token. Only available over the streaming transport. */
  ttftMs?: number;
  /** Request start to last byte. */
  wallMs: number;
}

export interface TranscriptTurn {
  index: number;
  question: string;
  answer: string;
  /**
   * **The exact context supplied to the model**, in order.
   *
   * The field most likely to be forgotten and the one that makes or breaks the eval: without it,
   * groundedness is unjudgeable, because there is no way to tell an invented claim from a
   * supported one. Stored as the full chunks, not ids — the corpus may change before grading.
   */
  context: Chunk[];
  /** The arm the *service* reported handling this turn. Compared against the requested arm. */
  mode: string;
  usage?: LlmUsage;
  timing: TurnTiming;
  /** Set when the turn failed; the transcript is still written so the failure is visible. */
  error?: string;
}

export interface TranscriptRunMeta {
  startedAt: string;
  /** Results that cannot be tied to a commit cannot be re-derived later. */
  gitSha: string;
  model: string;
  temperature: number;
  maxTokens: number;
  corpusSource: string;
  baseUrl: string;
  transport: "sse" | "json";
  /**
   * False when the provider reported no cached-token figures at all. Distinguishes "0% cache hit"
   * from "we have no idea", which are wildly different conclusions for direct-feed.
   */
  cacheReportingAvailable: boolean;
}

export interface TranscriptTotals {
  promptTokens: number;
  cachedPromptTokens?: number;
  completionTokens: number;
  wallMs: number;
}

export interface Transcript {
  fixtureId: string;
  fixtureClass: string;
  arm: string;
  pass: EvalPass;
  run: TranscriptRunMeta;
  turns: TranscriptTurn[];
  totals: TranscriptTotals;
}

const sumDefined = (values: (number | undefined)[]): number => values
  .reduce<number>((total, value) => total + (value ?? 0), 0);

/**
 * Totals for one transcript.
 *
 * `cachedPromptTokens` stays `undefined` unless at least one turn reported it — summing
 * unreported values as zero would silently manufacture a 0% cache hit rate, which is the exact
 * conclusion that would sink the direct-feed arm.
 */
export const totalsFor = (turns: TranscriptTurn[]): TranscriptTotals => {
  const anyCacheReported = turns.some((turn) => turn.usage?.cachedPromptTokens !== undefined);

  return {
    promptTokens: sumDefined(turns.map((turn) => turn.usage?.promptTokens)),
    cachedPromptTokens: anyCacheReported
      ? sumDefined(turns.map((turn) => turn.usage?.cachedPromptTokens))
      : undefined,
    completionTokens: sumDefined(turns.map((turn) => turn.usage?.completionTokens)),
    wallMs: sumDefined(turns.map((turn) => turn.timing.wallMs)),
  };
};

/** `eval/transcripts/<pass>/<arm>/<fixture-id>.json` — one file per conversation × arm × pass. */
export const transcriptPath = (arm: string, pass: EvalPass, fixtureId: string): string => `${pass}/${arm}/${fixtureId}.json`;
