/**
 * How old a reading is, stated in the tool result rather than left for the model to work out.
 *
 * Every device tool returns absolute timestamps, and before this the model had nothing to measure
 * them against: no current date in the prompt and no age in the result. In the 2026-09-24
 * conversation check it called two pods that last reported 10 and 12 days earlier "likely
 * online", and presented a 10-day-old temperature as current
 * (`docs/migration/CONVERSATION_QA_2026-09-24.md` findings 1 and 2). The prompt now carries the
 * current time too (`formatCurrentTime`), but an age computed here is exact, while date arithmetic
 * by the model is not.
 *
 * **Stale means more than six hours without a reading.** The pods report about once an hour
 * (`SPECS.md`, hourly buckets), so six missed reports is well past jitter and well short of the
 * multi-day silences that caused the finding. It is a statement about the last report, not a
 * diagnosis: `list_pods`' `last_reported` omits readings with no GPS fix, so there a stale age
 * means "not confirmed recently", as its own note says.
 */

export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const plural = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? "" : "s"}`;

/**
 * Minutes under an hour, hours under two days, whole days beyond. Rounded up, so a reading is
 * never described as fresher than it is: 9 days 20 hours reads as "10 days", not "9 days". The
 * unit is chosen after rounding, so 59.5 minutes reads as "1 hour", never "60 minutes". A
 * timestamp slightly ahead of the clock (device or server clock skew) reads as "0 minutes" rather
 * than as a negative age.
 */
export const describeAge = (ageMs: number): string => {
  const age = Math.max(0, ageMs);
  const minutes = Math.ceil(age / MINUTE_MS);
  if (minutes < 60) {
    return plural(minutes, "minute");
  }
  const hours = Math.ceil(age / HOUR_MS);
  if (hours < 48) {
    return plural(hours, "hour");
  }
  return plural(Math.ceil(age / DAY_MS), "day");
};

export interface ReadingAge {
  /** e.g. "10 days"; always relative to the tool's clock at the time of the call. */
  age: string;
  stale: boolean;
}

/** `null` for a missing or unparseable timestamp: no age is better than a wrong one. */
export const readingAge = (iso: string | null | undefined, nowMs: number): ReadingAge | null => {
  if (typeof iso !== "string") {
    return null;
  }
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) {
    return null;
  }
  return { age: describeAge(nowMs - at), stale: nowMs - at > STALE_AFTER_MS };
};
