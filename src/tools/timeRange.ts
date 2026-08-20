import type { PeriodUnit } from "../types/device.types";

/**
 * Natural-language time-range parsing for `query_sensor_data` (`MIGRATION_SPEC.md` §4.3, §8).
 *
 * **The reference instant is the device's most recent reading, not the wall clock.** The legacy
 * service anchored to `MAX(measured_at)` because its CSV was a historical snapshot and
 * wall-clock ranges came back empty. That rule is *more* load-bearing here, not less: one of the
 * two cleared test pods (Old Woman Creek 2026) has been silent since 2026-08-07, so "the last
 * day" against a wall clock is an empty window on a pod that has a perfectly good last day of
 * data. See `docs/migration/DEVICE_API.md` §2.
 *
 * Parsing is therefore split in two. `parseTimeRange` reads the phrase into a shape that knows
 * its *span* but not its *anchor*; `resolveRange` applies the anchor once the device has told us
 * when it last reported. Nothing in this module reads the clock — the caller passes both instants
 * in, which is also what keeps its tests deterministic.
 *
 * **Calendar phrases resolve in UTC.** "today" means the UTC day containing the reference
 * reading, not the day at the pod's own longitude — the two cleared pods sit in different
 * timezones (Seal Beach CA and Huron OH) and the API carries no timezone for a reading. The
 * resolved bounds are returned as ISO timestamps and reported to the model for exactly this
 * reason: a caller who needs local midnight can see what was actually used instead of assuming.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/** Approximations, used only to size a fetch window — never to bound a reported range. */
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/** A phrase parsed but not yet anchored to an instant. */
export type ParsedRange =
  /** A rolling window ending at the reference instant: "last 3 days". */
  | { kind: "relative"; spanMs: number; label: string }
  /** A calendar block relative to the reference instant's UTC day: "today", "yesterday". */
  | { kind: "calendar"; unit: "day" | "week"; offsetUnits: number; label: string }
  /** Fully determined by the phrase itself: "2026-08-05 to 2026-08-07". */
  | { kind: "absolute"; startMs: number; endMs: number; label: string }
  /** The single most recent reading, whenever it happened: "now", "latest". */
  | { kind: "latest"; label: string };

export interface ResolvedRange {
  startMs: number;
  endMs: number;
  /** ISO-8601, what the model is shown and what it should quote back. */
  start: string;
  end: string;
  /** The phrase as parsed, echoed so a misreading is visible in the transcript. */
  label: string;
  /**
   * Whether a reading at exactly `endMs` belongs to this range.
   *
   * **True for anything anchored to the reference reading** — "last day" ends *at* the newest
   * reading, so excluding the endpoint would drop that reading from its own window. That is not
   * an edge case: it happens on every relative query, and it silently removes the single most
   * relevant measurement, which is the one the user is usually asking about.
   *
   * **False for calendar and absolute ranges**, whose ends are midnight boundaries. There the
   * exclusive end is what stops two adjacent windows both claiming a reading taken exactly at
   * midnight.
   */
  endInclusive: boolean;
}

export class TimeRangeError extends Error {}

const UNIT_MS: Record<string, number> = {
  hour: HOUR_MS,
  day: DAY_MS,
  week: WEEK_MS,
  month: MONTH_MS,
  year: YEAR_MS,
};

