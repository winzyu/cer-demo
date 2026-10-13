/**
 * When a metric is flagged, shared by chat (`query_sensor_data`) and the report (`flagFor`,
 * `events.ts`), so the two can never disagree. Decisions of 2026-10-13 (docs/timeline.md), on
 * Michael's rules of 2026-10-12 and source-of-truth v2.
 *
 * Every kept reading is one of three things here (device faults never reach this file; QC in
 * `devices/readingQc.ts` leaves them out):
 *
 * - **unusual**: QC labelled it suspect (a spike, a jump faster than v2 §8.2's rate of change, pH
 *   outside 3-12, a short flat line). It stays in the data and in every share's denominator, but
 *   never counts toward a flag.
 * - **out of range**: beyond the limit by more than v2 §8.3's minimum detectable change (the
 *   noise cushion, Michael's "about 2 x the probe's accuracy").
 * - **normal**: everything else.
 *
 * A metric is **flagged** where its out-of-range readings reach `FLAG_SHARE` of the kept readings
 * in some rolling `FLAG_WINDOW_MS`, and number at least `MIN_FLAG_READINGS` (Michael #1 and #2).
 * At 48 readings a day the minimum binds: 3 readings, consecutive or not. A brief jump stays
 * quiet because its first reading is unusual. High and low are counted separately.
 *
 * A flag is **current** only when the latest 24 hours meet the rule on their own (Michael #4);
 * Action Required needs a current flag beyond the limit by `EXCEEDANCE_MARGIN` of the range.
 * Past flags are told in the past tense.
 *
 * Two mentions sit below a flag and lift a report to Watch at most:
 * - the **edge rule** (Michael #6, "right at or around the thresholds for an extended period"):
 *   readings within one cushion of a limit for `EDGE_PLATEAU_MS` in a row, or for `EDGE_STREAK_MS`
 *   on at least `EDGE_DAY_SHARE` of the period's days with at least `EDGE_MIN_DAYS` such days;
 * - **unusual stretches**: unusual readings that themselves meet the share rule, mentioned with a
 *   calibration check and never called a fault. Only readings unusual for their value count:
 *   spikes and jumps are a moment, and a brief blip stays quiet (Michael #1).
 */

import { MAX_GAP_MS } from "../devices/readingQc";

/** Out-of-range share of the kept readings in a rolling window that flags a metric (Michael #1). */
export const FLAG_SHARE = 0.05;
/** The rolling window the share is taken over (Michael #2). */
export const FLAG_WINDOW_MS = 24 * 60 * 60_000;
/** The fewest out-of-range readings that flag, so a sparse window (1 of 10) does not. */
export const MIN_FLAG_READINGS = 3;
/**
 * The report's Action Required step: a current flag beyond the limit by this share of the range's
 * width, or by the minimum detectable change where that is larger. This project's number, not a
 * source's; provisional (docs/timeline.md, 2026-10-13).
 */
export const EXCEEDANCE_MARGIN = 0.15;
/**
 * Flagged readings making up at least this share of the kept readings are a persistent offset:
 * the likelier cause is a threshold that does not fit the site, fouling or calibration (v2 §7.2
 * rule 7), the same share `events.ts` uses for a persistent event window.
 */
export const PERSISTENT_SHARE = 0.8;
/** Edge rule: a streak this long at the edge, in a row, is an extended period on its own. */
export const EDGE_PLATEAU_MS = 12 * 60 * 60_000;
/** Edge rule: the shortest daily streak at the edge that counts toward the daily pattern. */
export const EDGE_STREAK_MS = 2 * 60 * 60_000;
/** Edge rule: the daily pattern needs streaks on at least this share of the period's days... */
export const EDGE_DAY_SHARE = 0.5;
/** ...and on at least this many days, so one odd afternoon in a short window does not count. */
export const EDGE_MIN_DAYS = 3;

const HALF_DAY_MS = 12 * 60 * 60_000;
/** Flagged readings further apart than this start a new stretch. */
const STRETCH_GAP_MS = HALF_DAY_MS;

/**
 * What QC called a kept reading it did not pass. "moment": unusual for how it moved (a spike, a
 * jump faster than v2's rate of change). "value": unusual for its value (pH outside 3-12, a short
 * flat line). Neither counts toward a flag; only "value" counts toward an unusual stretch, because
 * a moment is brief by nature: one blip makes two jumps, up and back, and Michael asked that
 * brief things stay quiet.
 */
