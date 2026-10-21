import type { ChatMessage } from "../types/chat.types";
import type { Chunk } from "../types/retrieval.types";
import type { RewriteCompleter } from "./queryRewrite";
import type { LlmUsage } from "../services/LlmService";
import { createLogger } from "../utils/logger";

const log = createLogger("QueryDecompose");

/**
 * Cross-document query splitting, measured offline only (`retrieval:eval --decompose`).
 *
 * **Why this exists.** A question that joins two documents ("does the ORP drift the manual warns
 * about matter for the dissolved-oxygen steady-state rule?") embeds as one vector somewhere
 * between its subjects, so the top k fills with whichever subject dominates and the other
 * document's passage never reaches the prompt. Cross-document is the weakest class after
 * follow-up rewriting. This asks the model to split such a question into two or three
 * single-subject search queries, searches each, and merges the rankings.
 *
 * The merge keeps the prompt the same size: the original query's own ranking is interleaved with
 * each sub-query's, rank by rank, duplicates dropped, cut at k. Keeping the original query's
 * ranking guards against a bad split, and a single-subject question the model returns unchanged
 * costs one model call and nothing else.
 *
 * Any failure falls back to the query alone: splitting is an optimisation, never a failure path.
 */

/** Sub-queries kept after cleaning; more dilutes each one's share of k. */
export const DECOMPOSE_MAX_QUERIES = 3;
/** A line longer than this is treated as the model answering instead of splitting. */
export const DECOMPOSE_MAX_CHARS = 300;

export const DECOMPOSE_SYSTEM_PROMPT = `You prepare search queries for a library of water-quality monitoring documents.
- If the question asks about two or three distinct subjects (instruments, parameters, procedures or documents) that are likely covered in different documents, write one short search query per subject, each naming its subject explicitly.
- If the question has a single subject, return it unchanged as the only query.
- Do not answer the question, and do not add subjects it does not ask about.
Reply with one query per line, at most ${DECOMPOSE_MAX_QUERIES} lines, with no numbering, quotes or explanation.`;

export interface DecomposeResult {
  /** The sub-queries to search; the query alone when it was not split or on any fallback. */
  queries: string[];
  decomposed: boolean;
  usage?: LlmUsage;
}

export const buildDecomposeMessages = (query: string): ChatMessage[] => [
  { role: "system", content: DECOMPOSE_SYSTEM_PROMPT },
  { role: "user", content: `Question:\n${query}\n\nSearch queries:` },
];

/** Non-empty lines without bullets, numbering or quotes; deduplicated, capped, overlong dropped. */
export const cleanSubQueries = (raw: string): string[] => {
  const seen = new Set<string>();
  return raw.split("\n")
    .map((l) => l.trim()
      .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .trim())
    .filter((l) => l !== "" && l.length <= DECOMPOSE_MAX_CHARS)
    .filter((l) => {
      const key = l.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, DECOMPOSE_MAX_QUERIES);
};

export const decomposeQuery = async (
  llm: RewriteCompleter,
  query: string,
): Promise<DecomposeResult> => {
  try {
    const answer = await llm.complete(buildDecomposeMessages(query));
    const queries = cleanSubQueries(answer.content);
    if (queries.length === 0) {
      log.warn("Query split returned nothing usable; searching with the query alone.");
      return { queries: [query], decomposed: false, usage: answer.usage };
    }
    const decomposed = queries.length > 1 || queries[0] !== query;
    return { queries: decomposed ? queries : [query], decomposed, usage: answer.usage };
  } catch (error) {
    log.warn(`Query split failed; searching with the query alone: ${error instanceof Error ? error.message : String(error)}`);
    return { queries: [query], decomposed: false };
  }
};

/**
 * Interleaves rankings rank by rank (first list first), dropping repeated chunk ids, and cuts at
 * `k`. Rank interleaving rather than score sorting: scores from separate searches are not on a
 * shared scale once a reranker or keyword arm is involved.
 */
export const mergeRankings = (rankings: Chunk[][], k: number): Chunk[] => {
  const out: Chunk[] = [];
  const seen = new Set<string>();
  const depth = Math.max(0, ...rankings.map((r) => r.length));
  for (let rank = 0; rank < depth; rank += 1) {
    rankings.forEach((ranking) => {
      const chunk = ranking[rank];
      if (chunk && !seen.has(chunk.id)) {
        seen.add(chunk.id);
        out.push(chunk);
      }
    });
  }
  return out.slice(0, k);
};
