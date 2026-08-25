import type {
  LabelledQuery, QueryScore, RankedResult, RelevanceGrade, RunSummary,
} from "./types";

/**
 * The retrieval metrics, as pure functions over (labels, ranked results).
 *
 * Kept free of I/O so they can be tested against hand-computed cases. Every one of these has a
 * textbook definition and a dozen subtly different implementations in the wild; the choices made
 * here are written down because a metric nobody can reproduce is not evidence.
 */

/** Grade above which a chunk counts as a "hit" for the binary metrics (recall, precision, MRR). */
export const HIT_THRESHOLD: RelevanceGrade = 1;

const relevantIds = (
  label: LabelledQuery,
  minGrade: RelevanceGrade = HIT_THRESHOLD,
): Set<string> => new Set(
  label.relevant.filter((c) => c.grade >= minGrade).map((c) => c.chunkId),
);

const gradeById = (label: LabelledQuery): Map<string, RelevanceGrade> => new Map(
  label.relevant.map((c) => [c.chunkId, c.grade]),
);

/**
 * Recall@k — of the chunks that should have been retrieved, what fraction were?
 *
 * **This is the metric that matters most here**, because a retrieval miss is unrecoverable: the
 * model cannot reason about text it was never given. Precision failures are survivable — an extra
 * irrelevant chunk costs tokens and some distraction, not correctness.
 *
 * Returns 1 for a query with no relevant chunks, rather than 0 or NaN. "Retrieved all zero of the
 * zero relevant chunks" is vacuously complete, and scoring it 0 would punish an adapter for a
 * label that says there was nothing to find.
 */
export const recallAtK = (label: LabelledQuery, results: RankedResult[], k: number): number => {
  const wanted = relevantIds(label);
  if (wanted.size === 0) return 1;
  const retrieved = results.slice(0, k).filter((r) => wanted.has(r.chunkId)).length;
  return retrieved / wanted.size;
};

/**
 * Precision@k — of what was retrieved, what fraction was relevant.
 *
 * Denominator is `min(k, results.length)`, not `k`: an adapter that returns 3 chunks when k=5 is
 * not penalised for the two it declined to invent.
 */
export const precisionAtK = (label: LabelledQuery, results: RankedResult[], k: number): number => {
  const top = results.slice(0, k);
  if (top.length === 0) return relevantIds(label).size === 0 ? 1 : 0;
  const wanted = relevantIds(label);
  return top.filter((r) => wanted.has(r.chunkId)).length / top.length;
};

/**
 * Reciprocal rank — 1/(rank of the first relevant chunk), 0 if none appear.
 *
 * Rank position matters even when recall is identical: top-k is fed to the model in order, and
 * with a limited context the first slot is worth more than the fifth.
 */
export const reciprocalRank = (
  label: LabelledQuery,
  results: RankedResult[],
  k: number,
): number => {
  const wanted = relevantIds(label);
  if (wanted.size === 0) return 1;
  const index = results.slice(0, k).findIndex((r) => wanted.has(r.chunkId));
  return index === -1 ? 0 : 1 / (index + 1);
};

/**
 * nDCG@k with the standard `(2^grade - 1) / log2(rank + 1)` gain.
 *
 * This is the only metric that uses the 0/1/2 scale rather than collapsing it: a chunk that
 * answers the query outright is worth more than one that merely supports it, and an adapter that
 * ranks the supporting chunk first should score below one that leads with the answer.
 */
export const ndcgAtK = (label: LabelledQuery, results: RankedResult[], k: number): number => {
  const grades = gradeById(label);
  const gain = (grade: number): number => (2 ** grade) - 1;

  const dcg = results.slice(0, k).reduce(
    (sum, r, i) => sum + (gain(grades.get(r.chunkId) ?? 0) / Math.log2(i + 2)),
    0,
  );

  const ideal = label.relevant
    .map((c) => c.grade as number)
    .sort((a, b) => b - a)
    .slice(0, k)
    .reduce((sum, grade, i) => sum + (gain(grade) / Math.log2(i + 2)), 0);

  if (ideal === 0) return dcg === 0 ? 1 : 0;
  return dcg / ideal;
};

/**
 * Scores one query. A turn labelled `noRelevantChunks` is scored on whether the adapter returned
 * nothing — which is a real expectation for a refusal turn, not an unlabelled gap.
 */
export const scoreQuery = (
  fixtureId: string,
  fixtureClass: string,
  label: LabelledQuery,
  results: RankedResult[],
  k: number,
): QueryScore => {
  const expectsNothing = label.noRelevantChunks !== undefined || label.relevant.length === 0;
  return {
    fixtureId,
    fixtureClass,
    turn: label.turn,
    recall: recallAtK(label, results, k),
    precision: precisionAtK(label, results, k),
    reciprocalRank: reciprocalRank(label, results, k),
    ndcg: ndcgAtK(label, results, k),
    ...(expectsNothing ? { correctlyEmpty: results.slice(0, k).length === 0 } : {}),
  };
};

const mean = (values: number[]): number => (
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
);

/** Macro-averages across queries, plus the per-class breakdown that localises a regression. */
export const summarise = (adapter: string, k: number, scores: QueryScore[]): RunSummary => {
  const byClass: RunSummary["perClass"] = {};

  scores.forEach((s) => {
    if (!byClass[s.fixtureClass]) {
      byClass[s.fixtureClass] = {
        queries: 0, recall: 0, mrr: 0, ndcg: 0,
      };
    }
  });

  Object.keys(byClass).forEach((cls) => {
    const inClass = scores.filter((s) => s.fixtureClass === cls);
    byClass[cls] = {
      queries: inClass.length,
      recall: mean(inClass.map((s) => s.recall)),
      mrr: mean(inClass.map((s) => s.reciprocalRank)),
      ndcg: mean(inClass.map((s) => s.ndcg)),
    };
  });

  return {
    adapter,
    k,
    queries: scores.length,
    recall: mean(scores.map((s) => s.recall)),
    precision: mean(scores.map((s) => s.precision)),
    mrr: mean(scores.map((s) => s.reciprocalRank)),
    ndcg: mean(scores.map((s) => s.ndcg)),
    perClass: byClass,
  };
};
