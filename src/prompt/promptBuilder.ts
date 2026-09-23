import { config } from "../config";
import type { ChatMessage } from "../types/chat.types";
import type { Chunk } from "../types/retrieval.types";
import { buildSystemPrompt } from "./systemPrompt";

/**
 * Renders chunks as a context block. Each excerpt is labelled with its source so the model
 * can cite it — the system prompt requires citation, which is only possible if the source
 * survives into the prompt text.
 *
 * **The label uses the full-width `【n】` brackets the citation marker uses**, not ASCII `[n]`.
 * The system prompt asks for `【n†"quote"】`, and both citation checks in
 * `src/eval/gates/checks.ts` parse U+3010/U+3011 only. A model copies the delimiter it is shown,
 * so labelling in one bracket style and asking for another invites a translation step, and a
 * translation step is where a wrong excerpt number gets in. `n` is 1-based and indexes the same
 * `chunks` array `ChatController` returns as `citations`, which is what lets both the checker and
 * the interface resolve a marker back to its source.
 */
export const formatContext = (chunks: Chunk[]): string => {
  const excerpts = chunks
    .map((chunk, index) => `【${index + 1}】 (source: ${chunk.source})\n${chunk.text}`)
    .join("\n\n");

  return `CONTEXT — excerpts from the water-quality corpus:\n\n${excerpts}`;
};

/**
 * Tells the model which pod the user picked in the interface.
 *
 * Without it the model only learns the pod once a tool runs (`ChatOrchestrator` fills a tool's
 * missing `device` from the request), so with several pods visible it asked "which pod?" instead
 * of calling the tool at all, even though the answer was already on the request. The name is
 * reduced to one line with no quotes, so a pod name cannot close the sentence it sits in.
 */
export const formatSelectedDevice = (device: string): string => {
  const name = device.replace(/["“”\s]+/g, " ").trim();
  return `SELECTED POD: the user has selected the pod "${name}" in the interface. For a `
    + "question about readings or a report, use this pod unless the user names a different "
    + "one; do not ask which pod they mean.";
};

export interface BuildMessagesInput {
  query: string;
  chunks: Chunk[];
  /** Prior turns, oldest first. Passed through unchanged. */
  history?: ChatMessage[];
  /** The pod chosen in the interface, if any (`device` on the chat request). */
  selectedDevice?: string;
  /** Whether a device tool is offered; the pod line is noise to a model with no tools. */
  toolsEnabled?: boolean;
}

/**
 * Assembles the message list sent to the model.
 *
 * **Order is load-bearing, not stylistic:** most static content first, most dynamic last.
 *
 *   1. system prompt   — identical on every request for a given deployment
 *   2. document context — identical per corpus slice (direct-feed) or per query (RAG)
 *   3. history          — grows over a conversation
 *   4. selected pod     - per request, only when one was sent and a device tool is on
 *   5. the user question — different every time
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
  selectedDevice,
  toolsEnabled = config.tools.sensorTool || config.tools.reportTool,
}: BuildMessagesInput): ChatMessage[] => {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() },
  ];

  // Omitted entirely when empty: an empty "CONTEXT:" heading reads to the model as
  // "the corpus had nothing", which is a different claim from "no corpus was consulted".
  if (chunks.length > 0) {
    messages.push({ role: "system", content: formatContext(chunks) });
  }

  messages.push(...history);
  // Per request, so it goes after everything cacheable and just before the question. Eval
  // captures send no device and run with the tools off, so their prompt is unchanged.
  const pod = selectedDevice?.trim();
  if (pod && toolsEnabled) {
    messages.push({ role: "system", content: formatSelectedDevice(pod) });
  }
  messages.push({ role: "user", content: query });

  return messages;
};
