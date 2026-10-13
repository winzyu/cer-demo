/**
 * A month of Algalita Pod readings shaped on the customer's 30-day question (chat
 * `CxB30b9W3FMpRzHDuaDt`, docs/timeline.md 2026-10-12), served like the device API so the sensor
 * tool and the report run on it unchanged (`../skepticism/fleet.ts`'s `routeDeviceApi`).
 *
 * The three recorded stretches (`recorded.ts`: Sep 25-26, Sep 29-30, Oct 7) are the real readings.
 * Everything between them is **synthetic**, drawn to what the overview records about it, not
 * read: an ordinary seawater day; pH 3-5.8 from the evening of Sep 26 until Sep 29 17:28 PDT
 * (FLAGGING_OVERVIEW §6); and from Oct 2 afternoon pH dipping to about 6.0 against a minimum of 6,
 * Michael's 10-09 pod (§4 F11). Readings every 30 minutes, ending Oct 12 21:00 PDT.
 */
import type { Fleet, RawReading } from "../skepticism/fleet";
import { OCT_7, SEP_25_26, SEP_29_30 } from "./recorded";
import type { RecordedRow } from "./recorded";

export const ALGALITA = "dev:351077454569099";
export const NOW = Date.parse("2026-10-13T04:00:00.000Z");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = Date.parse("2026-09-11T04:00:00.000Z");
/** Sep 26 18:56 PDT, the last recorded reading of the drop (5.07). */
const LOW_FROM = Date.parse("2026-09-27T01:56:00.000Z");
/** Sep 29 17:28 PDT, the first recorded reading of the normal night. */
const LOW_UNTIL = Date.parse("2026-09-30T00:28:00.000Z");
/** Michael's afternoon dips begin on Oct 2, PDT. */
const DIPS_FROM = Date.parse("2026-10-02T07:00:00.000Z");

/** Hours since local (PDT) midnight. */
const localHour = (ms: number): number => (((ms / HOUR - 7) % 24) + 24) % 24;
/** Smooth, deterministic wobble in -1..1, so no two neighbouring readings jump. */
const wobble = (ms: number, period: number): number => Math.sin((2 * Math.PI * ms) / period);

interface Water { ph: number; orp: number; conductivity: number; oxygen: number; celsius: number }

const ordinary = (ms: number): Water => {
  const h = localHour(ms);
  const sun = Math.max(0, Math.sin((Math.PI * (h - 7)) / 12)); // 0 at night, 1 mid-afternoon
  const dip = ms >= DIPS_FROM ? 1.45 * Math.exp(-(((h - 15.75) / 4) ** 2)) : 0;
  return {
    ph: +(7.45 - dip + 0.05 * wobble(ms, 5 * HOUR)).toFixed(3),
    orp: +(228 + 6 * wobble(ms, 9 * HOUR)).toFixed(1),
    conductivity: Math.round(61_000 - 2_500 * sun + 400 * wobble(ms, 7 * HOUR)),
    oxygen: +(8.6 + 1.2 * sun + 0.1 * wobble(ms, 3 * HOUR)).toFixed(3),
    celsius: +(22 + 4 * sun + 0.1 * wobble(ms, 4 * HOUR)).toFixed(3),
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

const reading = (ms: number, water: Water): RawReading => ({
  device: ALGALITA,
  timestamp: Math.floor(ms / 1000),
  date: new Date(ms).toISOString(),
  best_lat: 33.7536,
  best_lon: -118.1146,
  best_location: "Los Alamitos Bay CA",
  event: `${ALGALITA}-${ms}`,
  water_data: {
    72: 0, // turbidity stuck at 0 all month, as on the real pod (F13)
    97: water.oxygen,
    98: water.orp,
    99: water.ph,
    100: water.conductivity,
    102: water.celsius,
    doError: 0, ecError: 0, orpError: 0, phError: 0, rtdError: 0, turbError: 0, turbVolt: 0,
  },
});

const fromRecorded = ([at, ph, orp, conductivity, oxygen, celsius]: RecordedRow): RawReading => (
  reading(Date.parse(at), { ph, orp, conductivity, oxygen, celsius })
);

/** The month, with the pod's registry record (thresholds as recorded in `devices.json`). */
export const algalitaMonth = (): Fleet => {
  const recorded = [...SEP_25_26, ...SEP_29_30, ...OCT_7].map(fromRecorded);
  const spans = [SEP_25_26, SEP_29_30, OCT_7].map((rows) => [
    Date.parse(rows[0][0]) - 15 * MINUTE, Date.parse(rows[rows.length - 1][0]) + 15 * MINUTE,
  ]);
  const synthetic: RawReading[] = [];
  for (let ms = START; ms <= NOW; ms += 30 * MINUTE) {
    if (spans.some(([from, to]) => ms >= from && ms <= to)) continue;
    const water = ordinary(ms);
    if (ms > LOW_FROM && ms < LOW_UNTIL) water.ph = lowPh(ms);
    // After the recorded Oct 7 rows end at 8.41, ease back to the ordinary night over two hours,
    // so the synthetic resume is not a jump of its own.
    const sinceOct7 = ms - Date.parse(OCT_7[OCT_7.length - 1][0]);
    if (sinceOct7 > 0 && sinceOct7 <= 2 * HOUR) {
      water.ph = +(8.41 + ((water.ph - 8.41) * sinceOct7) / (2 * HOUR)).toFixed(3);
    }
    synthetic.push(reading(ms, water));
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
        notificationFrequency: "1x/day",
        displayed: true,
        thresholds: {
          minPH: "6", maxPH: "10", minORP: "50", maxORP: "400", minDissolvedOxygen: "4",
          maxDissolvedOxygen: "15", minConductivity: "40000", maxConductivity: "75000",
          minTemperature: "50", maxTemperature: "80",
        },
      },
    }],
    readings: { [ALGALITA]: [...synthetic, ...recorded].sort((a, b) => a.timestamp - b.timestamp) },
  };
};

