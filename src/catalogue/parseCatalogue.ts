import type {
  AppliesTo, Catalogue, CatalogueEntry, EntryKind, RecommendationSlot, Referral, Review,
  ReviewStatus, Trigger, WaterClass,
} from "./types";

/**
 * Validates `catalogue.json` by hand, like the config loader (conventions §8: no schema library).
 *
 * Errors are collected and thrown once, so an editor sees every problem in one run. The checks
 * go beyond shape: a referral id must exist, a report-selectable next step must name its slot,
 * and an approval must say who and when, because the audit trail records entry ids and the
 * review page is the only record of that decision.
 */

const TRIGGERS: readonly Trigger[] = [
  "Sewage", "Algal bloom", "Stormwater", "Industrial", "Thermal", "Saltwater intrusion",
  "Acidic input", "Hypoxia", "Inconclusive", "threshold-crossing",
];
const KINDS: readonly EntryKind[] = ["explanation", "limitation", "next-step"];
const SLOTS: readonly RecommendationSlot[] = ["operational", "investigative", "stakeholder"];
const WATER: readonly WaterClass[] = ["marine", "freshwater"];
const STATUSES: readonly ReviewStatus[] = ["draft", "approved", "rejected"];
const SEVERITIES = ["Low", "Moderate", "High"] as const;
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const isText = (value: unknown): value is string => (
  typeof value === "string" && value.trim() !== ""
);

class Collector {
  readonly errors: string[] = [];

  text(where: string, value: unknown): string {
    if (!isText(value)) {
      this.errors.push(`${where} must be a non-empty string`);
      return "";
    }
    return value;
  }

  optionalText(where: string, value: unknown): string | undefined {
    return value === undefined ? undefined : this.text(where, value);
  }

  oneOf<T extends string>(where: string, value: unknown, allowed: readonly T[]): T {
    if (!allowed.includes(value as T)) {
      this.errors.push(`${where} must be one of [${allowed.join(", ")}]`);
    }
    return value as T;
  }

  list<T>(where: string, value: unknown, item: (entry: unknown, at: string) => T): T[] {
    if (!Array.isArray(value) || value.length === 0) {
      this.errors.push(`${where} must be a non-empty array`);
      return [];
    }
    return value.map((entry, index) => item(entry, `${where}[${index}]`));
  }

  object(where: string, value: unknown): Json {
    if (!isObject(value)) {
      this.errors.push(`${where} must be an object`);
      return {};
    }
    return value;
  }
}

const parseReview = (c: Collector, where: string, value: unknown): Review => {
  const raw = c.object(where, value);
  const status = c.oneOf(`${where}.status`, raw.status, STATUSES);
  const by = c.optionalText(`${where}.by`, raw.by);
  const date = c.optionalText(`${where}.date`, raw.date);
  if (status !== "draft" && (!by || !date)) {
    c.errors.push(`${where} is ${status} and must record "by" and "date"`);
  }
  if (date && !ISO_DATE.test(date)) {
    c.errors.push(`${where}.date must be YYYY-MM-DD`);
  }
  return {
    status,
    ...(by ? { by } : {}),
    ...(date ? { date } : {}),
    ...(raw.notes !== undefined ? { notes: c.text(`${where}.notes`, raw.notes) } : {}),
  };
};

const parseId = (c: Collector, where: string, value: unknown, seen: Set<string>): string => {
  const id = c.text(where, value);
  if (id && !ID_PATTERN.test(id)) {
    c.errors.push(`${where} "${id}" must be kebab-case`);
  }
  if (seen.has(id)) {
    c.errors.push(`${where} "${id}" is not unique`);
  }
  seen.add(id);
  return id;
};

const parseReferral = (
  c: Collector,
  where: string,
  value: unknown,
  seen: Set<string>,
): Referral => {
  const raw = c.object(where, value);
  const provider = c.optionalText(`${where}.provider`, raw.provider);
  const contact = c.optionalText(`${where}.contact`, raw.contact);
  return {
    id: parseId(c, `${where}.id`, raw.id, seen),
    ...(provider ? { provider } : {}),
    service: c.text(`${where}.service`, raw.service),
    ...(contact ? { contact } : {}),
    review: parseReview(c, `${where}.review`, raw.review),
  };
};

