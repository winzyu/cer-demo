/**
 * A month of Algalita Pod readings shaped on the customer's 30-day question (chat
 * `CxB30b9W3FMpRzHDuaDt`, docs/timeline.md 2026-10-12) and on the pod's real Sep 12 to Oct 13,
 * served like the device API so the sensor tool and the report run on it unchanged
 * (`../skepticism/fleet.ts`'s `routeDeviceApi`).
 *
 * The three recorded stretches (`recorded.ts`: Sep 25-26, Sep 29-30, Oct 7) are the real readings.
 * Everything else is **synthetic**: drawn to the shape of a read-only pull of the real month
 * (2026-10-13, docs/plans/FLAGGING_REWORK_HANDOFF_2026-10-13.md "Real-month check"), with its
 * own values and times, so no other customer reading is committed. The shapes it keeps:
 * - Sep 12-24 sparse (a reading every 2 hours, with 8-hour overnight gaps every other night);
 * - a low pH stretch on Sep 13 whose first reading falls the night before a "last 30 days" window;
 * - Sep 24's afternoon out of the water: pH 0 (a probe rail), then conductivity falling to about
 *   1,400 µS/cm over four readings;
 * - pH 3-5.8 from the evening of Sep 26 until Sep 29 17:28 PDT, dipping below 3 for three readings
 *   on Sep 27;
 * - afternoon dips to about 6.0 against a minimum of 6 on Oct 3-9, shallower on Oct 8;
 * - whole-board read failures (every channel at the read-failure value with its error flag) on
 *   Oct 3-8 afternoons, three in a row on Oct 8.
 * Readings every 30 minutes from Sep 25, ending Oct 13 18:30 UTC.
 */
import { SENSOR_READ_FAILURE_VALUE } from "../../../src/devices/readingQc";
import type { Fleet, RawReading } from "../skepticism/fleet";
import { OCT_7, SEP_25_26, SEP_29_30 } from "./recorded";
import type { RecordedRow } from "./recorded";

export const ALGALITA = "dev:351077454569099";
export const NOW = Date.parse("2026-10-13T18:30:00.000Z");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = Date.parse("2026-09-12T06:00:00.000Z");
/** Sparse readings until here, then every 30 minutes. */
const DENSE_FROM = Date.parse("2026-09-25T00:30:00.000Z");
/** Sep 26 18:56 PDT, the last recorded reading of the drop (5.07). */
const LOW_FROM = Date.parse("2026-09-27T01:56:00.000Z");
/** Sep 29 17:28 PDT, the first recorded reading of the normal night. */
const LOW_UNTIL = Date.parse("2026-09-30T00:28:00.000Z");
/** The afternoon dips, Oct 3-9 PDT. */
const DIPS_FROM = Date.parse("2026-10-03T07:00:00.000Z");
const DIPS_UNTIL = Date.parse("2026-10-10T07:00:00.000Z");
const SHALLOW_DIP_DAY = "2026-10-08";

