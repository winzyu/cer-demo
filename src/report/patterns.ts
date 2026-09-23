import type { Pattern } from "./types";

/**
 * Classifies one parameter's hourly series as `diel`, `tidal`, `trend` or `unknown`.
 *
 * Event detection needs this before it can tell biology from pollution: the archived signature
 * matrix is explicit that "a smooth, repeating daily oscillation is biology, not pollution", so a
 * diel- or tidal-tagged parameter is skipped by the threshold-window detector, and the algal-bloom
 * detector only looks inside a diel-tagged dissolved-oxygen series (`events.ts`). Until this
 * existed every live parameter was `unknown`, which switched both of those off.
 *
 * ## Method
 *
 * Periodicity is read from autocorrelation at the lags that separate the two rhythms, on a
 * series with its slow level removed:
 *
 * 1. Place the hourly bucket means on an hourly grid; gaps stay gaps, never zero.
 * 2. Subtract a centered 25-hour moving mean. A 25-hour window spans one diel cycle and almost
 *    exactly two semidiurnal tides (2 x 12.42 h), so it removes the level and any slow drift
 *    while leaving both oscillations intact.
 * 3. Correlate that residual with itself shifted by 6, 12 and 24 hours.
 *    - A **diel** cycle (24 h) repeats at 24 h and is inverted at 12 h.
 *    - A **semidiurnal tide** (12.42 h) repeats at 12 h and is inverted at 6 h. It also repeats
 *      at 24 h, which is why the 12-hour lag, not the 24-hour one, is what tells them apart.
 *
 * A **trend** is a sustained drift over weeks: daily means that sit on a straight line (R² at
 * least `TREND_MIN_R2`) across at least `TREND_MIN_DAYS` days. Periodicity wins when both are
 * present, because the periodic tag is the one event detection acts on.
 *
 * ## Limits
 *
 * - A mixed tide with a strong diurnal inequality, or a diurnal tide, repeats near 24 h and is
 *   indistinguishable from a diel rhythm on these lags. This classifier calls it diel.
 * - `unknown` means "not enough data, or no rhythm cleared the bar", never "steady": a quiet,
 *   flat signal and a short window are both `unknown`, and the narrative treats `unknown` as
 *   unclassified.
 * - The thresholds are set from the rhythms' geometry (a clean cycle correlates near +1 at its
 *   period and near -1 at half of it), not fitted to pod data; no labelled series exists to fit.
 */

const HOUR_MS = 3_600_000;

/** Three full diel cycles: fewer and a 24-hour autocorrelation rests on too few pairs. */
const MIN_SPAN_HOURS = 72;
/** Share of the grid's hours that must hold a reading. */
const MIN_COVERAGE = 0.6;
/** Centered moving-mean window, in hours. See step 2 above. */
const LEVEL_WINDOW_HOURS = 25;
/** A level estimate needs most of its window, or a gap edge would leak into the residual. */
const MIN_LEVEL_POINTS = 18;
/** Pairs an autocorrelation needs before it is read at all. */
const MIN_PAIRS = 48;
/** How strongly a series must repeat at its period. */
const PERIODIC_MIN_R = 0.5;
/** How strongly it must invert at half its period. */
const HALF_PERIOD_MAX_R = -0.2;

const TREND_MIN_DAYS = 14;
/** Hours a day needs before its mean joins the trend fit. */
const TREND_MIN_HOURS_PER_DAY = 12;
const TREND_MIN_R2 = 0.7;

/** `[epoch ms, value]`, one point per hourly bucket, in any order. */
export type HourlySeries = Array<[number, number]>;

const onGrid = (series: HourlySeries): { grid: Array<number | undefined>; startHour: number } => {
  const hours = series.map(([t, v]): [number, number] => [Math.floor(t / HOUR_MS), v]);
  const startHour = Math.min(...hours.map(([h]) => h));
  const endHour = Math.max(...hours.map(([h]) => h));
  const grid: Array<number | undefined> = new Array(endHour - startHour + 1).fill(undefined);
  hours.forEach(([h, v]) => { grid[h - startHour] = v; });
  return { grid, startHour };
};

