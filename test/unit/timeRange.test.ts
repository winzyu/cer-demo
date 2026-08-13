import {
  TimeRangeError,
  fetchWindowFor,
  lookbackMsFor,
  parseTimeRange,
  resolveRange,
  widerWindow,
} from "../../src/tools/timeRange";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Algalita Pod's newest recorded reading (`data/device-api/…/last.json`, epoch 1786477045).
 * A Tuesday, 19:37 UTC — deliberately mid-week and mid-day so a calendar bug cannot pass by
 * landing on a boundary.
 */
const ALGALITA_LATEST = Date.parse("2026-08-11T19:37:25.000Z");

/** Old Woman Creek 2026's newest reading. The pod has been silent since. */
const OWC_LATEST = Date.parse("2026-08-07T14:38:49.000Z");

describe("parseTimeRange", () => {
  it("reads the legacy relative forms", () => {
    // MIGRATION_SPEC.md §4.3 lists these by name; parity matters because the eval fixtures
    // and the tool description both promise them.
    expect(parseTimeRange("last day")).toEqual({ kind: "relative", spanMs: DAY, label: "last 1 day" });
    expect(parseTimeRange("last 3 days")).toEqual({ kind: "relative", spanMs: 3 * DAY, label: "last 3 days" });
    expect(parseTimeRange("last 2 weeks")).toEqual({ kind: "relative", spanMs: 2 * WEEK, label: "last 2 weeks" });
    expect(parseTimeRange("last 24 hours")).toEqual({ kind: "relative", spanMs: 24 * HOUR, label: "last 24 hours" });
  });

  it("treats 'last week' as a rolling seven days, not the previous calendar week", () => {
    expect(parseTimeRange("last week")).toEqual({ kind: "relative", spanMs: WEEK, label: "last week" });
  });

  it("reads the calendar forms without anchoring them", () => {
    expect(parseTimeRange("today")).toMatchObject({ kind: "calendar", unit: "day", offsetUnits: 0 });
    expect(parseTimeRange("yesterday")).toMatchObject({ kind: "calendar", unit: "day", offsetUnits: -1 });
    expect(parseTimeRange("this week")).toMatchObject({ kind: "calendar", unit: "week", offsetUnits: 0 });
  });

  it("reads a single ISO date as that whole day", () => {
    const parsed = parseTimeRange("2026-08-07");

    expect(parsed).toEqual({
      kind: "absolute",
      startMs: Date.parse("2026-08-07T00:00:00.000Z"),
      endMs: Date.parse("2026-08-08T00:00:00.000Z"),
      label: "2026-08-07",
    });
  });

  it("includes the end date's whole day in a span", () => {
    // "to 2026-08-07" means through the end of the 7th. Excluding it would silently drop a
    // day of readings from every date-range answer.
    const parsed = parseTimeRange("2026-08-05 to 2026-08-07");

    expect(parsed).toEqual({
      kind: "absolute",
      startMs: Date.parse("2026-08-05T00:00:00.000Z"),
      endMs: Date.parse("2026-08-08T00:00:00.000Z"),
      label: "2026-08-05 to 2026-08-07",
    });
  });

  it("normalizes case and whitespace", () => {
    expect(parseTimeRange("  LAST   3   DAYS ")).toMatchObject({ spanMs: 3 * DAY });
  });

  it("maps 'now' and its synonyms to the latest reading, not to the clock", () => {
    // MIGRATION_SPEC.md §4.3: "Now" resolves to the latest reading in the DB, not wall-clock.
    ["now", "latest", "current", "most recent"].forEach((phrase) => {
      expect(parseTimeRange(phrase)).toMatchObject({ kind: "latest" });
    });
  });

  describe("rejects rather than guesses", () => {
    it("rejects an unparseable phrase with the accepted forms", () => {
      expect(() => parseTimeRange("since the storm")).toThrow(TimeRangeError);
      expect(() => parseTimeRange("since the storm")).toThrow(/Accepted forms/);
    });

    it("rejects an empty phrase", () => {
      expect(() => parseTimeRange("   ")).toThrow(TimeRangeError);
    });

    it("rejects a date that is not a real calendar date", () => {
      // Date.UTC rolls 2026-02-30 forward to March 2nd and returns a perfectly valid instant,
      // which would answer a question about a day the caller never asked for.
      expect(() => parseTimeRange("2026-02-30")).toThrow(TimeRangeError);
      expect(() => parseTimeRange("2026-13-01")).toThrow(TimeRangeError);
    });

    it("rejects a backwards span", () => {
      expect(() => parseTimeRange("2026-08-07 to 2026-08-05")).toThrow(/ends before it starts/);
    });

    it("rejects a zero or negative count", () => {
      expect(() => parseTimeRange("last 0 days")).toThrow(TimeRangeError);
    });

    it("rejects a loose date the ISO form would otherwise coerce", () => {
      expect(() => parseTimeRange("2026-8-5")).toThrow(TimeRangeError);
    });
  });
});