/** Sep 13's low stretch: one reading the night before the 30-day window, two inside it. */
const SEP_13_LOW: ReadonlyMap<number, number> = new Map([
  // Alone in the night's gap, as on the real pod, so it has no neighbours to be a spike against.
  [Date.parse("2026-09-13T06:00:00.000Z"), 5.5],
  [Date.parse("2026-09-13T18:00:00.000Z"), 6.05],
  [Date.parse("2026-09-13T20:00:00.000Z"), 5.2],
  [Date.parse("2026-09-13T22:00:00.000Z"), 5.7],
  [Date.parse("2026-09-14T00:00:00.000Z"), 6.0],
]);
/** Sep 24 PDT afternoon: pH at its 0 rail, then conductivity falling as the pod leaves the water. */
const SEP_24_PH_RAIL = Date.parse("2026-09-24T22:00:00.000Z");
const SEP_24_CONDUCTIVITY: ReadonlyMap<number, number> = new Map([
  [Date.parse("2026-09-24T22:30:00.000Z"), 7_400],
  [Date.parse("2026-09-24T22:50:00.000Z"), 5_100],
  [Date.parse("2026-09-24T23:10:00.000Z"), 2_900],
  [Date.parse("2026-09-24T23:30:00.000Z"), 1_400],
]);
/** Sep 27 PDT late morning: three readings below pH 3 inside the low days. */
const SEP_27_BELOW_3: ReadonlyMap<number, number> = new Map([
  [Date.parse("2026-09-27T17:30:00.000Z"), 2.3],
  [Date.parse("2026-09-27T18:00:00.000Z"), 2.5],
  [Date.parse("2026-09-27T18:30:00.000Z"), 2.35],
]);
/** Whole-board read failures: Oct 3-7 afternoons, then three in a row on Oct 8 (15:00-16:00 PDT). */
const BOARD_FAILURES: ReadonlySet<number> = new Set([
  "2026-10-03T19:00", "2026-10-03T20:30", "2026-10-04T19:30", "2026-10-04T22:00",
  "2026-10-05T20:00", "2026-10-05T21:30", "2026-10-06T21:00", "2026-10-06T23:00",
  "2026-10-07T23:30", "2026-10-08T22:00", "2026-10-08T22:30", "2026-10-08T23:00",
].map((at) => Date.parse(`${at}:00.000Z`)));

/** Hours since local (PDT) midnight. */
const localHour = (ms: number): number => (((ms / HOUR - 7) % 24) + 24) % 24;
const localDay = (ms: number): string => new Date(ms - 7 * HOUR).toISOString().slice(0, 10);
/** Smooth, deterministic wobble in -1..1, so no two neighbouring readings jump. */
const wobble = (ms: number, period: number): number => Math.sin((2 * Math.PI * ms) / period);

interface Water { ph: number; orp: number; conductivity: number; oxygen: number; celsius: number }

const ordinary = (ms: number): Water => {
  const h = localHour(ms);
  const sun = Math.max(0, Math.sin((Math.PI * (h - 7)) / 12)); // 0 at night, 1 mid-afternoon
  const depth = localDay(ms) === SHALLOW_DIP_DAY ? 1 : 1.45;
  const dip = ms >= DIPS_FROM && ms < DIPS_UNTIL ? depth * Math.exp(-(((h - 15.75) / 4) ** 2)) : 0;
  return {
    ph: +(7.45 - dip + 0.05 * wobble(ms, 5 * HOUR)).toFixed(3),
    orp: +(228 + 6 * wobble(ms, 9 * HOUR)).toFixed(1),
    conductivity: Math.round(61_000 - 2_500 * sun + 400 * wobble(ms, 7 * HOUR)),
    oxygen: +(8.6 + 1.2 * sun + 0.1 * wobble(ms, 3 * HOUR)).toFixed(3),
    // Not a 4-hour period: the sparse days' 2-hour readings would all sit on its zeros, a flat line.
    celsius: +(22 + 4 * sun + 0.1 * wobble(ms, 4.5 * HOUR)).toFixed(3),
  };
};

/** pH from 5.07 down to 3.4 and back up to 5.8, smoothly, across the synthetic low days. */
const lowPh = (ms: number): number => {
  const x = (ms - LOW_FROM) / (LOW_UNTIL - LOW_FROM);
  const base = x < 0.4
    ? 3.4 + ((5.07 - 3.4) * (1 + Math.cos((Math.PI * x) / 0.4))) / 2
    : 3.4 + ((5.8 - 3.4) * (x - 0.4)) / 0.6;
  return +(base + 0.03 * wobble(ms, 5 * HOUR)).toFixed(3);
};

