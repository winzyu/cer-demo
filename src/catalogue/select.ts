import type { Severity, WaterBodyType } from "../report/types";
import type {
  Catalogue, CatalogueEntry, Referral, Trigger, WaterClass,
} from "./types";

/**
 * Which catalogue content may reach a customer, and which of it fits a given report finding.
 */

/**
 * v2 §0 rule 2 uses the marine signatures by default for coastal pods, so brackish and estuarine
 * water take the marine side; only freshwater reverses them (v2 §6.3).
 */
export const waterClassFor = (waterBodyType: WaterBodyType): WaterClass => (
  waterBodyType === "Freshwater" ? "freshwater" : "marine"
);

/**
 * Approved content, plus drafts when `includeDrafts` is set for supervisor review. A rejected
 * entry is never usable, and neither is an entry whose referral is not itself usable, so an
 * unconfirmed contact cannot reach a customer through an approved entry.
 */
export interface UsableGuidance {
  version: string;
  entries: CatalogueEntry[];
  referrals: Map<string, Referral>;
}

export const usableGuidance = (catalogue: Catalogue, includeDrafts: boolean): UsableGuidance => {
  const usable = (status: string): boolean => status === "approved" || (includeDrafts && status === "draft");
  const referrals = new Map(
    catalogue.referrals.filter((r) => usable(r.review.status)).map((r) => [r.id, r]),
  );
  const entries = catalogue.entries.filter((e) => usable(e.review.status)
    && (e.referral === undefined || referrals.has(e.referral)));
  return { version: catalogue.version, entries, referrals };
};

const SEVERITY_RANK: Readonly<Record<Severity, number>> = { Low: 0, Moderate: 1, High: 2 };

export interface Finding {
  trigger: Trigger;
  water: WaterClass;
  /** Absent for a bare threshold crossing, which has no classification to be confident in. */
  confidence?: number;
  severity?: Severity;
}

/** Entries that fit `finding`, in catalogue order. Chat-only entries (no triggers) never match. */
export const entriesFor = (entries: CatalogueEntry[], finding: Finding): CatalogueEntry[] => (
  entries.filter(({ appliesTo: a }) => {
    if (!a.triggers?.includes(finding.trigger)) return false;
    if (a.water && !a.water.includes(finding.water)) return false;
    if (a.minConfidence !== undefined && (finding.confidence ?? 0) < a.minConfidence) return false;
    if (a.minSeverity !== undefined
      && SEVERITY_RANK[finding.severity ?? "Low"] < SEVERITY_RANK[a.minSeverity]) return false;
    return true;
  })
);

/**
 * The entry's wording with its referral's contact line, if it has one. The contact ends the
 * string with no closing period, because it may end in a URL that a period would break.
 */
export const entryText = (entry: CatalogueEntry, guidance: UsableGuidance): string => {
  const referral = entry.referral ? guidance.referrals.get(entry.referral) : undefined;
  return referral?.contact ? `${entry.text} Contact: ${referral.contact}` : entry.text;
};
