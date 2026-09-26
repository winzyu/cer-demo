import { decodeReading } from "../../src/devices/metrics";
import { currentSite, SITE_MOVE_DISTANCE_KM } from "../../src/tools/currentSite";

const row = (hour: number, latitude?: number, longitude = -82, location = "unchanged") => decodeReading({
  timestamp: Date.parse("2026-09-20T00:00:00Z") / 1000 + hour * 3600,
  best_lat: latitude, best_lon: longitude, best_location: location,
  water_data: { 99: hour },
});
const hours = (rows: ReturnType<typeof row>[]) => currentSite(rows).readings.map((r) => r.metrics.ph.value);

describe("current site", () => {
  it("uses the latest chronological visit when a pod moves twice, even back to its first site", () => {
    expect(hours([row(5, 41), row(1, 41), row(3, 35), row(2, 41), row(4, 35)]))
      .toEqual([5]);
  });
  it("keeps jitter below one km and ignores changing free-text location names", () => {
    expect(SITE_MOVE_DISTANCE_KM).toBe(1);
    expect(hours([row(1, 41, -82, "A"), row(2, 41.004, -82, "B"), row(3, 40.998)]))
      .toEqual([1, 2, 3]);
  });
  it("compares with the running centroid, not just the preceding fix", () => {
    expect(hours([row(1, 41), row(2, 41.006), row(3, 41.0125)]))
      .toEqual([3]);
  });
  it("includes unpositioned rows only between the current site's first and last fixes", () => {
    expect(hours([row(0), row(1, 35), row(2), row(3, 41), row(4), row(5, 41), row(6)]))
      .toEqual([3, 4, 5]);
  });
  it("withholds all values when no site can be established", () => {
    const result = currentSite([row(1), row(2)]);
    expect(result.readings).toEqual([]);
    expect(result.note).toContain("Current site not assessed");
  });
  it("does not fall back to lat/lon or use the backend's 0,0 missing-fix sentinel", () => {
    const missing = decodeReading({ timestamp: 1, best_lat: 0, best_lon: 0, lat: 41, lon: -82 });
    expect(currentSite([missing]).readings).toEqual([]);
  });
  it("handles jitter across the date line", () => {
    expect(hours([row(1, 41, 179.999), row(2, 41, -179.999), row(3, 41, 179.999)]))
      .toEqual([1, 2, 3]);
  });
  it("reports only an exclusion count and dates, never old metric values", () => {
    const result = currentSite([row(1, 35), row(2, 35), row(3, 41)]);
    expect(result.note).toBe("2 reading(s) from an earlier location were excluded "
      + "(2026-09-20T01:00:00.000Z to 2026-09-20T02:00:00.000Z).");
  });
});