const reading = (ms: number, water: Water, failed = false): RawReading => {
  const value = (v: number): number => (failed ? SENSOR_READ_FAILURE_VALUE : v);
  const error = failed ? 1 : 0;
  return {
    device: ALGALITA,
    timestamp: Math.floor(ms / 1000),
    date: new Date(ms).toISOString(),
    best_lat: 33.7536,
    best_lon: -118.1146,
    best_location: "Los Alamitos Bay CA",
    event: `${ALGALITA}-${ms}`,
    water_data: {
      72: value(0), // turbidity stuck at 0 all month, as on the real pod (F13)
      97: value(water.oxygen),
      98: value(water.orp),
      99: value(water.ph),
      100: value(water.conductivity),
      102: value(water.celsius),
      doError: error,
      ecError: error,
      orpError: error,
      phError: error,
      rtdError: error,
      turbError: error,
      turbVolt: value(0),
    },
  };
};

const fromRecorded = ([at, ph, orp, conductivity, oxygen, celsius]: RecordedRow): RawReading => (
  reading(Date.parse(at), { ph, orp, conductivity, oxygen, celsius })
);

/** Reading times: every 2 hours, skipping 01:00-08:00 UTC every other night, then every 30 minutes. */
const times = (): number[] => {
  const out: number[] = [];
  for (let ms = START; ms < DENSE_FROM; ms += 2 * HOUR) {
    const night = new Date(ms).getUTCHours() >= 1 && new Date(ms).getUTCHours() < 8;
    if (!(night && new Date(ms).getUTCDate() % 2 === 1) || SEP_13_LOW.has(ms)) out.push(ms);
  }
  out.push(SEP_24_PH_RAIL, ...SEP_24_CONDUCTIVITY.keys());
  for (let ms = DENSE_FROM; ms <= NOW; ms += 30 * MINUTE) out.push(ms);
  return [...new Set(out)].sort((a, b) => a - b);
};

/** The month, with the pod's registry record (thresholds as on the real pod, 2026-10-13). */
export const algalitaMonth = (): Fleet => {
  const recorded = [...SEP_25_26, ...SEP_29_30, ...OCT_7].map(fromRecorded);
  const spans = [SEP_25_26, SEP_29_30, OCT_7].map((rows) => [
    Date.parse(rows[0][0]) - 15 * MINUTE, Date.parse(rows[rows.length - 1][0]) + 15 * MINUTE,
  ]);
  const synthetic: RawReading[] = [];
  for (const ms of times()) {
    if (spans.some(([from, to]) => ms >= from && ms <= to)) continue;
    const water = ordinary(ms);
    if (ms > LOW_FROM && ms < LOW_UNTIL) water.ph = SEP_27_BELOW_3.get(ms) ?? lowPh(ms);
    water.ph = SEP_13_LOW.get(ms) ?? water.ph;
    if (ms === SEP_24_PH_RAIL) water.ph = 0;
    water.conductivity = SEP_24_CONDUCTIVITY.get(ms) ?? water.conductivity;
    // After the recorded Oct 7 rows end at 8.41, ease back to the ordinary night over two hours,
    // so the synthetic resume is not a jump of its own.
    const sinceOct7 = ms - Date.parse(OCT_7[OCT_7.length - 1][0]);
    if (sinceOct7 > 0 && sinceOct7 <= 2 * HOUR) {
      water.ph = +(8.41 + ((water.ph - 8.41) * sinceOct7) / (2 * HOUR)).toFixed(3);
    }
    synthetic.push(reading(ms, water, BOARD_FAILURES.has(ms)));
  }
  return {
    now: NOW,
    devices: [{
      id: "doc-algalita",
      data: {
        label: ALGALITA,
        name: "Algalita Pod",
        organization: "org-algalita-0001",
        operatingEnvironment: "salt-water",
        nextCalibrationDate: "2026-09-30T19:39:20.000Z",
        notificationFrequency: "1x/week",
        displayed: true,
        thresholds: {
          minPH: "6", maxPH: "10", minORP: "50", maxORP: "400", minDissolvedOxygen: "4",
          maxDissolvedOxygen: "15", minConductivity: "40000", maxConductivity: "75000",
          minTemperature: "30", maxTemperature: "90",
        },
      },
    }],
    readings: { [ALGALITA]: [...synthetic, ...recorded].sort((a, b) => a.timestamp - b.timestamp) },
  };
};
