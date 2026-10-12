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

/**
 * Entries that recommend inspecting the pod or ruling the instrument out first. v2 §9.2 recommends
 * inspection only when a data issue is likely, so the report shows these only then and the chat
 * prompt says so on each record, whatever the entries' own conditions say (POST_LAUNCH_BACKLOG.md
 * §1b, D2; whether the catalogue itself should carry this condition is STAKEHOLDER_QUESTIONS.md
 * item 26). `fault-first` joined after it turned a real daily pH dip into "an instrument problem"
 * (`migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md` §3 cause 2): its limitation says the report
 * runs no fault checks, but per-reading QC now runs them, and an exceedance passed them.
 */
export const DATA_ISSUE_ONLY_ENTRIES: ReadonlySet<string> = new Set(["inspect-sensors", "fault-first"]);

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
  /** The event window's length; absent for a bare threshold crossing. */
  durationHours?: number;
}

/** Entries that fit `finding`, in catalogue order. Chat-only entries (no triggers) never match. */
export const entriesFor = (entries: CatalogueEntry[], finding: Finding): CatalogueEntry[] => (
  entries.filter(({ appliesTo: a }) => {
    if (!a.triggers?.includes(finding.trigger)) return false;
    if (a.water && !a.water.includes(finding.water)) return false;
    if (a.minConfidence !== undefined && (finding.confidence ?? 0) < a.minConfidence) return false;
    const severe = a.minSeverity !== undefined
      && SEVERITY_RANK[finding.severity ?? "Low"] >= SEVERITY_RANK[a.minSeverity];
    const long = a.minDurationHours !== undefined
      && (finding.durationHours ?? 0) > a.minDurationHours;
    if (a.minSeverity === undefined && a.minDurationHours === undefined) return true;
    return severe || long;
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