export type UnusualKind = "moment" | "value";

/** One kept reading: epoch ms, value in its metric's units, and what QC called it, if unusual. */
export type TimedValue = readonly [number, number, UnusualKind?];

export interface Limit {
  min: number;
  max: number;
}

export type Direction = "high" | "low";

/** A flagged stretch: flagged readings on one side, each within 12 hours of the next. */
export interface FlagEpisode {
  direction: Direction;
  startMs: number;
  endMs: number;
  /** Flagged out-of-range readings in the episode. */
  readings: number;
  /** The episode's highest reading for a high episode, lowest for a low one. */
  extreme: number;
}

/** Unusual readings that met the share rule themselves. */
export interface UnusualStretch {
  startMs: number;
  endMs: number;
  readings: number;
  lowest: number;
  highest: number;
}

/** Michael's edge rule, when it applies. */
export interface EdgeFinding {
  side: Direction;
  /** "plateau": 12 hours or more in a row; "daily": a few hours on most days. */
  shape: "plateau" | "daily";
  /** Days with a streak of `EDGE_STREAK_MS` or more at the edge. */
  days: number;
  /** Days the period spans. */
  periodDays: number;
  /** The longest streak at the edge. */
  longestMs: number;
  lowest: number;
  highest: number;
}

/** How far past a limit a reading must sit to count, in the metric's units, near that reading. */
export type Margin = (reading: number) => number;

const isUnusual = (point: TimedValue): boolean => point[2] !== undefined;

// Reduced rather than spread: a month of readings overflows the call stack as arguments.
const largest = (values: readonly number[]): number => values
  .reduce((a, b) => Math.max(a, b), -Infinity);
const smallest = (values: readonly number[]): number => values
  .reduce((a, b) => Math.min(a, b), Infinity);

/**
 * Indices of the `counted` readings that sit in some rolling `FLAG_WINDOW_MS` meeting the share
 * rule. Windows anchored at each reading's start and end are enough: any qualifying window can
 * be slid until one of its counted readings sits on an edge without losing a counted reading.
 */
const inQualifyingWindows = (
  values: readonly TimedValue[],
  counted: readonly boolean[],
): Set<number> => {
  const n = values.length;
  const prefix = [0];
  counted.forEach((c, i) => prefix.push(prefix[i] + (c ? 1 : 0)));
  const cover = new Array<number>(n + 1).fill(0);
  const consider = (start: number, end: number): void => {
    const count = prefix[end + 1] - prefix[start];
    if (count >= MIN_FLAG_READINGS && count / (end - start + 1) >= FLAG_SHARE) {
      cover[start] += 1;
      cover[end + 1] -= 1;
    }
  };
  let end = 0;
  for (let start = 0; start < n; start += 1) {
    if (end < start) end = start;
    while (end + 1 < n && values[end + 1][0] - values[start][0] < FLAG_WINDOW_MS) end += 1;
    if (counted[start]) consider(start, end);
  }
  let start = 0;
  for (let last = 0; last < n; last += 1) {
    while (values[last][0] - values[start][0] >= FLAG_WINDOW_MS) start += 1;
    if (counted[last]) consider(start, last);
  }
  const flagged = new Set<number>();
  let depth = 0;
  for (let i = 0; i < n; i += 1) {
    depth += cover[i];
    if (depth > 0 && counted[i]) flagged.add(i);
  }
  return flagged;
};

/**
 * Groups flagged indices into stretches: a stretch ends where the next flagged reading is more
 * than `STRETCH_GAP_MS` later, so a report names each flagged day or afternoon (Michael #5) rather
 * than chaining a week of daily dips into one stretch, while one day's scattered readings stay
 * one stretch.
 */
const stretches = (values: readonly TimedValue[], flagged: Set<number>): TimedValue[][] => {
  const groups: TimedValue[][] = [];
  [...flagged].sort((a, b) => a - b).forEach((i) => {
    const group = groups[groups.length - 1];
    const previous = group?.[group.length - 1];
    if (previous && values[i][0] - previous[0] <= STRETCH_GAP_MS) group.push(values[i]);
    else groups.push([values[i]]);
  });
  return groups;
};

const beyond = (point: TimedValue, limit: Limit, margin: Margin, side: Direction): boolean => {
  if (isUnusual(point)) return false;
  const [, value] = point;
  return side === "high" ? value > limit.max + margin(value) : value < limit.min - margin(value);
};

