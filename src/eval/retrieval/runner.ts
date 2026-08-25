import { readCorpus } from "../../ingestion/ingest";
import type { Chunk } from "../../types/retrieval.types";
import { loadLabels, type LoadedLabels } from "./labels";
import { scoreQuery, summarise } from "./metrics";
import type { QueryScore, RankedResult, RunSummary } from "./types";

/**
 * Replays every labelled query through one retrieval adapter and scores what came back.
 *
 * **The granularity problem, and how it is handled.** Adapters do not all retrieve the same kind
 * of thing. `firestore-direct` returns whole *documents* — the ◆G9 slice, every request,
 * regardless of query. The vector arms return *chunks*. Labels are chunk-level, because that is
 * the resolution at which "did the right text reach the model" is a meaningful question.
 *
 * So a document-level result is **expanded into the chunks it contains** before scoring. That is
 * not a trick to flatter direct-feed; it is literally what reaches the prompt. It does mean
 * direct-feed scores near-perfect recall on in-slice material and zero on everything else, with
 * poor precision throughout — which is an accurate description of feeding a fixed slice, and
 * matches the 7.1%-vs-33.9% retrieval-miss split measured in the Phase N2 sweep.
 *
 * Consequently **k is applied by the adapter, not by the scorer.** Each adapter truncates at its
 * own granularity via its configured top-k; everything that survives is what the model saw, and
 * that whole set is scored. Truncating direct-feed's expanded chunks to an arbitrary k would
 * score it on a prefix of the slice that no request ever sees.
 */

export interface AdapterLike {
  readonly mode: string;
  getContext(query: string, opts?: { topK?: number }): Promise<Chunk[]>;
}

export interface RunOptions {
  topK?: number;
  labels?: LoadedLabels;
  corpusPath?: string;
  /** Called after each query, for progress on a slow adapter. */
  onQuery?: (index: number, total: number) => void;
}

export interface RunResult {
  summary: RunSummary;
  scores: QueryScore[];
  /** Mean chunks placed in context per query — the cost side of a recall number. */
  meanChunksInContext: number;
  /** Ranked chunk ids per query, keyed `fixtureId#turn`. The golden-snapshot payload. */
  retrieved: Record<string, string[]>;
}

/** filename -> chunk ids, in reading order. Used to expand document-level results. */
const chunkIndex = (corpusPath?: string): Map<string, string[]> => {
  const corpus = readCorpus(corpusPath);
  return new Map(corpus.documents.map((d) => [d.filename, d.chunks.map((c) => c.id)]));
};

const toRanked = (
  chunks: Chunk[],
  byFilename: Map<string, string[]>,
): RankedResult[] => {
  const out: RankedResult[] = [];
  chunks.forEach((chunk) => {
    // A document-level id is a corpus filename; a chunk-level id is not.
    const expanded = byFilename.get(chunk.id);
    if (expanded) {
      expanded.forEach((chunkId) => {
        out.push({
          chunkId, filename: chunk.id, rank: out.length + 1, score: chunk.score,
        });
      });
    } else {
      out.push({
        chunkId: chunk.id, filename: chunk.source, rank: out.length + 1, score: chunk.score,
      });
    }
  });
  return out;
};

export const runRetrievalEval = async (
  adapter: AdapterLike,
  options: RunOptions = {},
): Promise<RunResult> => {
  const labels = options.labels ?? loadLabels(undefined, options.corpusPath);
  const byFilename = chunkIndex(options.corpusPath);

  const scores: QueryScore[] = [];
  const retrieved: Record<string, string[]> = {};
  let totalChunks = 0;

  for (let i = 0; i < labels.queries.length; i += 1) {
    const { fixtureId, fixtureClass, label } = labels.queries[i];
    // eslint-disable-next-line no-await-in-loop
    const context = await adapter.getContext(label.query, { topK: options.topK });
    const ranked = toRanked(context, byFilename);

    totalChunks += ranked.length;
    retrieved[`${fixtureId}#${label.turn}`] = ranked.map((r) => r.chunkId);
    // k = everything that reached the prompt; see the granularity note above.
    scores.push(scoreQuery(fixtureId, fixtureClass, label, ranked, ranked.length));
    options.onQuery?.(i + 1, labels.queries.length);
  }

  return {
    summary: summarise(adapter.mode, options.topK ?? 0, scores),
    scores,
    meanChunksInContext: labels.queries.length === 0 ? 0 : totalChunks / labels.queries.length,
    retrieved,
  };
};
