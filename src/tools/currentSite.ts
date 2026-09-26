import type { DeviceReading } from "../types/device.types";

export const SITE_MOVE_DISTANCE_KM = 1;
const EARTH_RADIUS_KM = 6371;

/** Use only best_lat/best_lon, never the free-text location or fallback GPS fields. */
const coordinates = (row: DeviceReading): [number, number] | undefined => {
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
const distanceKm = ([a, b]: [number, number], [c, d]: [number, number]): number => {
  const h = Math.sin(radians(c - a) / 2) ** 2
    + Math.cos(radians(a)) * Math.cos(radians(c)) * Math.sin(radians(d - b) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
};

export interface CurrentSite {
  readings: DeviceReading[];
  note?: string;
}

/** Chronological visits, including a new visit when a pod returns to a former location. */
export const currentSite = (rows: DeviceReading[]): CurrentSite => {
  const ordered = rows.filter((r) => Number.isFinite(Date.parse(r.observedAt ?? "")))
    .sort((a, b) => Date.parse(a.observedAt!) - Date.parse(b.observedAt!));
  let start = Infinity;
  let end = -Infinity;
  let centroid: [number, number] | undefined;
  let count = 0;
  // Unit-vector averaging avoids an artificial move at the international date line.
  let x = 0;
  let y = 0;
  let z = 0;
  ordered.forEach((row) => {
    const fix = coordinates(row);
    if (!fix) return;
    if (!centroid || distanceKm(centroid, fix) > SITE_MOVE_DISTANCE_KM) {
      start = Date.parse(row.observedAt!);
      count = 0;
      x = 0;
      y = 0;
      z = 0;
    }
    const [lat, lon] = fix.map(radians);
    x += Math.cos(lat) * Math.cos(lon);
    y += Math.cos(lat) * Math.sin(lon);
    z += Math.sin(lat);
    count += 1;
    centroid = [Math.atan2(z / count, Math.hypot(x / count, y / count)) * (180 / Math.PI),
      Math.atan2(y, x) * (180 / Math.PI)];
    end = Date.parse(row.observedAt!);
  });
  if (!centroid) {
    return {
      readings: [],
      note: "Current site not assessed: no readings have usable best_lat and "
      + "best_lon coordinates. Readings without an established site were excluded.",
    };
  }
  const earlier = ordered.filter((r) => Date.parse(r.observedAt!) < start);
  const unlocated = rows.length - ordered.length
    + ordered.filter((r) => Date.parse(r.observedAt!) > end).length;
  const notes: string[] = [];
  if (earlier.length) {
    notes.push(`${earlier.length} reading(s) from an earlier location were excluded `
      + `(${earlier[0].observedAt} to ${earlier[earlier.length - 1].observedAt}).`);
  }
  if (unlocated) {
    notes.push(`${unlocated} reading(s) with missing timestamps or outside the current site's `
      + "coordinate-supported time span were excluded.");
  }
  return {
    readings: ordered.filter((r) => {
      const time = Date.parse(r.observedAt!);
      return time >= start && time <= end;
    }).map((r) => {
      const fix = coordinates(r);
      return { ...r, latitude: fix?.[0], longitude: fix?.[1] };
    }),
    ...(notes.length ? { note: notes.join(" ") } : {}),
  };
};
