import type { DeviceChain } from "../devices/mergeChains";
import type { DeviceReading } from "../types/device.types";
import { currentSite, provenSiteStart, siteVisits } from "./currentSite";
import type { CurrentSite, SiteVisit } from "./currentSite";

export const SITE_CACHE_TTL_MS = 5 * 60_000;
export const SITE_CACHE_RETENTION_MS = 30 * 60_000;
export const SITE_CACHE_MAX_ENTRIES = 64;
export const SITE_CACHE_MAX_ROWS = 200_000;
export const SITE_RECENT_DAYS = 3;
export const DAY_MS = 24 * 60 * 60_000;

export interface SiteSnapshot {
  at: number;
  contextAt: number;
  lastReported?: string | null;
  /** Complete rows from a proven reset or from the epoch, never a guessed left boundary. */
  rows: DeviceReading[];
  fromMs: number;
  chain: DeviceChain;
  site: CurrentSite;
  visits: SiteVisit[];
}

export const snapshotSite = (
  rows: DeviceReading[],
  fromMs: number,
): { site: CurrentSite; visits: SiteVisit[] } => {
  const anchor = fromMs <= 0 ? 0 : provenSiteStart(rows);
  if (anchor === undefined) {
    return {
      visits: [],
      site: {
        readings: [],
        note: "Current site not assessed: available history "
      + "cannot establish a site boundary. Values were withheld rather than inferred from a window edge.",
        userNotes: [
          "Current site not assessed: the available history cannot show where this pod's current "
            + "site begins, so no values are given rather than guessed.",
        ],
      },
    };
  }
  const context = rows.filter((r) => {
    const time = Date.parse(r.observedAt ?? "");
    return !Number.isFinite(time) || time >= anchor;
  });
  const site = currentSite(context);
  const earlier = rows.length - context.length;
  if (earlier) {
    site.note = `${earlier} reading(s) from an earlier location were excluded. ${site.note ?? ""}`.trim();
    site.userNotes = [
      `${earlier} reading(s) from an earlier location were left out; only the pod's current site is covered.`,
      ...(site.userNotes ?? []),
    ];
  }
  return { site, visits: siteVisits(context) };
};
