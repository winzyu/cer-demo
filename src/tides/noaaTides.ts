import { config } from "../config";
import type { FetchLike } from "../devices/DeviceApiClient";

/**
 * NOAA CO-OPS tide predictions for `get_tides`, read directly rather than through CER's
 * `GET /water/tides/:device/:start/:end` (`docs/reference/DEVICE_API.md`).
 *
 * The CER route answers `[]` for an inland pod, a pod with no GPS fix, a station with no
 * predictions and any NOAA error alike, and never says which station it used. Verified
 * 2026-10-15: its nearest-station lookup reads `stationList` while NOAA's metadata API answers
 * `stations`, and one registry `noaaTidesId` (`9087057`, `BACKEND_FIELDS.md` §4) is a Great Lakes
 * station NOAA has no predictions for. Calling NOAA here lets the tool name the station, its
 * distance and the reason when there is no tide.
 *
 * Predictions, not observations: the high and low times are NOAA's harmonic predictions for the
 * station, which is what a tide table gives; they do not include storm surge or swell.
 */

export interface TideStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** "R" reference or "S" subordinate; subordinate stations have high/low predictions only. */
  type?: string;
}

export interface TideEvent {
  /** Epoch ms, UTC. */
  atMs: number;
  type: "high" | "low";
  /** Metres above mean lower low water. */
  levelM: number;
}

export interface NoaaTidesOptions {
  dataUrl?: string;
  stationsUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  now?: () => number;
}

/** NOAA updates the station list quarterly; one fetch a day is plenty. */
const STATION_CACHE_MS = 24 * 60 * 60_000;

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);

/** Great-circle distance in kilometres. */
export const distanceKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
};

/** "20261008 14:05", the datagetter's GMT date format, for an epoch ms. */
const noaaDate = (ms: number): string => {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)} ${iso.slice(11, 16)}`;
};

export class NoaaTides {
  private readonly dataUrl: string;

  private readonly stationsUrl: string;

  private readonly timeoutMs: number;

  private readonly fetchImpl: FetchLike;

  private readonly now: () => number;

  private stationCache?: { at: number; stations: TideStation[] };

  constructor(options: NoaaTidesOptions = {}) {
    this.dataUrl = options.dataUrl ?? config.tides.dataUrl;
    this.stationsUrl = options.stationsUrl ?? config.tides.stationsUrl;
    this.timeoutMs = options.timeoutMs ?? config.tides.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => Date.now());
  }

  private async getJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        // A station NOAA cannot serve (a Great Lakes one, say) is a 400 whose JSON body says why.
        const body = await response.text().catch(() => "");
        let message = "";
        try {
          message = String(asRecord(asRecord(JSON.parse(body)).error).message ?? "").trim();
        } catch {
          // Not JSON; the status alone has to do.
        }
        throw new Error(`NOAA tides answered ${response.status}${message ? `: ${message}` : "."}`);
      }
      return await response.json();
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new Error(`NOAA tides timed out after ${this.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Every station with tide predictions. */
  async stations(): Promise<TideStation[]> {
    if (this.stationCache && this.now() - this.stationCache.at < STATION_CACHE_MS) {
      return this.stationCache.stations;
    }
    const payload = asRecord(await this.getJson(this.stationsUrl));
    const list = Array.isArray(payload.stations) ? payload.stations : [];
    const stations = list.map(asRecord)
      .filter((s) => typeof s.lat === "number" && typeof s.lng === "number" && s.id !== undefined)
      .map((s): TideStation => ({
        id: String(s.id),
        name: String(s.name ?? ""),
        lat: s.lat as number,
        lng: s.lng as number,
        ...(typeof s.type === "string" ? { type: s.type } : {}),
      }));
    if (stations.length === 0) {
      throw new Error("NOAA returned no tide stations.");
    }
    this.stationCache = { at: this.now(), stations };
    return stations;
  }

  /** The station with predictions nearest a position, with its distance. */
  async nearestStation(lat: number, lng: number)
    : Promise<{ station: TideStation; distanceKm: number } | null> {
    return (await this.stations()).reduce<{ station: TideStation; distanceKm: number } | null>(
      (best, station) => {
        const km = distanceKm(lat, lng, station.lat, station.lng);
        return !best || km < best.distanceKm ? { station, distanceKm: km } : best;
      },
      null,
    );
  }

  /** A station by id, or undefined when NOAA has no predictions for it. */
  async stationById(id: string): Promise<TideStation | undefined> {
    return (await this.stations()).find((station) => station.id === id);
  }

  /** High and low tides at a station between two instants. */
  async highsAndLows(stationId: string, startMs: number, endMs: number): Promise<TideEvent[]> {
    const params = new URLSearchParams({
      product: "predictions",
      application: "cer_gilligan",
      begin_date: noaaDate(startMs),
      end_date: noaaDate(endMs),
      datum: "MLLW",
      station: stationId,
      time_zone: "gmt",
      units: "metric",
      interval: "hilo",
      format: "json",
    });
    const payload = asRecord(await this.getJson(`${this.dataUrl}?${params.toString()}`));
    if (payload.error !== undefined) {
      const { message } = asRecord(payload.error);
      throw new Error(`NOAA has no predictions for station ${stationId}: ${String(message ?? "unknown error").trim()}`);
    }
    const predictions = Array.isArray(payload.predictions) ? payload.predictions : [];
    return predictions.map(asRecord).flatMap((point): TideEvent[] => {
      const atMs = Date.parse(`${String(point.t).replace(" ", "T")}:00Z`);
      const levelM = Number(point.v);
      const type = ({ H: "high", L: "low" } as const)[String(point.type) as "H" | "L"];
      return Number.isFinite(atMs) && Number.isFinite(levelM) && type
        ? [{ atMs, type, levelM }] : [];
    });
  }
}
