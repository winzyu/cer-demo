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
  /**
   * False when the value is physically impossible for its metric (`devices/plausibility.ts`) --
   * a probe rail the hardware did not flag.
   *
   * Optional, defaulting to plausible, because a caller that has not classified its samples
   * should get the pre-existing behaviour rather than have every reading silently dropped.
   * `QuerySensorData.samplesInRange` sets it for everything that reaches the tool paths.
   */
  plausible?: boolean;
}

/**
 * `earliest` is the mirror of `latest`, and it exists because of a real wrong answer.
 *
 * Asked for the earliest reading from a pod, the model reached for `raw` — the only aggregation
 * that could plausibly serve it — and `raw` caps at `rawLimit` **keeping the newest rows**. The
 * oldest row the model ever saw was therefore the 200th-from-last, and it reported that date as
 * the pod's first reading: 2026-08-12 against a true first reading of 2026-06-13. A real value,
 * a real timestamp, the wrong question answered, and nothing in the prose to show it.
 *
 * `series` exists for the same class of reason. A week of readings is ~336 rows; handing those to
 * a 20B model and asking it to spot a trend is asking the model to do arithmetic it is bad at,
 * over a window `raw` may have silently truncated. Bucketing computes the summary here instead.
 */
export const AGGREGATIONS = [
  "min", "max", "mean", "median", "latest", "earliest", "raw", "series",
] as const;

export type Aggregation = (typeof AGGREGATIONS)[number];

export const isAggregation = (value: unknown): value is Aggregation => (
  typeof value === "string" && (AGGREGATIONS as readonly string[]).includes(value)
);

/** One bucket of a `series`: a time slice with its own summary. */
export interface SeriesBucket {
  start: string;
  end: string;
  mean: number;
  min: number;
  max: number;
  n: number;
}

export interface AggregateResult {
  /** `null` when the window held no usable reading — **never 0**. See the module note. */
  value: number | null;
  /** Readings behind `value`. 0 means the answer is "no data", not "zero". */
  nSamples: number;
  /** Readings dropped because the device flagged that probe as faulted. */
  excludedFaulted: number;
  /**
   * Readings dropped because the value was physically impossible, despite the probe reporting
   * no fault (`devices/plausibility.ts`). Counted separately from `excludedFaulted` because the
   * two mean different things operationally: a faulted probe announced itself, an implausible
   * reading did not, and only the second one indicates a probe failing silently.
   */
  excludedImplausible: number;
  /** When `value` comes from one reading (`latest`/`earliest`), the instant it was taken. */
  observedAt?: string;
  /** Populated only by `raw`. */
  samples?: Array<{ at: string; value: number }>;
  /** Set when `raw` hit its cap, so a truncated series is never mistaken for a whole one. */
  truncated?: boolean;
  /**
   * Which end of the window survived truncation.
   *
   * Reported because the omission is what caused the wrong answer above: "truncated" alone does
   * not tell a reader that the *oldest* rows are the ones missing, which is exactly what makes a
   * question about the earliest reading unanswerable from this field.
   */
  truncatedKept?: "newest" | "oldest";
  /** Populated only by `series`. */
  series?: SeriesBucket[];
  /** Bucket width in ms, echoed so an auto-chosen bucket is visible rather than inferred. */
  bucketMs?: number;
}

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** Bucket widths a `series` may snap to, smallest first. */
const BUCKET_LADDER = [
  HOUR_MS, 2 * HOUR_MS, 3 * HOUR_MS, 6 * HOUR_MS, 12 * HOUR_MS,
  DAY_MS, 2 * DAY_MS, 7 * DAY_MS, 30 * DAY_MS,
];

/** How many buckets a series may return before it stops being a summary. */
export const DEFAULT_MAX_BUCKETS = 60;

export interface AggregateOptions {
  /** Explicit bucket width for `series`. Omit to let the span choose — see `autoBucketMs`. */
  bucketMs?: number;
  maxBuckets?: number;
}

/**
 * Picks a bucket width from the data's own span.
 *
 * Auto by default because choosing it is exactly the work worth taking off the model: asked for
 * "the last week", a 20B model picking `bucket: "hour"` gets 168 buckets and is no better off
 * than with raw rows. Snapping to a ladder keeps the answer human-sized whatever the window.
 */
export const autoBucketMs = (
  chronological: Sample[],
  maxBuckets: number = DEFAULT_MAX_BUCKETS,
): number => {
  const span = chronological[chronological.length - 1].atMs - chronological[0].atMs;
  if (span <= 0) {
    return HOUR_MS;
  }
  const needed = span / maxBuckets;
  return BUCKET_LADDER.find((width) => width >= needed) ?? BUCKET_LADDER[BUCKET_LADDER.length - 1];
};

