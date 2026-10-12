#!/usr/bin/env node
/**
 * Adds one fabricated pod to a running mirror emulator for the data-skepticism checks
 * (docs/migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md §2 and §6).
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/mirror/addSkepticismPod.mjs
 *
 * The pod is shaped on the production week Gilligan wrote off as sensor faults: a salt-water pod
 * whose temperature follows the sun (coolest about 06:30 PDT, warmest about 15:30 PDT, the same
 * clock hours every day), with pH and conductivity moving opposite to it, pH dipping below the
 * pod's minimum of 6 on many afternoons, turbidity stuck at 0, 16 implausible readings in the last
 * week, and an earlier location whose readings end 50 days before now.
 *
 * It belongs to Bay Conservancy, which has no other pod, so only `user-bay-cust-1` and superadmins
 * see it. It adds documents with fixed ids and wipes nothing: a re-run overwrites the same
 * documents. It refuses unless the emulator host names this machine, so it cannot reach the live
 * database.
 */
import { Firestore } from "@google-cloud/firestore";

const PROJECT_ID = "demo-cer-mirror";
const LABEL = "dev:100000000000023";
const DEVICE_ID = "doc-fixture-skepticism";
const ORGANIZATION = "org-bay-000000000001";
const CURRENT = { lat: 33.7536, lon: -118.1146, place: "Bay Mouth CA" };
const EARLIER = { lat: 33.6047, lon: -117.8889, place: "Upper Harbor CA" };
/** Production's pod reported about 45 times a day; the earlier site about every 93 minutes. */
const CURRENT_STEP_MINUTES = 32;
const EARLIER_STEP_MINUTES = 93;
const CURRENT_DAYS = 50;
const EARLIER_DAYS = 50;
const IMPLAUSIBLE_LAST_WEEK = 16;
const PDT_OFFSET_HOURS = -7;

const host = process.env.FIRESTORE_EMULATOR_HOST ?? "";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
  console.error("FIRESTORE_EMULATOR_HOST must name a local emulator (127.0.0.1:<port>); refusing.");
  process.exit(1);
}

/** mulberry32: deterministic, so a re-run writes the same values. */
const createRandom = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const random = createRandom(20261009);
const jitter = (spread) => (random() - 0.5) * spread;

/** 0 at 06:30 PDT, 1 at 15:30 PDT: a 9-hour rise and a 15-hour fall, fixed to the clock. */
const solar = (at) => {
  const hour = (((at.getUTCHours() + at.getUTCMinutes() / 60 + PDT_OFFSET_HOURS) % 24) + 24) % 24;
  if (hour >= 6.5 && hour < 15.5) return (1 - Math.cos(Math.PI * ((hour - 6.5) / 9))) / 2;
  const sincePeak = (hour - 15.5 + 24) % 24;
  return (1 + Math.cos(Math.PI * (sincePeak / 15))) / 2;
};

const fahrenheitToCelsius = (f) => (f - 32) * (5 / 9);

const row = (at, site, values, count) => {
  const lat = site.lat + jitter(0.0008);
  const lon = site.lon + jitter(0.0008);
  return {
    device: LABEL,
    timestamp: Math.floor(at.getTime() / 1000),
    date: at.toISOString(),
    best_lat: lat,
    best_lon: lon,
    best_location: site.place,
    event: `skepticism-${at.getTime()}`,
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
};

const currentValues = (at) => {
  const s = solar(at);
  return {
    temperature: +fahrenheitToCelsius(67.5 + s * 21 + jitter(1.5)).toFixed(4),
    ph: +(7.35 - s * 1.35 + jitter(0.2)).toFixed(3),
    conductivity: Math.round(69_000 - s * 14_000 + jitter(2_000)),
    oxygen: +(6.5 + s * 2.5 + jitter(0.6)).toFixed(3),
    orp: +(200 + jitter(80)).toFixed(1),
  };
};

/** The earlier site: ordinary coastal seawater with a mild daily cycle. */
const earlierValues = (at) => {
  const s = solar(at);
  return {
    temperature: +fahrenheitToCelsius(66 + s * 6 + jitter(1.5)).toFixed(4),
    ph: +(8.05 - s * 0.1 + jitter(0.1)).toFixed(3),
    conductivity: Math.round(51_000 + jitter(2_000)),
    oxygen: +(7.5 + s * 1.2 + jitter(0.5)).toFixed(3),
    orp: +(220 + jitter(60)).toFixed(1),
  };
};

const now = new Date();
const minute = 60_000;
const day = 86_400_000;
const rows = [];
let count = 1;

const earlierStart = now.getTime() - (CURRENT_DAYS + EARLIER_DAYS) * day;
const currentStart = now.getTime() - CURRENT_DAYS * day;
for (let t = earlierStart; t < currentStart; t += EARLIER_STEP_MINUTES * minute) {
  const at = new Date(Math.floor(t / 1000) * 1000);
  rows.push(row(at, EARLIER, earlierValues(at), count));
  count = count >= 421 ? 1 : count + 1;
}
const firstCurrent = rows.length;
for (let t = currentStart; t <= now.getTime(); t += CURRENT_STEP_MINUTES * minute) {
  const at = new Date(Math.floor(t / 1000) * 1000);
  rows.push(row(at, CURRENT, currentValues(at), count));
  count = count >= 421 ? 1 : count + 1;
}

// Implausible readings in the last week: conductivity at its 0 floor, spread evenly.
const lastWeek = rows.slice(firstCurrent).map((r, i) => ({ r, i: i + firstCurrent }))
  .filter(({ r }) => r.timestamp * 1000 >= now.getTime() - 7 * day);
const stride = Math.floor(lastWeek.length / IMPLAUSIBLE_LAST_WEEK);
for (let k = 0; k < IMPLAUSIBLE_LAST_WEEK; k += 1) {
  rows[lastWeek[k * stride + Math.floor(stride / 2)].i].water_data[100] = 0;
}

const db = new Firestore({ projectId: PROJECT_ID });
const writer = db.bulkWriter();
writer.set(db.collection("devices").doc(DEVICE_ID), {
  label: LABEL,
  name: "Bay Mouth Pod",
  organization: ORGANIZATION,
  operatingEnvironment: "salt-water",
  nextCalibrationDate: "2026-12-15T00:00:00.000Z",
  notificationFrequency: "1x/day",
  displayed: true,
  thresholds: {
    minTemperature: "50", maxTemperature: "95", minPH: "6", maxPH: "8.5",
    minDissolvedOxygen: "4", maxDissolvedOxygen: "14", minORP: "-200", maxORP: "400",
    minConductivity: "40000", maxConductivity: "75000",
  },
});
rows.forEach((r, i) => writer.set(db.collection("water-data").doc(`skepticism-${String(i).padStart(5, "0")}`), r));
await writer.close();
await db.terminate();

const week = rows.filter((r) => r.timestamp * 1000 >= now.getTime() - 7 * day);
const belowSix = week.filter((r) => r.water_data[99] < 6).length;
console.log(
  `[Mirror] Added ${LABEL} (Bay Mouth Pod) on ${host}: ${rows.length} readings `
  + `(${firstCurrent} at the earlier site, ${rows.length - firstCurrent} current); `
  + `last 7 days ${week.length} readings, ${belowSix} with pH below 6, ${IMPLAUSIBLE_LAST_WEEK} with conductivity 0; `
  + `latest ${rows.at(-1).date}.`,
);
