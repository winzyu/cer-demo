import type { DeviceReading } from "../types/device.types";

export const SITE_MOVE_DISTANCE_KM = 1;
const EARTH_RADIUS_KM = 6371;

/** Use only best_lat/best_lon, never the free-text location or fallback GPS fields. */
export const coordinates = (row: DeviceReading): [number, number] | undefined => {
  const parse = (value: unknown): number => (
    (typeof value === "number" || (typeof value === "string" && value.trim() !== ""))
      ? Number(value) : NaN
  );
  const lat = parse(row.raw.best_lat);
  const lon = parse(row.raw.best_lon);
  // The backend uses 0,0 for no GPS fix. Equator/prime-meridian fixes remain valid.
  return Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0)
    ? [lat, lon] : undefined;
};

const radians = (degrees: number): number => degrees * (Math.PI / 180);
export const distanceKm = ([a, b]: [number, number], [c, d]: [number, number]): number => {
  const h = Math.sin(radians(c - a) / 2) ** 2
    + Math.cos(radians(a)) * Math.cos(radians(c)) * Math.sin(radians(d - b) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
};

export interface CurrentSite {
  readings: DeviceReading[];
  note?: string;
  /** The reader's version of `note`, one sentence per caveat (see `USER_NOTES_FIELD`). */
  userNotes?: string[];
}

export interface SiteVisit {
  startMs: number;
  endMs: number;
  centroid: [number, number];
  count: number;
  x: number;
  y: number;
  z: number;
}

export const orderedReadings = (rows: DeviceReading[]): DeviceReading[] => rows
  .filter((r) => Number.isFinite(Date.parse(r.observedAt ?? "")))
  .sort((a, b) => Date.parse(a.observedAt!) - Date.parse(b.observedAt!));

/** Shared chronological running-centroid rule for production and the manual audit. */
export const siteVisits = (rows: DeviceReading[]): SiteVisit[] => {
  const visits: SiteVisit[] = [];
  orderedReadings(rows).forEach((row) => {
    const fix = coordinates(row);
    if (!fix) return;
    const time = Date.parse(row.observedAt!);
    let visit = visits[visits.length - 1];
    if (!visit || distanceKm(visit.centroid, fix) > SITE_MOVE_DISTANCE_KM) {
      visit = {
        startMs: time, endMs: time, centroid: fix, count: 0, x: 0, y: 0, z: 0,
      };
      visits.push(visit);
    }
    const [lat, lon] = fix.map(radians);
    visit.x += Math.cos(lat) * Math.cos(lon);
    visit.y += Math.cos(lat) * Math.sin(lon);
    visit.z += Math.sin(lat);
    visit.count += 1;
    const horizontal = Math.hypot(visit.x / visit.count, visit.y / visit.count);
    visit.centroid = [Math.atan2(visit.z / visit.count, horizontal) * (180 / Math.PI),
      Math.atan2(visit.y, visit.x) * (180 / Math.PI)];
    visit.endMs = time;
  });
  return visits;
};

/**
 * After accepting a fix, the centroid is within 1 km of that fix.
 * Two consecutive positioned fixes over 2 km apart therefore force a reset regardless of
 * unseen earlier history; a mere 1 km separation or a fetched left edge proves nothing.
 */
export const provenSiteStart = (rows: DeviceReading[]): number | undefined => {
  let previous: [number, number] | undefined;
  let start: number | undefined;
  orderedReadings(rows).forEach((row) => {
    const fix = coordinates(row);
    if (!fix) return;
    if (previous && distanceKm(previous, fix) > 2 * SITE_MOVE_DISTANCE_KM) {
      start = Date.parse(row.observedAt!);
    }
    previous = fix;
  });
  return start;
};

/** Chronological visits, including a new visit when a pod returns to a former location. */
export const currentSite = (rows: DeviceReading[]): CurrentSite => {
  const ordered = orderedReadings(rows);
  const visits = siteVisits(ordered);
  const latest = visits[visits.length - 1];
  if (!latest) {
    // A pod that never recorded a usable fix is treated as never having moved (user decision
    // 2026-09-27). Callers pass complete history here, so this is not a window without fixes.
    const untimed = rows.length - ordered.length;
    const excluded = untimed ? ` ${untimed} reading(s) with missing timestamps were excluded.` : "";
    return {
      readings: ordered,
      note: "Location not recorded: no reading has usable best_lat and best_lon coordinates, "
        + `so the pod is treated as never having moved.${excluded}`,
      userNotes: [
        "Location not recorded: this pod has never reported a GPS position, so all of its "
          + "readings are treated as coming from one site.",
        ...(untimed ? [`${untimed} reading(s) without a timestamp were left out.`] : []),
      ],
    };
  }
  const { startMs: start, endMs: end } = latest;
  const earlier = ordered.filter((r) => Date.parse(r.observedAt!) < start);
  const unlocated = rows.length - ordered.length
    + ordered.filter((r) => Date.parse(r.observedAt!) > end).length;
  const notes: string[] = [];
  const userNotes: string[] = [];
  if (earlier.length) {
    const span = `(${earlier[0].observedAt} to ${earlier[earlier.length - 1].observedAt})`;
    notes.push(`${earlier.length} reading(s) from an earlier location were excluded ${span}.`);
    userNotes.push(`${earlier.length} reading(s) from an earlier location ${span} were left out; `
      + "only the pod's current site is covered.");
  }
  if (unlocated) {
    notes.push(`${unlocated} reading(s) with missing timestamps or outside the current site's `
      + "coordinate-supported time span were excluded.");
    userNotes.push(`${unlocated} reading(s) without a timestamp, or from outside the time the `
      + "pod's GPS places it at its current site, were left out.");
  }
  return {
    readings: ordered.filter((r) => {
      const time = Date.parse(r.observedAt!);
      return time >= start && time <= end;
    }).map((r) => {
      const fix = coordinates(r);
      return { ...r, latitude: fix?.[0], longitude: fix?.[1] };
    }),
    ...(notes.length ? { note: notes.join(" "), userNotes } : {}),
  };
};
