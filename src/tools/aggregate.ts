/**
 * The aggregations the device API does not provide (`MIGRATION_SPEC.md` §8 step 4).
 *
 * **Why this is computed locally rather than read from `/water/average`.** That endpoint looks
 * like it would save the work, and using it would import two failure modes documented in
 * `docs/migration/DEVICE_API.md` §12:
 *
 * 1. **An empty window returns literal zeros for all six metrics**, not an error and not an
 *    empty body — a set of readings that parse as anoxic water at pH 0. There is no count field
 *    to tell the two apart.
 * 2. It averages **only rows where every probe was healthy**, so one faulty turbidity sensor
 *    silently removes that row from the dissolved-oxygen average too.
 *
 * Computing from the raw period series avoids both: an empty window is an empty array, and
 * validity is judged per metric, so a faulted turbidity probe costs you turbidity and nothing
 * else. The cost is transferring the rows — about 47 readings per pod-day, which is nothing.
 *
 * Every function here reports `excludedFaulted` alongside its answer. A statistic over a window
 * that was 80% faulted is not wrong, but it is not the same claim as one over a clean window,
 * and the difference has to reach the model rather than being averaged away.
 */

/** One metric's value at one instant, already decoded and unit-normalized. */
export interface Sample {
  /** Epoch ms. Derived from the reading's `observedAt`, never from the raw epoch-seconds field. */
  atMs: number;
  /** ISO-8601, for anything the model sees. */
  at: string;
  value: number;
  /** False when the metric's own error flag was set on this reading. */
  valid: boolean;
}

export const AGGREGATIONS = ["min", "max", "mean", "median", "latest", "raw"] as const;

export type Aggregation = (typeof AGGREGATIONS)[number];

export const isAggregation = (value: unknown): value is Aggregation => (
  typeof value === "string" && (AGGREGATIONS as readonly string[]).includes(value)
);

export interface AggregateResult {
  /** `null` when the window held no usable reading — **never 0**. See the module note. */
  value: number | null;
  /** Readings behind `value`. 0 means the answer is "no data", not "zero". */
  nSamples: number;
  /** Readings dropped because the device flagged that probe as faulted. */
  excludedFaulted: number;
  /** When `value` comes from one reading (`latest`), the instant it was taken. */
  observedAt?: string;
  /** Populated only by `raw`. */
  samples?: Array<{ at: string; value: number }>;
  /** Set when `raw` hit its cap, so a truncated series is never mistaken for a whole one. */
  truncated?: boolean;
}

const median = (sorted: number[]): number => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/**
 * Applies one aggregation to a window of samples.
 *
 * Faulted samples are excluded from every statistic — a probe the hardware says is broken
 * still reports a plausible number, which is precisely why it must not be averaged in.
 *
 * Note what is *not* here: no filtering on the value itself. `0` is a valid reading for ORP and
 * turbidity (`timeline.md`), so a falsy check would silently drop real measurements — and
 * dropping the zeros from a turbidity series is exactly the bias that would make an
 * uncalibrated-index problem look like clean water.
 */
export const aggregate = (
  samples: Sample[],
  aggregation: Aggregation,
  rawLimit: number,
): AggregateResult => {
  const usable = samples.filter((sample) => sample.valid);
  const excludedFaulted = samples.length - usable.length;

  if (usable.length === 0) {
    return { value: null, nSamples: 0, excludedFaulted };
  }

  const chronological = [...usable].sort((a, b) => a.atMs - b.atMs);
  const values = chronological.map((sample) => sample.value);
  const base = { nSamples: usable.length, excludedFaulted };

  switch (aggregation) {
    case "min":
      return { ...base, value: Math.min(...values) };
    case "max":
      return { ...base, value: Math.max(...values) };
    case "mean":
      return { ...base, value: values.reduce((sum, value) => sum + value, 0) / values.length };
    case "median":
      return { ...base, value: median([...values].sort((a, b) => a - b)) };
    case "latest": {
      const newest = chronological[chronological.length - 1];
      return { ...base, value: newest.value, observedAt: newest.at };
    }
    case "raw": {
      // Capped because raw output goes straight into the next prompt. Keeping the *most
      // recent* rows rather than the first ones: a truncated series should end where the
      // question does, so "what happened lately" is not answered with the oldest data in
      // the window.
      const truncated = chronological.length > rawLimit;
      const kept = truncated ? chronological.slice(-rawLimit) : chronological;
      return {
        ...base,
        // A series has no single value; the field stays null so nothing downstream can
        // quote one. The samples are the answer.
        value: null,
        samples: kept.map((sample) => ({ at: sample.at, value: sample.value })),
        ...(truncated ? { truncated: true } : {}),
      };
    }
    default: {
      const unreachable: never = aggregation;
      throw new Error(`Unhandled aggregation ${String(unreachable)}`);
    }
  }
};
