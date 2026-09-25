import { describeAge, readingAge, STALE_AFTER_MS } from "../../src/tools/readingAge";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("describeAge", () => {
  it("uses minutes under an hour, hours under two days, and days beyond", () => {
    expect(describeAge(0)).toBe("0 minutes");
    expect(describeAge(1 * MINUTE)).toBe("1 minute");
    expect(describeAge(59 * MINUTE)).toBe("59 minutes");
    expect(describeAge(1 * HOUR)).toBe("1 hour");
    expect(describeAge(47 * HOUR)).toBe("47 hours");
    expect(describeAge(2 * DAY)).toBe("2 days");
    expect(describeAge(10 * DAY + 23 * HOUR)).toBe("11 days");
  });

  it("rounds up, so a reading is never described as fresher than it is", () => {
    expect(describeAge(59 * MINUTE + 1)).toBe("1 hour");
    expect(describeAge(2 * DAY + 1)).toBe("3 days");
    expect(describeAge(3 * DAY - 1)).toBe("3 days");
    expect(describeAge(HOUR + 1)).toBe("2 hours");
  });

  it("reads a timestamp slightly ahead of the clock as 0 minutes, not a negative age", () => {
    expect(describeAge(-5 * MINUTE)).toBe("0 minutes");
  });
});

describe("readingAge", () => {
  const now = Date.parse("2026-09-24T12:00:00.000Z");

  it("flags a reading as stale only after six hours", () => {
    expect(STALE_AFTER_MS).toBe(6 * HOUR);
    expect(readingAge(new Date(now - 6 * HOUR).toISOString(), now)).toEqual({ age: "6 hours", stale: false });
    expect(readingAge(new Date(now - 6 * HOUR - MINUTE).toISOString(), now)).toEqual({ age: "7 hours", stale: true });
  });

  it("gives the QA check's ten-day-silent pod its age", () => {
    expect(readingAge("2026-09-14T15:19:13.000Z", now)).toEqual({ age: "10 days", stale: true });
  });

  it("returns null for a missing or unparseable timestamp rather than guessing", () => {
    expect(readingAge(null, now)).toBeNull();
    expect(readingAge(undefined, now)).toBeNull();
    expect(readingAge("not a date", now)).toBeNull();
  });
});