/** Flagged episodes on both sides, oldest first. `values` must be in time order. */
export const flagEpisodes = (
  values: readonly TimedValue[],
  limit: Limit,
  margin: Margin,
): FlagEpisode[] => (["high", "low"] as const)
  .flatMap((direction) => {
    const counted = values.map((point) => beyond(point, limit, margin, direction));
    return stretches(values, inQualifyingWindows(values, counted)).map((group) => {
      const readings = group.map(([, v]) => v);
      return {
        direction,
        startMs: group[0][0],
        endMs: group[group.length - 1][0],
        readings: group.length,
        extreme: direction === "high" ? largest(readings) : smallest(readings),
      };
    });
  })
  .sort((a, b) => a.startMs - b.startMs);

/** Whether the latest `FLAG_WINDOW_MS` of `values` meets the share rule on one side. */
const latestDayFlagged = (
  values: readonly TimedValue[],
  limit: Limit,
  margin: Margin,
): boolean => {
  const newest = values[values.length - 1]?.[0];
  if (newest === undefined) return false;
  const day = values.filter(([ms]) => newest - ms < FLAG_WINDOW_MS);
  return (["high", "low"] as const).some((side) => {
    const count = day.filter((point) => beyond(point, limit, margin, side)).length;
    return count >= MIN_FLAG_READINGS && count / day.length >= FLAG_SHARE;
  });
};

/**
 * Readings unusual for their value that meet the share rule themselves. `values` in time order.
 */
export const unusualStretches = (values: readonly TimedValue[]): UnusualStretch[] => {
  const counted = values.map((point) => point[2] === "value");
  return stretches(values, inQualifyingWindows(values, counted)).map((group) => {
    const readings = group.map(([, v]) => v);
    return {
      startMs: group[0][0],
      endMs: group[group.length - 1][0],
      readings: group.length,
      lowest: smallest(readings),
      highest: largest(readings),
    };
  });
};

/**
 * Michael's edge rule on one side: readings within one cushion of the limit, either side of it,
 * held for `EDGE_PLATEAU_MS` in a row, or for `EDGE_STREAK_MS` on enough days. A streak is broken
 * by a reading off the edge, an unusual reading, or a silence over `MAX_GAP_MS`; two streaks count
 * as separate days only when they start at least 12 hours apart.
 */
const edgeOn = (
  values: readonly TimedValue[],
  limit: Limit,
  margin: Margin,
  side: Direction,
): EdgeFinding | undefined => {
  const edge = side === "high" ? limit.max : limit.min;
  const atEdge = (point: TimedValue): boolean => !isUnusual(point)
    && Math.abs(point[1] - edge) <= margin(point[1]);
  const streaks: TimedValue[][] = [];
  let streak: TimedValue[] = [];
  values.forEach((point) => {
    const previous = streak[streak.length - 1];
    if (!atEdge(point) || (previous && point[0] - previous[0] > MAX_GAP_MS)) {
      if (streak.length > 0) streaks.push(streak);
      streak = [];
    }
    if (atEdge(point)) streak.push(point);
  });
  if (streak.length > 0) streaks.push(streak);

  const span = (s: TimedValue[]): number => s[s.length - 1][0] - s[0][0];
  const long = streaks.filter((s) => span(s) >= EDGE_STREAK_MS);
  if (long.length === 0) return undefined;
  const dayStarts = long.reduce<number[]>((starts, s) => {
    const last = starts[starts.length - 1];
    return last === undefined || s[0][0] - last >= HALF_DAY_MS ? [...starts, s[0][0]] : starts;
  }, []);
  const first = values[0][0];
  const last = values[values.length - 1][0];
  const periodDays = Math.max(1, Math.ceil((last - first) / FLAG_WINDOW_MS));
  const longestMs = largest(long.map(span));
  const days = dayStarts.length;
  let shape: EdgeFinding["shape"] | undefined;
  if (longestMs >= EDGE_PLATEAU_MS) shape = "plateau";
  else if (days >= EDGE_MIN_DAYS && days >= EDGE_DAY_SHARE * periodDays) shape = "daily";
  if (!shape) return undefined;
  const readings = long.flat().map(([, v]) => v);
  return {
    side,
    shape,
    days,
    periodDays,
    longestMs,
    lowest: smallest(readings),
    highest: largest(readings),
  };
};