/** Accepted singular/plural unit words, mapped to their singular key in `UNIT_MS`. */
const normalizeUnitWord = (word: string): string | undefined => {
  const singular = word.endsWith("s") ? word.slice(0, -1) : word;
  return singular in UNIT_MS ? singular : undefined;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses `YYYY-MM-DD` as a UTC midnight instant.
 *
 * `Date.parse` accepts plenty this should reject ("2026-8-5", "2026-13-45" rolls over into the
 * next year), so the shape is checked first and the round-trip verified after: a date that
 * normalizes to something other than what was written is a typo, not a date.
 */
const parseIsoDate = (text: string): number | undefined => {
  const match = ISO_DATE.exec(text);
  if (!match) {
    return undefined;
  }
  const [, year, month, day] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (!Number.isFinite(ms)) {
    return undefined;
  }
  // Rejects 2026-02-30 and friends, which Date.UTC silently rolls forward.
  return new Date(ms).toISOString().slice(0, 10) === text ? ms : undefined;
};

const HINT = "Accepted forms: \"last N hours/days/weeks/months\", \"last day\", \"last week\", "
  + "\"today\", \"yesterday\", \"this week\", \"now\", \"YYYY-MM-DD\", \"YYYY-MM-DD to YYYY-MM-DD\".";

/**
 * Reads a time-range phrase. Throws `TimeRangeError` with the accepted forms rather than
 * guessing — a silently misparsed range answers a question nobody asked, with real numbers,
 * which is the failure mode this codebase treats as the dangerous one.
 */
export const parseTimeRange = (input: string): ParsedRange => {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");

  if (text === "") {
    throw new TimeRangeError(`time_range is empty. ${HINT}`);
  }

  if (["now", "latest", "current", "most recent", "last reading"].includes(text)) {
    return { kind: "latest", label: text };
  }

  if (text === "today") {
    return {
      kind: "calendar", unit: "day", offsetUnits: 0, label: "today",
    };
  }
  if (text === "yesterday") {
    return {
      kind: "calendar", unit: "day", offsetUnits: -1, label: "yesterday",
    };
  }
  if (text === "this week") {
    return {
      kind: "calendar", unit: "week", offsetUnits: 0, label: "this week",
    };
  }
  if (text === "last week" || text === "past week") {
    // Deliberately a rolling 7 days, not the previous calendar week. The legacy service
    // treated it that way (§4.3 lists it beside "last N weeks"), and for a sensor question
    // "the last week" overwhelmingly means "the last seven days of data".
    return { kind: "relative", spanMs: WEEK_MS, label: "last week" };
  }

  // "last day", "last 3 days", "past 6 hours" — the bulk of real usage.
  const relative = /^(?:last|past|previous) (?:(\d+) )?(hour|hours|day|days|week|weeks|month|months|year|years)$/
    .exec(text);
  if (relative) {
    const count = relative[1] === undefined ? 1 : Number(relative[1]);
    const unit = normalizeUnitWord(relative[2]);
    if (unit === undefined) {
      throw new TimeRangeError(`Unrecognized time unit in "${input}". ${HINT}`);
    }
    if (!Number.isInteger(count) || count < 1) {
      throw new TimeRangeError(`"${input}" needs a positive whole number of ${relative[2]}. ${HINT}`);
    }
    return {
      kind: "relative",
      spanMs: count * UNIT_MS[unit],
      label: `last ${count} ${unit}${count === 1 ? "" : "s"}`,
    };
  }

  // "2026-08-05 to 2026-08-07" — inclusive of the end date's whole day.
  const span = /^(\d{4}-\d{2}-\d{2}) (?:to|through|-|until) (\d{4}-\d{2}-\d{2})$/.exec(text);
  if (span) {
    const startMs = parseIsoDate(span[1]);
    const endMs = parseIsoDate(span[2]);
    if (startMs === undefined || endMs === undefined) {
      throw new TimeRangeError(`"${input}" contains a date that is not a real calendar date. ${HINT}`);
    }
    if (endMs < startMs) {
      throw new TimeRangeError(`"${input}" ends before it starts. ${HINT}`);
    }
    return {
      kind: "absolute",
      startMs,
      // The end date is a day, not an instant: "to 2026-08-07" includes the 7th.
      endMs: endMs + DAY_MS,
      label: `${span[1]} to ${span[2]}`,
    };
  }

  const single = parseIsoDate(text);
  if (single !== undefined) {
    return {
      kind: "absolute", startMs: single, endMs: single + DAY_MS, label: text,
    };
  }

  throw new TimeRangeError(`Could not understand time_range "${input}". ${HINT}`);
};

/** UTC midnight of the day containing `ms`. */
const startOfUtcDay = (ms: number): number => {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

/**
 * UTC midnight of the Monday on or before `ms`. ISO weeks start Monday, while `getUTCDay()`
 * counts from 0=Sunday.
 */
const startOfUtcWeek = (ms: number): number => {
  const dayStart = startOfUtcDay(ms);
  const weekday = new Date(dayStart).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return dayStart - daysSinceMonday * DAY_MS;
};

/**
 * Anchors a parsed phrase to an instant.
 *
 * `referenceMs` is the device's most recent reading — see the module note. `latest` collapses to
 * a zero-width window at the reference; the caller turns that into "the single newest reading"
 * rather than a range query.
 */
export const resolveRange = (parsed: ParsedRange, referenceMs: number): ResolvedRange => {
  const bounds = ((): { startMs: number; endMs: number } => {
    switch (parsed.kind) {
      case "relative":
        return { startMs: referenceMs - parsed.spanMs, endMs: referenceMs };
      case "absolute":
        return { startMs: parsed.startMs, endMs: parsed.endMs };
      case "latest":
        return { startMs: referenceMs, endMs: referenceMs };
      case "calendar": {
        if (parsed.unit === "day") {
          const start = startOfUtcDay(referenceMs) + parsed.offsetUnits * DAY_MS;
          return { startMs: start, endMs: start + DAY_MS };
        }
        const start = startOfUtcWeek(referenceMs) + parsed.offsetUnits * WEEK_MS;
        return { startMs: start, endMs: start + WEEK_MS };
      }
      default: {
        // Exhaustiveness: a new ParsedRange variant fails to compile rather than falling
        // through to a silently wrong window.
        const unreachable: never = parsed;
        throw new TimeRangeError(`Unhandled range ${JSON.stringify(unreachable)}`);
      }
    }
  })();

  return {
    ...bounds,
    start: new Date(bounds.startMs).toISOString(),
    end: new Date(bounds.endMs).toISOString(),
    label: parsed.label,
    endInclusive: parsed.kind === "relative" || parsed.kind === "latest",
  };
};

/**
 * How far back a fetch must reach, measured from *wall-clock* now.
 *
 * The device API's period route is a rolling window ending at the server's now, so the window
 * has to cover the gap between now and the oldest instant the phrase could possibly need —
 * which, for a relative phrase on a stale pod, is further back than the phrase's own span.
 */
export const lookbackMsFor = (parsed: ParsedRange, nowMs: number): number => {
  switch (parsed.kind) {
    case "relative":
      return parsed.spanMs;
    case "latest":
      return HOUR_MS;
    case "absolute":
      return Math.max(nowMs - parsed.startMs, HOUR_MS);
    case "calendar":
      return (parsed.unit === "day" ? DAY_MS : WEEK_MS) * (Math.abs(parsed.offsetUnits) + 1);
    default: {
      const unreachable: never = parsed;
      throw new TimeRangeError(`Unhandled range ${JSON.stringify(unreachable)}`);
    }
  }
};

/**
 * The API's period route takes a whole number of fixed units, so an arbitrary lookback has to be
 * rounded up onto that ladder. Rounding **up** is the only safe direction: a window one rung too
 * small returns fewer readings than the question asked for and the shortfall is invisible in the
 * result.
 */
const LADDER: ReadonlyArray<{ duration: number; unit: PeriodUnit; spanMs: number }> = [
  { duration: 1, unit: "hour", spanMs: HOUR_MS },
  { duration: 1, unit: "day", spanMs: DAY_MS },
  { duration: 1, unit: "week", spanMs: WEEK_MS },
  { duration: 1, unit: "month", spanMs: MONTH_MS },
  { duration: 1, unit: "year", spanMs: YEAR_MS },
];

export interface FetchWindow {
  duration: number;
  unit: PeriodUnit;
  spanMs: number;
}

/** Smallest ladder rung covering `lookbackMs`; the widest rung when nothing covers it. */
export const fetchWindowFor = (lookbackMs: number): FetchWindow => (
  LADDER.find((rung) => rung.spanMs >= lookbackMs) ?? LADDER[LADDER.length - 1]
);

/**
 * The next rung up, or `undefined` at the top.
 *
 * Used to widen a window that came back empty: a pod silent for six days returns nothing for
 * "1 day", and the honest recovery is to look further back for the reading that anchors the
 * range — not to report zeros. Escalation is bounded by the caller.
 */
export const widerWindow = (window: FetchWindow): FetchWindow | undefined => {
  const index = LADDER.findIndex((rung) => rung.unit === window.unit);
  return index >= 0 && index + 1 < LADDER.length ? LADDER[index + 1] : undefined;
};
