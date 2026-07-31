import type { ChatMessage } from "../types/chat.types";
import type { Chunk } from "../types/retrieval.types";
import type { LlmUsage } from "../services/LlmService";
import type { LoadedFixture } from "./types";
import {
  EvalPass,
  Transcript,
  TranscriptRunMeta,
  TranscriptTurn,
  totalsFor,
} from "./transcript";

/**
 * Replays fixtures against a running service and captures transcripts
 * (`RETRIEVAL_BAKEOFF.md` §7a).
 *
 * The transport is injected rather than imported, so the replay logic — history assembly, the
 * arm-mismatch guard, error handling — is testable without a network or a server.
 */

export interface AskRequest {
  query: string;
  retrieval: string;
  history: ChatMessage[];
}

export interface AskResult {
  answer: string;
  /** The arm the service says answered. Load-bearing — see the mismatch guard below. */
  mode: string;
  context: Chunk[];
  model?: string;
  usage?: LlmUsage;
  ttftMs?: number;
  wallMs: number;
}

export type AskFn = (request: AskRequest) => Promise<AskResult>;

export class ArmMismatchError extends Error {
  constructor(requested: string, served: string) {
    super(
      `Requested arm "${requested}" but the service answered as "${served}". `
      + "DEBUG_RETRIEVAL is almost certainly false: the registry *ignores* an override rather "
      + "than rejecting it, so every arm would have been silently recorded as the default and "
      + "the whole sweep would compare one strategy against itself. Aborting.",
    );
    this.name = "ArmMismatchError";
  }
}

export interface ReplayOptions {
  arm: string;
  pass: EvalPass;
  run: TranscriptRunMeta;
  /** Called after each turn — progress reporting for a sweep that takes minutes. */
  onTurn?: (fixtureId: string, turn: TranscriptTurn) => void;
}

/**
 * Replays one conversation: a fresh session, turns sent in order, prior turns supplied as
 * history. The service is stateless, so "session" means exactly this — the history we send.
 */
export const replayFixture = async (
  fixture: LoadedFixture,
  ask: AskFn,
  options: ReplayOptions,
): Promise<Transcript> => {
  const turns: TranscriptTurn[] = [];
  const history: ChatMessage[] = [];

  for (let index = 0; index < fixture.turns.length; index += 1) {
    const { content } = fixture.turns[index];
    let turn: TranscriptTurn;

    try {
      // Sequential by necessity: turn N+1's history is turn N's answer.
      // eslint-disable-next-line no-await-in-loop
      const result = await ask({ query: content, retrieval: options.arm, history: [...history] });

      // Checked on every turn, not just the first: a mid-sweep config reload would otherwise
      // silently switch arms and the transcript would still look clean.
      if (result.mode !== options.arm) {
        throw new ArmMismatchError(options.arm, result.mode);
      }

      turn = {
        index,
        question: content,
        answer: result.answer,
        context: result.context,
        mode: result.mode,
        usage: result.usage,
        timing: { ttftMs: result.ttftMs, wallMs: result.wallMs },
      };
      history.push({ role: "user", content });
      history.push({ role: "assistant", content: result.answer });
    } catch (error) {
      if (error instanceof ArmMismatchError) {
        // Not a data point — a broken experiment. Stop rather than record it.
        throw error;
      }
      turn = {
        index,
        question: content,
        answer: "",
        context: [],
        mode: options.arm,
        timing: { wallMs: 0 },
        error: error instanceof Error ? error.message : String(error),
      };
      // The conversation cannot meaningfully continue without an answer to build history on.
      turns.push(turn);
      options.onTurn?.(fixture.id, turn);
      break;
    }

    turns.push(turn);
    options.onTurn?.(fixture.id, turn);
  }

  return {
    fixtureId: fixture.id,
    fixtureClass: fixture.class,
    arm: options.arm,
    pass: options.pass,
    run: options.run,
    turns,
    totals: totalsFor(turns),
  };
};

/** Replays the whole set in fixture-id order — the same order for every arm, every pass. */
export const replayAll = async (
  fixtures: LoadedFixture[],
  ask: AskFn,
  options: ReplayOptions,
): Promise<Transcript[]> => {
  const transcripts: Transcript[] = [];
  const ordered = [...fixtures].sort((a, b) => a.id.localeCompare(b.id));

  for (let index = 0; index < ordered.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    transcripts.push(await replayFixture(ordered[index], ask, options));
  }

  return transcripts;
};

export interface SweepSummary {
  transcripts: number;
  turns: number;
  failedTurns: number;
  promptTokens: number;
  cachedPromptTokens?: number;
  completionTokens: number;
  wallMs: number;
  /** Cache hit rate over prompt tokens, or undefined when the provider reported nothing. */
  cacheHitRate?: number;
  warnings: string[];
}

/**
 * Aggregates a sweep and, more importantly, says what is wrong with it.
 *
 * The warnings exist because each of these failures produces a dataset that *looks* fine:
 * a missing cache split reads as a 0% hit rate, and a "cold" pass that hit the cache reads as
 * cheap-cold rather than mislabelled.
 */
export const summarize = (transcripts: Transcript[], pass: EvalPass): SweepSummary => {
  const turns = transcripts.flatMap((transcript) => transcript.turns);
  const failedTurns = turns.filter((turn) => turn.error).length;
  const promptTokens = transcripts.reduce((total, t) => total + t.totals.promptTokens, 0);
  const completionTokens = transcripts.reduce((total, t) => total + t.totals.completionTokens, 0);
  const wallMs = transcripts.reduce((total, t) => total + t.totals.wallMs, 0);

  const cacheReported = transcripts.some((t) => t.totals.cachedPromptTokens !== undefined);
  const cachedPromptTokens = cacheReported
    ? transcripts.reduce((total, t) => total + (t.totals.cachedPromptTokens ?? 0), 0)
    : undefined;

  const warnings: string[] = [];
  if (!cacheReported) {
    warnings.push(
      "No cached-token figures were reported. This is NOT a 0% cache hit rate — it is no data, "
      + "and the cost comparison cannot be completed from this run (RETRIEVAL_BAKEOFF §6).",
    );
  }
  if (pass === "cold" && (cachedPromptTokens ?? 0) > 0) {
    warnings.push(
      `Pass is labelled "cold" but ${cachedPromptTokens} prompt tokens were served from cache. `
      + "The prefix was already warm; treat these as warm numbers or clear the cache and re-run.",
    );
  }
  if (failedTurns > 0) {
    warnings.push(`${failedTurns} turn(s) failed and were recorded with an error and no answer.`);
  }
  if (turns.some((turn) => turn.context.length === 0 && !turn.error)) {
    warnings.push(
      "At least one turn was answered with EMPTY context. A misconfigured adapter that returns "
      + "nothing produces a clean-looking, meaningless dataset — verify before grading.",
    );
  }

  return {
    transcripts: transcripts.length,
    turns: turns.length,
    failedTurns,
    promptTokens,
    cachedPromptTokens,
    completionTokens,
    wallMs,
    cacheHitRate: cacheReported && promptTokens > 0
      ? (cachedPromptTokens ?? 0) / promptTokens
      : undefined,
    warnings,
  };
};