describe("resolveRange", () => {
  it("anchors a relative range to the reference reading, not to now", () => {
    // The whole point of the module. If this used the clock, the stale pod would answer
    // "no data" to every relative question it can actually answer.
    const resolved = resolveRange(parseTimeRange("last day"), OWC_LATEST);

    expect(resolved.end).toBe("2026-08-07T14:38:49.000Z");
    expect(resolved.start).toBe("2026-08-06T14:38:49.000Z");
  });

  it("resolves 'today' to the UTC day containing the reference reading", () => {
    const resolved = resolveRange(parseTimeRange("today"), ALGALITA_LATEST);

    expect(resolved.start).toBe("2026-08-11T00:00:00.000Z");
    expect(resolved.end).toBe("2026-08-12T00:00:00.000Z");
  });

  it("resolves 'yesterday' to the day before that", () => {
    const resolved = resolveRange(parseTimeRange("yesterday"), ALGALITA_LATEST);

    expect(resolved.start).toBe("2026-08-10T00:00:00.000Z");
    expect(resolved.end).toBe("2026-08-11T00:00:00.000Z");
  });

  it("starts 'this week' on the Monday on or before the reference", () => {
    // 2026-08-11 is a Tuesday, so the week starts on the 10th.
    const resolved = resolveRange(parseTimeRange("this week"), ALGALITA_LATEST);

    expect(new Date(resolved.startMs).getUTCDay()).toBe(1);
    expect(resolved.start).toBe("2026-08-10T00:00:00.000Z");
    expect(resolved.end).toBe("2026-08-17T00:00:00.000Z");
  });

  it("leaves an absolute range untouched by the reference", () => {
    const parsed = parseTimeRange("2026-08-05 to 2026-08-07");

    expect(resolveRange(parsed, ALGALITA_LATEST)).toMatchObject(resolveRange(parsed, OWC_LATEST));
  });

  it("collapses 'now' to a zero-width window at the reference", () => {
    const resolved = resolveRange(parseTimeRange("now"), OWC_LATEST);

    expect(resolved.startMs).toBe(OWC_LATEST);
    expect(resolved.endMs).toBe(OWC_LATEST);
  });

  it("echoes the parsed label so a misreading is visible", () => {
    expect(resolveRange(parseTimeRange("last 3 days"), ALGALITA_LATEST).label).toBe("last 3 days");
  });

  describe("whether the endpoint belongs to the range", () => {
    it("includes the endpoint for a range anchored to the reference reading", () => {
      // Regression. A relative window ends *at* the newest reading, so an exclusive end drops
      // that reading from its own window — silently removing the single most relevant
      // measurement from every "what is it now" and "last 24 hours" answer.
      expect(resolveRange(parseTimeRange("last day"), ALGALITA_LATEST).endInclusive).toBe(true);
      expect(resolveRange(parseTimeRange("now"), ALGALITA_LATEST).endInclusive).toBe(true);
    });

    it("excludes the endpoint for calendar and absolute ranges", () => {
      // Their ends are midnight boundaries; an inclusive end would let "yesterday" and "today"
      // both claim a reading taken exactly at midnight.
      expect(resolveRange(parseTimeRange("today"), ALGALITA_LATEST).endInclusive).toBe(false);
      expect(resolveRange(parseTimeRange("2026-08-07"), ALGALITA_LATEST).endInclusive).toBe(false);
      expect(resolveRange(parseTimeRange("this week"), ALGALITA_LATEST).endInclusive).toBe(false);
    });
  });
});

describe("fetchWindowFor", () => {
  it("rounds up onto the API's fixed unit ladder", () => {
    // Rounding down would return fewer readings than asked for, with nothing in the result
    // showing the shortfall.
    expect(fetchWindowFor(30 * 60 * 1000)).toMatchObject({ duration: 1, unit: "hour" });
    expect(fetchWindowFor(2 * HOUR)).toMatchObject({ duration: 1, unit: "day" });
    expect(fetchWindowFor(3 * DAY)).toMatchObject({ duration: 1, unit: "week" });
    expect(fetchWindowFor(3 * WEEK)).toMatchObject({ duration: 1, unit: "month" });
  });

  it("never returns a window smaller than the lookback", () => {
    [1, HOUR, DAY - 1, DAY, WEEK + 1, 200 * DAY].forEach((lookback) => {
      expect(fetchWindowFor(lookback).spanMs).toBeGreaterThanOrEqual(lookback);
    });
  });

  it("tops out at a year rather than failing", () => {
    expect(fetchWindowFor(10 * 365 * DAY)).toMatchObject({ unit: "year" });
  });
});

describe("lookbackMsFor", () => {
  const now = Date.parse("2026-08-13T00:00:00.000Z");

  it("uses the phrase's own span for a relative range", () => {
    expect(lookbackMsFor(parseTimeRange("last 3 days"), now)).toBe(3 * DAY);
  });

  it("reaches back to the start of an absolute range", () => {
    // The API window ends at the server's now, so an old date range needs a window measured
    // from now — not the width of the range itself.
    expect(lookbackMsFor(parseTimeRange("2026-08-05"), now)).toBe(
      now - Date.parse("2026-08-05T00:00:00.000Z"),
    );
  });

  it("covers both days for 'yesterday'", () => {
    expect(lookbackMsFor(parseTimeRange("yesterday"), now)).toBe(2 * DAY);
  });

  it("never returns a non-positive lookback for a future-dated range", () => {
    // A model that asks about tomorrow should get an empty answer, not a negative window
    // that rounds to the smallest rung and quietly returns the last hour instead.
    expect(lookbackMsFor(parseTimeRange("2026-09-01"), now)).toBeGreaterThan(0);
  });
});

describe("widerWindow", () => {
  it("steps one rung up the ladder", () => {
    expect(widerWindow({ duration: 1, unit: "day", spanMs: DAY })).toMatchObject({ unit: "week" });
    expect(widerWindow({ duration: 1, unit: "week", spanMs: WEEK })).toMatchObject({ unit: "month" });
  });

  it("stops at the top", () => {
    expect(widerWindow({ duration: 1, unit: "year", spanMs: 365 * DAY })).toBeUndefined();
  });
});