const parseAppliesTo = (c: Collector, where: string, value: unknown): AppliesTo => {
  const raw = c.object(where, value);
  const applies: AppliesTo = { conditions: c.text(`${where}.conditions`, raw.conditions) };
  if (raw.triggers !== undefined) {
    applies.triggers = c.list(`${where}.triggers`, raw.triggers, (t, at) => c.oneOf(at, t, TRIGGERS));
  }
  if (raw.water !== undefined) {
    applies.water = c.list(`${where}.water`, raw.water, (w, at) => c.oneOf(at, w, WATER));
  }
  if (raw.minConfidence !== undefined) {
    const confidence = raw.minConfidence;
    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
      c.errors.push(`${where}.minConfidence must be a number from 0 to 1`);
    } else {
      applies.minConfidence = confidence;
    }
  }
  if (raw.minSeverity !== undefined) {
    applies.minSeverity = c.oneOf(`${where}.minSeverity`, raw.minSeverity, SEVERITIES);
  }
  return applies;
};

const parseEntry = (
  c: Collector,
  where: string,
  value: unknown,
  seen: Set<string>,
  context: { referralIds: Set<string>; sourceKeys: Set<string> },
): CatalogueEntry => {
  const raw = c.object(where, value);
  const id = parseId(c, `${where}.id`, raw.id, seen);
  const kind = c.oneOf(`${where}.kind`, raw.kind, KINDS);
  const appliesTo = parseAppliesTo(c, `${where}.appliesTo`, raw.appliesTo);
  const reportable = appliesTo.triggers !== undefined;

  let slot: RecommendationSlot | undefined;
  if (raw.slot !== undefined) {
    slot = c.oneOf(`${where}.slot`, raw.slot, SLOTS);
    if (kind !== "next-step" || !reportable) {
      c.errors.push(`${where}.slot is only allowed on a next-step with triggers`);
    }
  } else if (kind === "next-step" && reportable) {
    c.errors.push(`${where} is a next-step with triggers and must name its report slot`);
  }
  // A cause is named per event, so an explanation keyed only to a bare threshold crossing
  // would have no event to explain.
  if (kind === "explanation" && appliesTo.triggers?.includes("threshold-crossing")) {
    c.errors.push(`${where} is an explanation and cannot use the threshold-crossing trigger`);
  }

  let referral: string | undefined;
  if (raw.referral !== undefined) {
    referral = c.text(`${where}.referral`, raw.referral);
    if (!context.referralIds.has(referral)) {
      c.errors.push(`${where}.referral "${referral}" is not a known referral id`);
    }
  }

  const sources = c.list(`${where}.sources`, raw.sources, (s, at) => {
    const source = c.text(at, s);
    const key = source.split(" ")[0];
    if (source && !context.sourceKeys.has(key)) {
      c.errors.push(`${at} must start with a key of "sources"`);
    }
    return source;
  });

  return {
    id,
    title: c.text(`${where}.title`, raw.title),
    kind,
    ...(slot ? { slot } : {}),
    text: c.text(`${where}.text`, raw.text),
    appliesTo,
    requiredEvidence: c.text(`${where}.requiredEvidence`, raw.requiredEvidence),
    limitations: c.text(`${where}.limitations`, raw.limitations),
    ...(referral ? { referral } : {}),
    sources,
    review: parseReview(c, `${where}.review`, raw.review),
  };
};

export const parseCatalogue = (value: unknown): Catalogue => {
  const c = new Collector();
  const raw = c.object("catalogue", value);
  const version = c.text("catalogue.version", raw.version);

  const sourcesRaw = c.object("catalogue.sources", raw.sources);
  const sources = Object.fromEntries(
    Object.entries(sourcesRaw).map(([key, text]) => [key, c.text(`catalogue.sources.${key}`, text)]),
  );

  const referralIds = new Set<string>();
  const referrals = c.list(
    "catalogue.referrals",
    raw.referrals,
    (r, at) => parseReferral(c, at, r, referralIds),
  );

  const entryIds = new Set<string>();
  const context = { referralIds, sourceKeys: new Set(Object.keys(sources)) };
  const entries = c.list(
    "catalogue.entries",
    raw.entries,
    (e, at) => parseEntry(c, at, e, entryIds, context),
  );

  if (c.errors.length > 0) {
    throw new Error(`Invalid guidance catalogue:\n  - ${c.errors.join("\n  - ")}`);
  }
  return {
    version, sources, referrals, entries,
  };
};
