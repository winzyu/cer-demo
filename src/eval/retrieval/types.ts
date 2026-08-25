/**
 * The retrieval-evaluation contract: what a labelled query looks like, and what a scored run
 * reports.
 *
 * **Why this exists.** Until now the only way to tell whether a retrieval change helped was to
 * replay 58 conversations against an LLM and have a human grade the answers — hours of work and
 * real money per iteration, which makes tuning impossible. These labels move the question one
 * layer down: given a query, did the adapter put the right *chunks* in front of the model? That
 * is answerable offline, deterministically, in seconds, with no model in the loop.
 *
 * It measures something narrower than answer quality and must not be confused for it
 * (`HANDOFF.md` §4 makes the same point about the sweep's retrieval-miss rate). A perfect recall
 * score says the material was available, not that the answer was good. It is a *necessary*
 * condition, which is exactly what makes it a useful fast signal: retrieval failures are
 * unrecoverable downstream, so ruling them out first is the cheapest possible ordering.
 */

/** Chunk-level relevance, graded rather than binary, so nDCG can distinguish the two tiers. */
export const RELEVANCE_GRADES = [0, 1, 2] as const;
export type RelevanceGrade = (typeof RELEVANCE_GRADES)[number];

export interface RelevantChunk {
  /** Content-derived chunk id (`src/ingestion/chunk.ts`). Survives edits elsewhere in the file. */
  chunkId: string;
  /** Bare content hash — reconciles a label across a document rename, where `chunkId` cannot. */
  contentHash: string;
  filename: string;
  /**
   * 2 — answers the query on its own.
   * 1 — supports or partially answers it; belongs in context but is not sufficient.
   * 0 — judged and rejected. Recorded rather than omitted, so a near-miss that keeps getting
   *     retrieved is distinguishable from a chunk nobody ever looked at.
   */
  grade: RelevanceGrade;
  /** Verbatim snippet from the chunk justifying the grade. Keeps a label auditable. */
  evidence: string;
}

export interface LabelledQuery {
  /** 1-based position within the conversation. */
  turn: number;
  /** Exact text handed to `getContext` — the fixture's user turn, verbatim. */
  query: string;
  relevant: RelevantChunk[];
  /**
   * Set when a turn is deliberately unlabelled — a refusal turn with no supporting chunk, or a
   * question whose answer is in the system prompt rather than the corpus. Scored as "no relevant
   * chunk exists", which is a real and gradeable expectation, not a gap in the labelling.
   */
  noRelevantChunks?: string;
}

export interface FixtureLabels {
  /** Matches the fixture id and the filename stem. */
  fixtureId: string;
  /** Which set the fixture came from — the committed 30, or the proposed next 18. */
  set: "committed" | "next";
  /** Fixture class, carried here so metrics can break down per class without loading fixtures. */
  fixtureClass: string;
  turns: LabelledQuery[];
}

/** One adapter's ranked result for one query, as captured by the runner. */
export interface RankedResult {
  chunkId: string;
  filename: string;
  rank: number;
  score?: number;
}

export interface QueryScore {
  fixtureId: string;
  fixtureClass: string;
  turn: number;
  recall: number;
  precision: number;
  reciprocalRank: number;
  ndcg: number;
  /** True when the label says no chunk is relevant and the adapter agreed by returning none. */
  correctlyEmpty?: boolean;
}

export interface RunSummary {
  adapter: string;
  k: number;
  queries: number;
  recall: number;
  precision: number;
  mrr: number;
  ndcg: number;
  perClass: Record<string, { queries: number; recall: number; mrr: number; ndcg: number }>;
}