/** Everything a caller reads about one metric's readings against one limit. */
export interface FlagAssessment {
  /** Episodes beyond the limit plus the minimum detectable change: the flag. */
  episodes: FlagEpisode[];
  /** Episodes beyond the limit plus the larger of the exceedance margin and that change. */
  exceedance: FlagEpisode[];
  /** True when the latest 24 hours meet the share rule on their own. */
  current: boolean;
  /** True when the latest 24 hours meet it beyond the exceedance margin: Action Required. */
  currentExceedance: boolean;
  /** True when flagged readings are at least `PERSISTENT_SHARE` of the kept readings. */
  persistent: boolean;
  /** The edge rule, only when nothing is flagged. */
  edge?: EdgeFinding;
}

export const assessFlags = (
  values: readonly TimedValue[],
  limit: Limit,
  minimumDetectableChange: Margin,
  exceedanceMargin = EXCEEDANCE_MARGIN,
): FlagAssessment => {
  const width = (limit.max - limit.min) * exceedanceMargin;
  const wide: Margin = (reading) => Math.max(width, minimumDetectableChange(reading));
  const episodes = flagEpisodes(values, limit, minimumDetectableChange);
  const flagged = episodes.reduce((sum, e) => sum + e.readings, 0);
  const edge = episodes.length > 0 ? undefined
    : edgeOn(values, limit, minimumDetectableChange, "low")
      ?? edgeOn(values, limit, minimumDetectableChange, "high");
  return {
    episodes,
    exceedance: flagEpisodes(values, limit, wide),
    current: latestDayFlagged(values, limit, minimumDetectableChange),
    currentExceedance: latestDayFlagged(values, limit, wide),
    persistent: values.length > 0 && flagged / values.length >= PERSISTENT_SHARE,
    ...(edge ? { edge } : {}),
  };
};

export type VerdictStatus =
  | "in range"
  | "out of range"
  | "likely data issue"
  | "not assessed"
  | "not enough data";

export interface MetricVerdict {
  status: VerdictStatus;
  /** Present whenever a limit was assessed; episodes are those reaching into the window. */
  flags?: FlagAssessment;
  /** Unusual stretches reaching into the window, limit or not. */
  unusual: UnusualStretch[];
}

/**
 * One metric's verdict over a window starting at `fromMs`. `values` are the window's kept
 * readings and `lookback` the kept readings before it, both in time order; the day before the
 * window is judged with it, so a flagged day straddling its start, or a "right now" question
 * answered from one reading, is judged on the full 24 hours (docs/timeline.md, 2026-10-11).
 *
 * "Likely data issue" is only for a window whose readings were all device faults
 * (`faultedOnly`): device faults elsewhere are reported beside the verdict, never instead of it.
 */
export const judgeMetric = (input: {
  values: readonly TimedValue[];
  lookback?: readonly TimedValue[];
  fromMs?: number;
  limit?: Limit;
  minimumDetectableChange: Margin;
  faultedOnly?: boolean;
}): MetricVerdict => {
  const start = input.values[0]?.[0] ?? input.fromMs ?? Infinity;
  const fromMs = input.fromMs ?? start;
  const values = [
    ...(input.lookback ?? []).filter(([ms]) => start - ms < FLAG_WINDOW_MS),
    ...input.values,
  ];
  const reaches = (s: { endMs: number }): boolean => s.endMs >= fromMs;
  const unusual = unusualStretches(values).filter(reaches);
  if (input.faultedOnly && input.values.length === 0) return { status: "likely data issue", unusual };
  if (!input.limit) return { status: "not assessed", unusual };
  if (values.length < MIN_FLAG_READINGS) return { status: "not enough data", unusual };
  const all = assessFlags(values, input.limit, input.minimumDetectableChange);
  const episodes = all.episodes.filter(reaches);
  // The edge rule counts the window's own days, not the day of lookback before it.
  const edge = episodes.length > 0 || input.values.length === 0 ? undefined
    : assessFlags(input.values, input.limit, input.minimumDetectableChange).edge;
  const flags: FlagAssessment = {
    episodes,
    exceedance: all.exceedance.filter(reaches),
    current: all.current,
    currentExceedance: all.currentExceedance,
    persistent: all.persistent,
    ...(edge ? { edge } : {}),
  };
  return { status: flags.episodes.length > 0 ? "out of range" : "in range", flags, unusual };
};
