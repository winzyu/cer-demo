import type { ChatMessage } from "../types/chat.types";
import type { Chunk } from "../types/retrieval.types";
import type { WaterType } from "../config";
import { buildSystemPrompt } from "./systemPrompt";

/**
 * Renders chunks as a context block. Each excerpt is labelled with its source so the model
 * can cite it — the system prompt requires citation, which is only possible if the source
 * survives into the prompt text.
 */
export const formatContext = (chunks: Chunk[]): string => {
  const excerpts = chunks
    .map((chunk, index) => `[${index + 1}] (source: ${chunk.source})\n${chunk.text}`)
    .join("\n\n");

  return `CONTEXT — excerpts from the water-quality corpus:\n\n${excerpts}`;
};

export interface BuildMessagesInput {
  query: string;
  chunks: Chunk[];
  /** Prior turns, oldest first. Passed through unchanged. */
  history?: ChatMessage[];
  waterType?: WaterType;
}

/**
 * Assembles the message list sent to the model.
 *
 * **Order is load-bearing, not stylistic:** most static content first, most dynamic last.
 *
 *   1. system prompt   — identical on every request for a given deployment
 *   2. document context — identical per corpus slice (direct-feed) or per query (RAG)
 *   3. history          — grows over a conversation
 *   4. the user question — different every time
 *
 * Fireworks prompt caching matches on a **prefix**, so a cache hit only extends as far as the
 * first byte that differs. Interleaving anything dynamic earlier — a timestamp in the system
 * block, the question before the context — truncates the cacheable prefix to nothing and the
 * saving disappears silently, with no error to notice.
 *
 * This matters most to the direct-feed arm of the Phase N2 bake-off, which sends a large
 * constant context on every request and whose entire cost case rests on that context being
 * cached (docs/RETRIEVAL_BAKEOFF.md §1). Reordering these blocks would quietly invalidate
 * the comparison.
 */
export const buildMessages = ({
  query,
  chunks,
  history = [],
  waterType,
}: BuildMessagesInput): ChatMessage[] => {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(waterType) },
  ];

  // Omitted entirely when empty: an empty "CONTEXT:" heading reads to the model as
  // "the corpus had nothing", which is a different claim from "no corpus was consulted".
  if (chunks.length > 0) {
    messages.push({ role: "system", content: formatContext(chunks) });
  }

  messages.push(...history);
  messages.push({ role: "user", content: query });

  return messages;
};
