import type { EventType, Severity } from "../report/types";

/**
 * The guidance catalogue: every possible cause, next step and referral that chat and reports may
 * show a customer. `catalogue.json` is the single source; `docs/catalogue/review.html` and the
 * prompt block are rendered from it (`docs/SPECS.md` §4b).
 *
 * Nothing reaches a customer unless its `review.status` is `"approved"`, except in a deployment
 * that sets `CATALOGUE_DRAFTS=true` for supervisor review.
 */

export type ReviewStatus = "draft" | "approved" | "rejected";

export interface Review {
  status: ReviewStatus;
  /** Who approved or rejected it. Required once the status is not `"draft"`. */
  by?: string;
  /** ISO date of that decision. Required once the status is not `"draft"`. */
  date?: string;
  notes?: string;
}

/**
 * Coastal pods use the marine signatures, as v2 §0 rule 2 directs; only freshwater pods reverse
 * them. `waterClassFor` in `select.ts` maps the report's four water-body types onto these two.
 */
export type WaterClass = "marine" | "freshwater";

/**
 * What can select an entry in a report: a classified event type, or `"threshold-crossing"` for a
 * parameter flagged outside its configured threshold with no event attached.
 */
export type Trigger = EventType | "threshold-crossing";

/**
 * - `explanation` names a possible cause. A report names an event's cause only when one of these
 *   matches it.
 * - `limitation` says what the data cannot show; it travels with the explanation it qualifies.
 * - `next-step` is an action or a referral, placed in one report recommendation slot.
 */
export type EntryKind = "explanation" | "limitation" | "next-step";

/** The report template's three recommendation headings. */
export type RecommendationSlot = "operational" | "investigative" | "stakeholder";

export interface AppliesTo {
  /** Report triggers. Absent means the entry is for chat only. */
  triggers?: Trigger[];
  /** Absent means any water. */
  water?: WaterClass[];
  minConfidence?: number;
  minSeverity?: Severity;
  /** When the entry applies, in words the model and the reviewer both read. */
  conditions: string;
}

export interface CatalogueEntry {
  /** Stable kebab-case id; recorded in a message's audit trail, so never reused. */
  id: string;
  title: string;
  kind: EntryKind;
  /** Required for a `next-step` that a report can select. */
  slot?: RecommendationSlot;
  /** The approved customer-facing wording. */
  text: string;
  appliesTo: AppliesTo;
  requiredEvidence: string;
  limitations: string;
  /** A `Referral.id`. The entry is unusable while its referral is. */
  referral?: string;
  /** Keys of `Catalogue.sources`, each followed by a locator. */
  sources: string[];
  review: Review;
}

export interface Referral {
  id: string;
  /** Absent for the neutral referral, which names no third party. */
  provider?: string;
  service: string;
  contact?: string;
  review: Review;
}

export interface Catalogue {
  /** Bumped on every content change; recorded with each answer and report. */
  version: string;
  sources: Record<string, string>;
  referrals: Referral[];
  entries: CatalogueEntry[];
}