/**
 * Groups samples into fixed-width buckets aligned to the epoch.
 *
 * Epoch-aligned rather than aligned to the first reading, so the same calendar hour lands in the
 * same bucket across two calls with slightly different windows — otherwise two series over
 * near-identical ranges are not comparable, which defeats the point of asking for one.
 *
 * **Empty buckets are omitted, not zero-filled.** A gap in reporting is not a reading of zero;
 * zero-filling here would reintroduce the exact fabrication the empty-window guard exists to
 * prevent, just at bucket granularity.
 */
export const bucketize = (
  chronological: Sample[],
  bucketMs: number,
  maxBuckets: number = DEFAULT_MAX_BUCKETS,
): SeriesBucket[] => {
  const buckets = new Map<number, number[]>();
  chronological.forEach((sample) => {
    const key = Math.floor(sample.atMs / bucketMs) * bucketMs;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(sample.value);
    } else {
      buckets.set(key, [sample.value]);
    }
  });

  const ordered = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  // Keep the most recent buckets if a caller forced a bucket width too fine for the window.
  const kept = ordered.length > maxBuckets ? ordered.slice(-maxBuckets) : ordered;

  return kept.map(([start, values]) => ({
    start: new Date(start).toISOString(),
    end: new Date(start + bucketMs).toISOString(),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    n: values.length,
  }));
};

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
 * Samples the caller marked implausible are excluded too, and counted separately — see
 * `Sample.plausible` and `devices/plausibility.ts`. That filter lives at the caller because it
 * is per-metric and this function is not told which metric it is reducing.
 *
 * Note what is *not* here: no filtering on the value itself. `0` is a valid reading for ORP and
 * turbidity (`timeline.md`), so a falsy check would silently drop real measurements — and
 * dropping the zeros from a turbidity series is exactly the bias that would make an
 * uncalibrated-index problem look like clean water. The plausibility bounds preserve that
 * carve-out explicitly rather than reintroducing it here.
 */
export const aggregate = (
  samples: Sample[],
  aggregation: Aggregation,
  rawLimit: number,
  options: AggregateOptions = {},
): AggregateResult => {
  // `plausible !== false` rather than a truthy check: the field is optional, and an unset one
  // means "not classified", which must keep the pre-existing include-everything behaviour.
  const faulted = samples.filter((sample) => !sample.valid);
  const implausible = samples.filter((sample) => sample.valid && sample.plausible === false);
  const usable = samples.filter((sample) => sample.valid && sample.plausible !== false);
  const excludedFaulted = faulted.length;
  const excludedImplausible = implausible.length;

  if (usable.length === 0) {
    return {
      value: null, nSamples: 0, excludedFaulted, excludedImplausible,
    };
  }

  const chronological = [...usable].sort((a, b) => a.atMs - b.atMs);
  const values = chronological.map((sample) => sample.value);
  const base = { nSamples: usable.length, excludedFaulted, excludedImplausible };

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
    case "earliest": {
      // Exact, and unaffected by any cap — the whole point of having it rather than making a
      // caller dig the first row out of a truncated `raw` series.
      const oldest = chronological[0];
      return { ...base, value: oldest.value, observedAt: oldest.at };
    }
    case "series": {
      const bucketMs = options.bucketMs ?? autoBucketMs(chronological, options.maxBuckets);
      return {
        ...base,
        // A series has no scalar answer, same as `raw`.
        value: null,
        series: bucketize(chronological, bucketMs, options.maxBuckets),
        bucketMs,
      };
    }
    case "raw": {
      // Capped because raw output goes straight into the next prompt. Keeping the *most
      // recent* rows rather than the first ones: a truncated series should end where the
      // question does, so "what happened lately" is not answered with the oldest data in
      // the window.
      //
      // The cost of that choice is that the oldest rows are the ones lost, which is why
      // `earliest` and `series` exist — neither is answerable from a truncated `raw`.
      const truncated = chronological.length > rawLimit;
      const kept = truncated ? chronological.slice(-rawLimit) : chronological;
      return {
        ...base,
        // A series has no single value; the field stays null so nothing downstream can
        // quote one. The samples are the answer.
        value: null,
        samples: kept.map((sample) => ({ at: sample.at, value: sample.value })),
        // `truncatedKept` travels with `truncated` and never without it: knowing rows were
        // dropped is useless without knowing which end they came off.
        ...(truncated ? { truncated: true, truncatedKept: "newest" as const } : {}),
      };
    }
    default: {
      const unreachable: never = aggregation;
      throw new Error(`Unhandled aggregation ${String(unreachable)}`);
    }
  }
};