const residualOf = (grid: Array<number | undefined>): Array<number | undefined> => {
  const half = Math.floor(LEVEL_WINDOW_HOURS / 2);
  return grid.map((value, i) => {
    if (value === undefined) return undefined;
    const window = grid
      .slice(Math.max(0, i - half), i + half + 1)
      .filter((v): v is number => v !== undefined);
    // The window must be full width as well as well filled: a truncated window at either end of
    // the series is lopsided and would read part of the cycle as level.
    if (i - half < 0 || i + half >= grid.length || window.length < MIN_LEVEL_POINTS) {
      return undefined;
    }
    return value - window.reduce((sum, v) => sum + v, 0) / window.length;
  });
};

/** Correlation of the residual with itself `lag` hours later; null if too few pairs. */
const autocorrelation = (residual: Array<number | undefined>, lag: number): number | null => {
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let pairs = 0;
  for (let i = 0; i + lag < residual.length; i += 1) {
    const x = residual[i];
    const y = residual[i + lag];
    if (x !== undefined && y !== undefined) {
      sumXY += x * y;
      sumXX += x * x;
      sumYY += y * y;
      pairs += 1;
    }
  }
  if (pairs < MIN_PAIRS || sumXX === 0 || sumYY === 0) return null;
  return sumXY / Math.sqrt(sumXX * sumYY);
};

const periodicPattern = (grid: Array<number | undefined>): Pattern | null => {
  const residual = residualOf(grid);
  const r6 = autocorrelation(residual, 6);
  const r12 = autocorrelation(residual, 12);
  const r24 = autocorrelation(residual, 24);
  if (r6 === null || r12 === null || r24 === null) return null;
  if (r12 >= PERIODIC_MIN_R && r6 <= HALF_PERIOD_MAX_R) return "tidal";
  if (r24 >= PERIODIC_MIN_R && r12 <= HALF_PERIOD_MAX_R) return "diel";
  return null;
};

const isTrend = (grid: Array<number | undefined>, startHour: number): boolean => {
  const byDay = new Map<number, number[]>();
  grid.forEach((v, i) => {
    if (v === undefined) return;
    const day = Math.floor((startHour + i) / 24);
    byDay.set(day, [...(byDay.get(day) ?? []), v]);
  });
  const points = [...byDay.entries()]
    .filter(([, values]) => values.length >= TREND_MIN_HOURS_PER_DAY)
    .map(([day, values]): [number, number] => [
      day, values.reduce((s, v) => s + v, 0) / values.length,
    ]);
  if (points.length < TREND_MIN_DAYS) return false;

  const n = points.length;
  const meanX = points.reduce((s, [x]) => s + x, 0) / n;
  const meanY = points.reduce((s, [, y]) => s + y, 0) / n;
  const sxy = points.reduce((s, [x, y]) => s + (x - meanX) * (y - meanY), 0);
  const sxx = points.reduce((s, [x]) => s + (x - meanX) ** 2, 0);
  const syy = points.reduce((s, [, y]) => s + (y - meanY) ** 2, 0);
  if (sxx === 0 || syy === 0) return false;
  return (sxy * sxy) / (sxx * syy) >= TREND_MIN_R2;
};

export const classifyPattern = (series: HourlySeries): Pattern => {
  if (series.length === 0) return "unknown";
  const { grid, startHour } = onGrid(series);
  const filled = grid.filter((v) => v !== undefined).length;
  if (grid.length < MIN_SPAN_HOURS || filled / grid.length < MIN_COVERAGE) return "unknown";

  return periodicPattern(grid) ?? (isTrend(grid, startHour) ? "trend" : "unknown");
};
