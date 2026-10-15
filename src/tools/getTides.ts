/**
 * `get_tides` -- NOAA's predicted high and low tides at the station nearest a pod, and, for one
 * metric, whether its daily peaks follow the tide (`src/tides/tideComparison.ts`).
 *
 * Michael named the NOAA tide data as the first outside source to give Gilligan
 * (`POST_LAUNCH_BACKLOG.md` §7): without it Gilligan may only say a cycle's timing fits a tide,
 * never that the tide drove it. Swell, waves and weather stay unmeasured; predicted tides carry
 * no storm surge or swell.
 *
 * The pod's position and the metric's samples come from one `QuerySensorData.query()` call, the
 * same window and site rules `query_sensor_data` uses; the station is the registry's
 * `noaaTidesId` when NOAA has predictions for it within `config.tides.maxStationKm` of the pod,
 * otherwise the nearest station within that distance, and none beyond it.
 */

import { config } from "../config";
import { mapWaterType } from "../report/referenceRanges";
import {
  distanceKm, NoaaTides, type TideEvent, type TideStation,
} from "../tides/noaaTides";
import { compareWithTides, MIN_TIDE_DAYS } from "../tides/tideComparison";
import { USER_NOTES_FIELD } from "../types/tool.types";
import type { ToolContext, ToolDefinition } from "../types/tool.types";
import { resolveErrorCode } from "../utils/errors";
import { createLogger } from "../utils/logger";
import type { Sample } from "./aggregate";
import { dailyCycle, dailyPeaks, localSolar } from "./dailyCycle";
import {
  METRIC_NAMES, QuerySensorData, SensorQueryError, type SensorToolResult,
} from "./querySensorData";

const log = createLogger("GetTides");

const HOUR_MS = 60 * 60_000;
/** Tides are listed one by one only up to this span; beyond it the comparison carries them. */
const MAX_LISTED_DAYS = 15;
const DEFAULT_TIME_RANGE = "last 14 days";

const SOURCE = "NOAA CO-OPS predicted high and low tides (a tide table: heights above mean lower "
  + "low water). Predictions carry no storm surge, swell or waves.";

export const getTidesDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "get_tides",
    description:
      "Returns NOAA's predicted high and low tides at the tide station nearest a pod, with the "
      + "station's name and distance, for a period. Give a metric to also learn whether that "
      + "metric's daily peaks follow the tide or keep to the time of day. Freshwater pods and "
      + "pods with no station nearby have no tides. Tides only: not swell, waves or weather.",
    parameters: {
      type: "object",
      properties: {
        device: {
          type: "string",
          description: "Which pod, by name or dev: label. Same rules as query_sensor_data.",
        },
        time_range: {
          type: "string",
          description:
            "The period, in query_sensor_data's grammar. Default \"last 14 days\"; comparing a "
            + `metric with the tide needs at least ${MIN_TIDE_DAYS} full days.`,
        },
        metric: {
          type: "string",
          enum: [...METRIC_NAMES],
          description: "Optional. A metric whose daily peaks to compare with the tides.",
        },
      },
      required: [],
    },
  },
};

export interface GetTidesOptions {
  sensor?: QuerySensorData;
  noaa?: NoaaTides;
  maxStationKm?: number;
}

type PickedStation =
  | { station: TideStation; km: number; chosen: string; note?: string }
  | { reason: string };

const noTides = (
  device: Record<string, unknown>,
  reason: string,
  userNote: string,
): SensorToolResult => ({
  device,
  tides: "none",
  reason,
  [USER_NOTES_FIELD]: [userNote],
});

export class GetTides {
  private readonly sensor: QuerySensorData;

  private readonly noaa: NoaaTides;

  private readonly maxStationKm: number;

  constructor(options: GetTidesOptions = {}) {
    this.sensor = options.sensor ?? new QuerySensorData();
    this.noaa = options.noaa ?? new NoaaTides();
    this.maxStationKm = options.maxStationKm ?? config.tides.maxStationKm;
  }

