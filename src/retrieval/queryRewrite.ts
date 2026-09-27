import type { ChatMessage } from "../types/chat.types";
import type { LlmUsage } from "../services/LlmService";
import { createLogger } from "../utils/logger";

const log = createLogger("QueryRewrite");

/**
 * Follow-up query rewriting (`QUERY_REWRITE`), off by default.
 *
 * **Why this exists.** Retrieval sees only the latest message; `history` reaches the prompt but
 * never the search. A follow-up such as "are our normal buffers even good down there?" names
 * neither pH nor acid mine water, so it searches blind and the answer model gets excerpts about
 * the wrong subject. This turns such a message into a standalone search query using the
 * conversation so far. The rewrite is used for retrieval only: the answer prompt still carries
 * the user's own words, so a bad rewrite can cost recall but never puts words in the user's mouth.
 *
 * A first turn (no history) is returned unchanged without a model call, and any failure falls
 * back to the original message: rewriting is an optimisation, and must never fail a question.
 */

/** The most recent history messages the rewriter sees; a follow-up leans on the last exchange. */
export const REWRITE_HISTORY_MESSAGES = 4;
/** Each history message is clipped to this length; the subject is rarely past the opening. */
export const REWRITE_MESSAGE_CHARS = 1500;
/** A rewrite longer than this is treated as the model answering instead of rewriting. */
export const REWRITE_MAX_CHARS = 500;

export const REWRITE_SYSTEM_PROMPT = `You rewrite the user's latest message into a standalone search query for a library of water-quality monitoring documents.
- Use the conversation only to resolve what the latest message refers to: replace pronouns and vague references with the specific instrument, parameter, site condition or procedure being discussed.
- Keep every detail the latest message asks about, and do not add topics it does not ask about.
- Do not answer the question.
- If the latest message already stands on its own, return it unchanged.
Reply with the query only, on one line, with no quotes or explanation.`;

/**
 * First turns have no conversation to resolve, but are often phrased conversationally ("my
 * readings look off after the storm, should I worry?"), which embeds poorly. Measured offline
 * only (`retrieval:eval --rewrite-first`); `rewriteQuery` still leaves first turns alone.
 */
export const FIRST_TURN_REWRITE_SYSTEM_PROMPT = `You rewrite a user's question into a search query for a library of water-quality monitoring documents.
- Name the specific instrument, parameter, site condition or procedure the question is about, using the question's own terms.
- Keep every detail the question asks about, and do not add topics it does not ask about.
- Do not answer the question.
- If the question is already a clear search query, return it unchanged.
Reply with the query only, on one line, with no quotes or explanation.`;

export interface RewriteCompleter {
  complete(messages: ChatMessage[]): Promise<{ content: string; usage?: LlmUsage }>;
}

export interface RewriteResult {
  /** What retrieval should search for: the rewrite, or the original message on any fallback. */
  query: string;
  rewritten: boolean;
  /** Tokens the rewrite call spent, for quota accounting; absent when no call was made. */
  usage?: LlmUsage;
}

const clip = (text: string, max: number): string => (
  text.length <= max ? text : `${text.slice(0, max)}…`
);

export const buildRewriteMessages = (query: string, history: ChatMessage[]): ChatMessage[] => {
  const recent = history
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim() !== "")
    .slice(-REWRITE_HISTORY_MESSAGES);
  const transcript = recent
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${clip(m.content.trim(), REWRITE_MESSAGE_CHARS)}`)
    .join("\n\n");
  return [
    { role: "system", content: REWRITE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Conversation so far:\n\n${transcript}\n\nLatest message:\n${query}\n\nStandalone search query:`,
    },
  ];
};

/** First non-empty line, stripped of wrapping quotes; empty or overlong output yields "". */
export const cleanRewrite = (raw: string): string => {
  const line = raw.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? "";
  const unquoted = line.replace(/^["'“”]+|["'“”]+$/g, "").trim();
  return unquoted.length > REWRITE_MAX_CHARS ? "" : unquoted;
};

export const rewriteQuery = async (
  llm: RewriteCompleter,
  query: string,
  history: ChatMessage[] = [],
): Promise<RewriteResult> => {
  const usable = history.some((m) => (m.role === "user" || m.role === "assistant") && m.content.trim() !== "");
  if (!usable) {
    return { query, rewritten: false };
  }
  try {
    const answer = await llm.complete(buildRewriteMessages(query, history));
    const cleaned = cleanRewrite(answer.content);
    if (cleaned === "") {
      log.warn("Query rewrite returned nothing usable; searching with the original message.");
      return { query, rewritten: false, usage: answer.usage };
    }
    return { query: cleaned, rewritten: cleaned !== query, usage: answer.usage };
  } catch (error) {
    log.warn(`Query rewrite failed; searching with the original message: ${error instanceof Error ? error.message : String(error)}`);
    return { query, rewritten: false };
  }
};

/** A first turn as a search query; same fallbacks as `rewriteQuery`. */
export const rewriteFirstTurn = async (
  llm: RewriteCompleter,
  query: string,
): Promise<RewriteResult> => {
  try {
    const answer = await llm.complete([
      { role: "system", content: FIRST_TURN_REWRITE_SYSTEM_PROMPT },
      { role: "user", content: `Question:\n${query}\n\nSearch query:` },
    ]);
    const cleaned = cleanRewrite(answer.content);
    if (cleaned === "") {
      log.warn("First-turn rewrite returned nothing usable; searching with the original message.");
      return { query, rewritten: false, usage: answer.usage };
    }
    return { query: cleaned, rewritten: cleaned !== query, usage: answer.usage };
  } catch (error) {
    log.warn(`First-turn rewrite failed; searching with the original message: ${error instanceof Error ? error.message : String(error)}`);
    return { query, rewritten: false };
  }
};
