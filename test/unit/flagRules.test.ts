import {
  assessRuns, excursionRuns, judgeMetric, PERSISTENT_SHARE, RUN_LENGTH,
} from "../../src/report/flagRules";
import type { TimedValue } from "../../src/report/flagRules";
import { minimumDetectableChange } from "../../src/report/referenceRanges";

/**
 * The flag rule: 3 consecutive readings beyond the limit plus v2's minimum detectable change
 * (docs/timeline.md, 2026-10-10). Readings are 30 minutes apart, the pods' cadence.
 */
const STEP = 30 * 60_000;
const series = (values: number[], step = STEP): TimedValue[] => values.map((v, i) => [i * step, v]);
const ph = (reading: number): number => minimumDetectableChange("ph", reading); // 0.2
const LIMIT = { min: 7.8, max: 8.3 };

describe("excursionRuns", () => {
  it("never flags a single reading, however far out (Michael's over-flagging)", () => {
    expect(RUN_LENGTH).toBe(3);
    expect(excursionRuns(series([8.1, 8.1, 11, 8.1, 8.1]), LIMIT, ph)).toEqual([]);
    expect(excursionRuns(series([8.1, 9, 9, 8.1]), LIMIT, ph)).toEqual([]);
  });

  it("flags three readings in a row beyond the limit plus the minimum detectable change", () => {
    expect(excursionRuns(series([8.1, 8.6, 8.7, 8.6, 8.1]), LIMIT, ph)).toEqual([{
      direction: "high", startMs: STEP, endMs: 3 * STEP, readings: 3, extreme: 8.7,
    }]);
  });

  it("ignores readings past the limit by less than the minimum detectable change", () => {
    // 8.45 is above 8.3 by 0.15, under pH's 0.2.
    expect(excursionRuns(series([8.45, 8.45, 8.45, 8.45]), LIMIT, ph)).toEqual([]);
  });

  it("counts high and low separately, so a jumpy sensor does not make a run", () => {
    expect(excursionRuns(series([8.6, 7.2, 8.6, 7.2]), LIMIT, ph)).toEqual([]);
    expect(excursionRuns(series([7.2, 7.3, 7.2]), LIMIT, ph))
      .toEqual([expect.objectContaining({ direction: "low", extreme: 7.2 })]);
  });

  it("is broken by a silence longer than 3 hours", () => {
    expect(excursionRuns(series([8.6, 8.6, 8.6], 3 * 60 * 60_000 + 1), LIMIT, ph)).toEqual([]);
  });
});

describe("assessRuns", () => {
  it("separates the Watch rung from the Action Required rung (15% of the width)", () => {
    const conductivity = (r: number): number => minimumDetectableChange("conductivity", r);
    const limit = { min: 40_000, max: 50_000 }; // margin 1,500 against 2% of ~52,000 = 1,040
    const values = series([51_200, 51_300, 51_200, 52_000, 52_000, 52_000]);
    const runs = assessRuns(values, limit, conductivity);
    expect(runs.outOfRange).toHaveLength(1);
    expect(runs.exceedance).toHaveLength(1);
    expect(runs.exceedance[0].startMs).toBe(3 * STEP);
  });

  it("calls runs over at least 80% of the readings persistent", () => {
    expect(PERSISTENT_SHARE).toBe(0.8);
    expect(assessRuns(series([8.1, 8.6, 8.6, 8.6, 8.6]), LIMIT, ph).persistent).toBe(true);
    expect(assessRuns(series([8.1, 8.1, 8.6, 8.6, 8.6]), LIMIT, ph).persistent).toBe(false);
  });
});

describe("judgeMetric", () => {
  const base = { minimumDetectableChange: ph, dataIssue: false };

  it("is in range, or out of range with whether the newest reading is in the run", () => {
    expect(judgeMetric({ ...base, values: series([8.1, 8.2, 8.1]), limit: LIMIT }).status)
      .toBe("in range");
    const ongoing = judgeMetric({ ...base, values: series([8.1, 8.6, 8.7, 8.6]), limit: LIMIT });
    expect(ongoing).toMatchObject({ status: "out of range", ongoing: true });
    const over = judgeMetric({ ...base, values: series([8.6, 8.7, 8.6, 8.1]), limit: LIMIT });
    expect(over).toMatchObject({ status: "out of range", ongoing: false });
  });

  it("puts a likely data issue first, keeping the runs for context", () => {
    const verdict = judgeMetric({
      ...base, dataIssue: true, values: series([8.6, 8.7, 8.6]), limit: LIMIT,
    });
    expect(verdict.status).toBe("likely data issue");
    expect(verdict.runs?.outOfRange).toHaveLength(1);
  });

  it("is not assessed without a limit, and needs at least 3 readings", () => {
    expect(judgeMetric({ ...base, values: series([8.6, 8.7, 8.6]) }).status).toBe("not assessed");
    expect(judgeMetric({ ...base, values: series([8.6, 8.7]), limit: LIMIT }).status)
      .toBe("not enough data");
  });

  it("judges a right-now question on the run ending at the newest reading", () => {
    // pH 8.6, 8.7, 8.6 at 1:00, 1:30 and 2:00; the question resolves to the 2:00 reading alone.
    const newest: TimedValue[] = [[2 * STEP, 8.6]];
    const lookback = series([8.1, 8.6, 8.7]).slice(1);
    expect(judgeMetric({
      ...base, values: newest, lookback, limit: LIMIT,
    }))
      .toMatchObject({ status: "out of range", ongoing: true });
    const lone = judgeMetric({
      ...base, values: newest, lookback: series([8.1, 8.2]), limit: LIMIT,
    });
    expect(lone.status).toBe("in range");
  });
});