  /** Never throws for an ordinary failure; same rule and re-thrown codes as get_pod_thresholds. */
  async run(args: Record<string, unknown>, context?: ToolContext): Promise<SensorToolResult> {
    try {
      return await this.execute(args, context?.token);
    } catch (error) {
      const code = resolveErrorCode(error);
      if (code === "device_auth_expired" || code === "caller_token_required") {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      log.error(`get_tides failed: ${message}`);
      return { error: `Could not read tides: ${message}` };
    }
  }

  /** The registry's station when usable, otherwise the nearest one, with why. */
  private async pickStation(configured: unknown, lat: number, lng: number): Promise<PickedStation> {
    const notes: string[] = [];
    if (typeof configured === "string" || typeof configured === "number") {
      const station = await this.noaa.stationById(String(configured));
      if (!station) {
        notes.push(`The registry's tide station ${configured} has no NOAA tide predictions.`);
      } else {
        const km = distanceKm(lat, lng, station.lat, station.lng);
        if (km <= this.maxStationKm) return { station, km, chosen: "registry noaaTidesId" };
        notes.push(`The registry's tide station ${configured} (${station.name}) is ${Math.round(km)} km `
          + "from the pod, too far to use.");
      }
    }
    const nearest = await this.noaa.nearestStation(lat, lng);
    if (nearest && nearest.distanceKm <= this.maxStationKm) {
      return {
        station: nearest.station,
        km: nearest.distanceKm,
        chosen: "nearest to the pod",
        ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
      };
    }
    notes.push(`No NOAA tide-prediction station is within ${this.maxStationKm} km of the pod${
      nearest ? ` (nearest: ${nearest.station.name}, ${Math.round(nearest.distanceKm)} km).` : "."}`);
    return { reason: notes.join(" ") };
  }

  private async execute(args: Record<string, unknown>, token?: string): Promise<SensorToolResult> {
    const resolved = await this.sensor.resolveDeviceForTool(
      typeof args.device === "string" ? args.device : undefined,
      token,
    );
    if ("error" in resolved) return resolved.error;
    const { device } = resolved;
    const deviceOut = {
      name: device.name ?? device.label ?? "(unnamed)",
      label: device.label ?? null,
      operating_environment: device.operatingEnvironment ?? null,
    };

    if (mapWaterType(device.operatingEnvironment) === "Freshwater") {
      return noTides(
        deviceOut,
        "This pod is registered as freshwater, so it has no tides.",
        "This pod is registered as a freshwater pod, so tides do not apply to it.",
      );
    }

    const metric = typeof args.metric === "string" ? args.metric : undefined;
    const timeRange = typeof args.time_range === "string" && args.time_range.trim() !== ""
      ? args.time_range : DEFAULT_TIME_RANGE;
    let samples: readonly Sample[] = [];
    let reading: SensorToolResult;
    try {
      reading = await this.sensor.query({
        metric: (metric ?? "temperature") as (typeof METRIC_NAMES)[number],
        timeRange,
        aggregation: "series",
        device: device.label ?? device.name,
        onSamples: (_, inWindow) => { samples = inWindow; },
      }, token);
    } catch (error) {
      if (error instanceof SensorQueryError) return { error: error.message };
      throw error;
    }

    const position = reading.position as { latitude: number; longitude: number } | undefined;
    if (!position) {
      return noTides(
        deviceOut,
        "No reading in this period carries a GPS fix, so the pod cannot be placed near a tide station.",
        "The pod's position in this period is unknown, so its tides could not be looked up.",
      );
    }
    const window = reading.window_actually_searched as { start: string; end: string };
    const startMs = Date.parse(window.start);
    const endMs = Date.parse(window.end);

    const { latitude, longitude } = position;
    const picked = await this.pickStation(device.raw?.noaaTidesId, latitude, longitude);
    if ("reason" in picked) {
      return noTides(deviceOut, picked.reason, "No tide station is close enough to this pod to give its tides.");
    }
    const {
      station, km, chosen, note,
    } = picked;

    // A peak near either edge of the window still needs the high tide on its far side.
    const tides: TideEvent[] = await this.noaa.highsAndLows(
      station.id,
      startMs - 7 * HOUR_MS,
      endMs + 7 * HOUR_MS,
    );
    const inWindow = tides.filter((tide) => tide.atMs >= startMs && tide.atMs <= endMs);
    const listed = (endMs - startMs) / (24 * HOUR_MS) <= MAX_LISTED_DAYS;

    let comparison: Record<string, unknown> | undefined;
    if (metric) {
      const peaks = dailyPeaks([...samples], position.longitude);
      const timing = dailyCycle([...samples], position.longitude)?.timing;
      const compared = compareWithTides(peaks, tides, position.longitude, timing);
      comparison = compared
        ? { metric, daily_cycle_timing: timing ?? "unclear", ...compared }
        : {
          metric,
          verdict: "unclear",
          reason: `Fewer than ${MIN_TIDE_DAYS} full days of usable ${metric} readings in this `
            + "period, so its peaks cannot be told apart from the tide's.",
        };
    }

    return {
      device: deviceOut,
      station: {
        id: station.id,
        name: station.name,
        distance_km: Math.round(km * 10) / 10,
        chosen,
        ...(note ? { note } : {}),
      },
      window_actually_searched: window,
      local_solar_offset_hours: Math.round((position.longitude / 15) * 10) / 10,
      tide_count: inWindow.length,
      ...(listed
        ? {
          tides: inWindow.map((tide) => ({
            type: tide.type,
            at: new Date(tide.atMs).toISOString(),
            at_local_solar: localSolar(tide.atMs, position.longitude),
            level_m: tide.levelM,
          })),
        }
        : { tides_listed: false }),
      ...(comparison ? { comparison } : {}),
      source: SOURCE,
      [USER_NOTES_FIELD]: [
        `Tide times are NOAA predictions for ${station.name}, ${Math.round(km)} km from the pod.`,
      ],
    };
  }
}
