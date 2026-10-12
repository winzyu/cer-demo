/**
 * A fabricated fleet for the data-skepticism checks
 * (`docs/migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md` §2 and §6).
 *
 * Served by `fakeDeviceApi.ts` in the wire shapes the real device API returns, so the real
 * `DeviceApiClient`, decoder, QC and verdicts run unchanged. Shared by the Jest suite
 * (`test/unit/dataSkepticism.test.ts`) and the paid replay (`scripts/skepticism/`).
 *
 * - **Bay Mouth Pod**, shaped on the production week Gilligan wrote off as sensor faults, with the
 *   same constants and seed as the Mirror's `scripts/mirror/addSkepticismPod.mjs`: a salt-water pod
 *   whose temperature follows the sun (coolest about 06:30 PDT, warmest about 15:30 PDT, the same
 *   clock hours every day), pH and conductivity moving opposite to it, pH below the pod's minimum
 *   of 6 on many afternoons, turbidity stuck at 0, 16 conductivity zeros in the last week, and an
 *   earlier location whose readings end 50 days before now.
 * - Three guard pods for over-correction: **Harbor Acid Pod** (four pH readings of 2.07 in an
 *   otherwise ordinary week), **Estuary Oxygen Pod** (dissolved oxygen near 2 mg/L for 18 hours,
 *   three days ago) and **Quiet Cove Pod** (silent for the last 12 days).
 *
 * Deterministic for a given `now`.
 */

export const ORGANIZATION = "org-bay-000000000001";

export const BAY_MOUTH = "dev:100000000000023";
export const HARBOR_ACID = "dev:100000000000024";
export const ESTUARY_OXYGEN = "dev:100000000000025";
export const QUIET_COVE = "dev:100000000000026";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const PDT_OFFSET_HOURS = -7;

/** Production's pod reported about 45 times a day; the earlier site about every 93 minutes. */
const CURRENT_STEP_MINUTES = 32;
const EARLIER_STEP_MINUTES = 93;
const CURRENT_DAYS = 50;
const EARLIER_DAYS = 50;
export const IMPLAUSIBLE_LAST_WEEK = 16;

/** Guard pods report every 30 minutes over 30 days at one site. */
const GUARD_STEP_MINUTES = 30;
const GUARD_DAYS = 30;
export const ACID_READING = 2.07;
export const ACID_READINGS = 4;
export const OXYGEN_EVENT_HOURS = 18;
export const OXYGEN_EVENT_START_DAYS_AGO = 3;
export const QUIET_SILENT_DAYS = 12;

export interface Site { lat: number; lon: number; place: string }

export interface WaterValues {
  temperature: number;
  ph: number;
  conductivity: number;
  oxygen: number;
  orp: number;
}

/** A raw `/water/period` document: temperature in °C, as the route stores it. */
export interface RawReading {
  device: string;
  timestamp: number;
  date: string;
  best_lat: number;
  best_lon: number;
  best_location: string;
  event: string;
  water_data: Record<string, number>;
}

export interface FleetDevice {
  id: string;
  data: {
    label: string;
    name: string;
    organization: string;
    operatingEnvironment: string;
    nextCalibrationDate: string;
    notificationFrequency: string;
    displayed: boolean;
    thresholds: Record<string, string>;
  };
}

export interface Fleet {
  now: number;
  devices: FleetDevice[];
  readings: Record<string, RawReading[]>;
}

