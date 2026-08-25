import { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { DeviceApiClient } from "../devices/DeviceApiClient";
import { dedupeByLabel } from "../tools/querySensorData";
import { callerToken } from "../utils/bearerToken";
import { resolveErrorCode } from "../utils/errors";
import { createLogger } from "../utils/logger";
import type {
  DeviceListEntry,
  DeviceListResponse,
  DeviceSummary,
} from "../types/device.types";

const log = createLogger("Devices");

const nameOf = (device: DeviceSummary): string => device.name ?? device.label ?? "";

/**
 * Stable ordering for the dropdown: by display name, then by label.
 *
 * The registry returns rows in no particular order, and the label tie-break matters because six
 * rows carry no name at all (`DEVICE_API.md` §2) — name alone would leave them free to reshuffle
 * between loads, which in a picker looks like the fleet changed.
 */
const byName = (a: DeviceSummary, b: DeviceSummary): number => (
  nameOf(a).localeCompare(nameOf(b), "en") || (a.label ?? "").localeCompare(b.label ?? "", "en")
);

/**
 * Injectable for tests; production builds one client per request around the caller's token.
 *
 * `token` is required, not optional. `requireCallerToken` guarantees the route cannot be reached
 * without one, and a signature that still accepted `undefined` would leave the old
 * fall-back-to-the-deployment-credential shape one careless call away from returning.
 */
export type DeviceClientFactory = (token: string) => DeviceApiClient;

/**
 * `GET /api/v1/devices` — the pod list the picker is built on.
 *
 * **Not gated on `SENSOR_TOOL`.** That flag decides whether the *model* is offered
 * `query_sensor_data`; listing pods so a human can choose one is a different question, and
 * gating it would make the picker vanish on the default configuration where it is most needed.
 *
 * **Read-only, and org-scoped by the caller's token.** The backend filters `/devices` to the
 * token holder's organization, so the honest failure mode is an empty list — which is why an
 * unconfigured deployment returns a coded 503 instead: an empty `devices` array must mean "this
 * token sees no pods", never "nobody wired up `DEVICE_API_BASE_URL`".
 *
 * **A caller token is mandatory** (`requireCallerToken`, mounted in `deviceRoutes.ts`). That
 * sentence above used to be true only when a caller happened to send one: `DeviceApiClient`
 * defaulted to `DEVICE_API_TOKEN`, so an anonymous request was answered out of the deployment's
 * own — in practice superadmin — fleet, which is every organization's. The client no longer has
 * that default and the route no longer accepts an anonymous request; both halves are needed,
 * because either one alone leaves a way back to the old behavior.
 */
export class DeviceController {
  private readonly createClient: DeviceClientFactory;

  constructor(createClient: DeviceClientFactory = (token) => new DeviceApiClient({ token })) {
    this.createClient = createClient;
  }

  listDevices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Non-null by construction: `requireCallerToken` refuses the request before it reaches
      // here. Re-derived rather than read off `req` so there is exactly one parser for the
      // header (`bearerToken.ts`) and the gate and the client cannot disagree about it.
      const token = callerToken(req) as string;

      // Constructed per request, not once at boot: the client is bound to the caller's token,
      // and an unconfigured base URL has to surface as this request's coded 503 rather than as
      // a crash on startup that also takes /health down.
      const client = this.createClient(token);

      // `dedupeByLabel` collapses the three Algalita Pod rows (`DEVICE_API.md` §2) and drops
      // rows with no label — a label is the only identifier `/water/*` accepts, so a row
      // without one is not selectable and has nothing to offer a picker.
      const devices = dedupeByLabel(await client.listDevices()).sort(byName);

      const entries = await Promise.all(
        devices.map((device) => this.toEntry(client, device)),
      );

      // Typed on the way out: the frontend is written against this exact shape, so a stray
      // extra field or a renamed one should fail the build rather than the pod picker.
      const body: DeviceListResponse = { devices: entries, water_type: config.waterType };
      res.status(200).json(body);
    } catch (error) {
      // Express 4 does not forward async rejections; without this the coded device errors
      // would hang the request instead of reaching the terminal handler.
      next(error);
    }
  };

  /**
   * One pod, plus the timestamp of its newest reading.
   *
   * The registry row carries no recency at all, so this costs one `/water/last` call per pod.
   * They run concurrently because the list is small after deduping and the picker is useless
   * until all of them are in.
   */
  private toEntry = async (
    client: DeviceApiClient,
    device: DeviceSummary,
  ): Promise<DeviceListEntry> => {
    // Non-null by construction: `dedupeByLabel` keeps only rows that carry a label.
    const label = device.label as string;
    return {
      label,
      name: device.name ?? label,
      operating_environment: device.operatingEnvironment ?? null,
      last_reported: await this.lastReportedFor(client, label),
    };
  };

  private lastReportedFor = async (
    client: DeviceApiClient,
    label: string,
  ): Promise<string | null> => {
    try {
      const reading = await client.getLastReading(label);
      return reading?.observedAt ?? null;
    } catch (error) {
      // A coded failure is about the *upstream*, not about this pod: reporting a timeout or an
      // expired token as `last_reported: null` would say "this pod has never reported", which
      // is a fabrication. Those propagate. Anything uncoded — a 403 or 404 on one device's
      // readings — is specific to that device and degrades to null so one odd row cannot take
      // the whole picker down.
      if (resolveErrorCode(error) !== undefined) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`No last reading for ${label}: ${message}`);
      return null;
    }
  };
}