/** mulberry32, as in the Mirror script, so a pod's values depend only on its seed and `now`. */
const createRandom = (seed: number): (() => number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 0 at 06:30 PDT, 1 at 15:30 PDT: a 9-hour rise and a 15-hour fall, fixed to the clock. */
export const solar = (at: Date): number => {
  const hour = (((at.getUTCHours() + at.getUTCMinutes() / 60 + PDT_OFFSET_HOURS) % 24) + 24) % 24;
  if (hour >= 6.5 && hour < 15.5) return (1 - Math.cos(Math.PI * ((hour - 6.5) / 9))) / 2;
  const sincePeak = (hour - 15.5 + 24) % 24;
  return (1 + Math.cos(Math.PI * (sincePeak / 15))) / 2;
};

const fahrenheitToCelsius = (f: number): number => (f - 32) * (5 / 9);

const LIMITS = {
  minTemperature: "50", maxTemperature: "95", minPH: "6", maxPH: "8.5",
  minDissolvedOxygen: "4", maxDissolvedOxygen: "14", minORP: "-200", maxORP: "400",
  minConductivity: "40000", maxConductivity: "75000",
};

const device = (id: string, label: string, name: string): FleetDevice => ({
  id,
  data: {
    label,
    name,
    organization: ORGANIZATION,
    operatingEnvironment: "salt-water",
    nextCalibrationDate: "2026-12-15T00:00:00.000Z",
    notificationFrequency: "1x/day",
    displayed: true,
    thresholds: { ...LIMITS },
  },
});

/** Builds rows for one pod; `values` runs before the row's own jitter, as in the Mirror script. */
const podWriter = (label: string, random: () => number) => {
  const jitter = (spread: number): number => (random() - 0.5) * spread;
  let count = 1;
  const row = (at: Date, site: Site, values: WaterValues): RawReading => {
    const lat = site.lat + jitter(0.0008);
    const lon = site.lon + jitter(0.0008);
    const reading: RawReading = {
      device: label,
      timestamp: Math.floor(at.getTime() / 1000),
      date: at.toISOString(),
      best_lat: lat,
      best_lon: lon,
      best_location: site.place,
      event: `${label}-${at.getTime()}`,
      water_data: {
        72: 0,
        97: values.oxygen,
        98: values.orp,
        99: values.ph,
        100: values.conductivity,
        102: values.temperature,
        count,
        doError: 0, ecError: 0, orpError: 0, phError: 0, rtdError: 0,
        turbError: 0,
        turbVolt: 0,
        NCvoltage: +(3.9 + jitter(0.4)).toFixed(4),
        NCtemp: Math.round((values.temperature + 5 + jitter(3)) * 16) / 16,
        lat,
        lon,
      },
    };
    count = count >= 421 ? 1 : count + 1;
    return reading;
  };
  return { jitter, row };
};

const steps = (start: number, end: number, stepMinutes: number): Date[] => {
  const out: Date[] = [];
  for (let t = start; t <= end; t += stepMinutes * MINUTE) out.push(new Date(Math.floor(t / 1000) * 1000));
  return out;
};

const bayMouth = (now: number, phSwing: number): RawReading[] => {
  const { jitter, row } = podWriter(BAY_MOUTH, createRandom(20261009));
  const current: Site = { lat: 33.7536, lon: -118.1146, place: "Bay Mouth CA" };
  const earlier: Site = { lat: 33.6047, lon: -117.8889, place: "Upper Harbor CA" };
  const currentValues = (at: Date): WaterValues => {
    const s = solar(at);
    return {
      temperature: +fahrenheitToCelsius(67.5 + s * 21 + jitter(1.5)).toFixed(4),
      ph: +(7.35 - s * phSwing + jitter(0.2)).toFixed(3),
      conductivity: Math.round(69_000 - s * 14_000 + jitter(2_000)),
      oxygen: +(6.5 + s * 2.5 + jitter(0.6)).toFixed(3),
      orp: +(200 + jitter(80)).toFixed(1),
    };
  };
  const earlierValues = (at: Date): WaterValues => {
    const s = solar(at);
    return {
      temperature: +fahrenheitToCelsius(66 + s * 6 + jitter(1.5)).toFixed(4),
      ph: +(8.05 - s * 0.1 + jitter(0.1)).toFixed(3),
      conductivity: Math.round(51_000 + jitter(2_000)),
      oxygen: +(7.5 + s * 1.2 + jitter(0.5)).toFixed(3),
      orp: +(220 + jitter(60)).toFixed(1),
    };
  };

  const currentStart = now - CURRENT_DAYS * DAY;
  const rows: RawReading[] = [];
  for (let t = now - (CURRENT_DAYS + EARLIER_DAYS) * DAY; t < currentStart; t += EARLIER_STEP_MINUTES * MINUTE) {
    const at = new Date(Math.floor(t / 1000) * 1000);
    rows.push(row(at, earlier, earlierValues(at)));
  }
  const firstCurrent = rows.length;
  steps(currentStart, now, CURRENT_STEP_MINUTES).forEach((at) => rows.push(row(at, current, currentValues(at))));

  // Implausible readings in the last week: conductivity at its 0 floor, spread evenly.
  const lastWeek = rows.slice(firstCurrent).map((r, i) => ({ r, i: i + firstCurrent }))
    .filter(({ r }) => r.timestamp * 1000 >= now - 7 * DAY);
  const stride = Math.floor(lastWeek.length / IMPLAUSIBLE_LAST_WEEK);
  for (let k = 0; k < IMPLAUSIBLE_LAST_WEEK; k += 1) {
    rows[lastWeek[k * stride + Math.floor(stride / 2)].i].water_data[100] = 0;
  }
  return rows;
};

/**
 * Ordinary coastal seawater with a mild daily cycle, the baseline every guard pod starts from.
 * Noise drifts (AR(1), 0.9 carry-over) instead of jumping independently between readings, as
 * real probes do; independent noise on a steady channel trips the spike rule by itself (see
 * `dataSkepticism.test.ts`, "steady channel"), which would blur what the guards test.
 */
const ordinary = (jitter: (spread: number) => number) => {
  const drift = { temperature: 0, ph: 0, conductivity: 0, oxygen: 0, orp: 0 };
  const step = (key: keyof typeof drift, spread: number): number => {
    drift[key] = 0.9 * drift[key] + jitter(spread * 0.45);
    return drift[key];
  };
  return (at: Date): WaterValues => {
    const s = solar(at);
    return {
      temperature: +fahrenheitToCelsius(64 + s * 5 + step("temperature", 1)).toFixed(4),
      ph: +(8.0 - s * 0.08 + step("ph", 0.08)).toFixed(3),
      conductivity: Math.round(52_000 + step("conductivity", 1_500)),
      oxygen: +(7.4 + s * 1.0 + step("oxygen", 0.4)).toFixed(3),
      orp: +(220 + step("orp", 50)).toFixed(1),
    };
  };
};

const harborAcid = (now: number): RawReading[] => {
  const { jitter, row } = podWriter(HARBOR_ACID, createRandom(20261024));
  const site: Site = { lat: 33.72, lon: -118.27, place: "Harbor CA" };
  const values = ordinary(jitter);
  const rows = steps(now - GUARD_DAYS * DAY, now, GUARD_STEP_MINUTES).map((at) => row(at, site, values(at)));
  // Four isolated readings of pH 2.07 in the last week, a day and a half apart.
  for (let k = 0; k < ACID_READINGS; k += 1) {
    const target = now - (1 + k * 1.5) * DAY;
    const index = rows.findIndex((r) => r.timestamp * 1000 >= target);
    rows[index].water_data[99] = ACID_READING;
  }
  return rows;
};

const estuaryOxygen = (now: number): RawReading[] => {
  const { jitter, row } = podWriter(ESTUARY_OXYGEN, createRandom(20261025));
  const site: Site = { lat: 33.98, lon: -118.45, place: "Estuary CA" };
  const start = now - OXYGEN_EVENT_START_DAYS_AGO * DAY;
  const end = start + OXYGEN_EVENT_HOURS * HOUR;
  const base = ordinary(jitter);
  return steps(now - GUARD_DAYS * DAY, now, GUARD_STEP_MINUTES).map((at) => {
    const values = base(at);
    const t = at.getTime();
    if (t >= start && t <= end) {
      // A real low-oxygen event: a two-hour slide to about 2 mg/L, held, then a two-hour recovery,
      // with warmer water and a small ORP drop alongside so no channel looks stuck.
      const ramp = Math.min(1, (t - start) / (2 * HOUR), (end - t) / (2 * HOUR));
      values.oxygen = +(values.oxygen - ramp * (values.oxygen - 2.1) + jitter(0.3)).toFixed(3);
      values.temperature = +(values.temperature + ramp * 1.5).toFixed(4);
      values.orp = +(values.orp - ramp * 60).toFixed(1);
    }
    return row(at, site, values);
  });
};

const quietCove = (now: number): RawReading[] => {
  const { jitter, row } = podWriter(QUIET_COVE, createRandom(20261026));
  const site: Site = { lat: 34.01, lon: -118.81, place: "Quiet Cove CA" };
  const values = ordinary(jitter);
  return steps(now - GUARD_DAYS * DAY, now - QUIET_SILENT_DAYS * DAY, GUARD_STEP_MINUTES)
    .map((at) => row(at, site, values(at)));
};

export interface FleetOptions {
  /**
   * How far Bay Mouth's pH falls from dawn to the afternoon peak. The default 1.35 matches the
   * Mirror pod (afternoons near 6, rarely past the exceedance margin); 1.9 takes every afternoon
   * to about 5.45, well past it, for the "a daily dip is not a persistent offset" check.
   */
  bayMouthPhSwing?: number;
}

export const DEFAULT_PH_SWING = 1.35;

export const buildFleet = (now: number, options: FleetOptions = {}): Fleet => ({
  now,
  devices: [
    device("doc-fixture-skepticism", BAY_MOUTH, "Bay Mouth Pod"),
    device("doc-fixture-acid", HARBOR_ACID, "Harbor Acid Pod"),
    device("doc-fixture-oxygen", ESTUARY_OXYGEN, "Estuary Oxygen Pod"),
    device("doc-fixture-quiet", QUIET_COVE, "Quiet Cove Pod"),
  ],
  readings: {
    [BAY_MOUTH]: bayMouth(now, options.bayMouthPhSwing ?? DEFAULT_PH_SWING),
    [HARBOR_ACID]: harborAcid(now),
    [ESTUARY_OXYGEN]: estuaryOxygen(now),
    [QUIET_COVE]: quietCove(now),
  },
});

const UNIT_MS: Record<string, number> = {
  hour: HOUR, day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY, fiveYears: 5 * 365 * DAY,
};

const withFahrenheit = (reading: RawReading): RawReading => ({
  ...reading,
  water_data: { ...reading.water_data, 102: reading.water_data[102] * (9 / 5) + 32 },
});

/**
 * Answers one device-API path the way the real backend does: `/devices` as `[{id, data}]`,
 * `/water/period/:n/:unit?device=` as raw documents in °C (newest window ending at `now`), and
 * `/water/last/:device` as `{id, data}` in °F. `undefined` means the path is not served.
 */
export const routeDeviceApi = (fleet: Fleet, pathAndQuery: string): unknown => {
  const url = new URL(pathAndQuery, "http://fake.invalid");
  const path = url.pathname.replace(/^\/api\/v1/, "");
  if (path === "/devices") return fleet.devices;

  const last = /^\/water\/last\/(.+)$/.exec(path);
  if (last) {
    const rows = fleet.readings[decodeURIComponent(last[1])] ?? [];
    const newest = rows.at(-1);
    return newest ? { id: newest.event, data: withFahrenheit(newest) } : [];
  }

  const period = /^\/water\/period\/(\d+)\/([A-Za-z]+)$/.exec(path);
  if (period) {
    const span = Number(period[1]) * (UNIT_MS[period[2]] ?? NaN);
    if (!Number.isFinite(span)) return undefined;
    const label = url.searchParams.get("device");
    const pods = label ? [label] : Object.keys(fleet.readings);
    return pods.flatMap((pod) => (fleet.readings[pod] ?? [])
      .filter((r) => r.timestamp * 1000 >= fleet.now - span && r.timestamp * 1000 <= fleet.now));
  }
  return undefined;
};
