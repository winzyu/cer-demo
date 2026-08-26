import type { DeviceSummary } from "../types/device.types";

/**
 * Device continuity — reconstructing a site's history across Notecard replacements.
 *
 * When a buoy is damaged its Notecard is replaced, which mints a new device id. The registry
 * ties old to new with two fields (`docs/migration/BACKEND_FIELDS.md` §4):
 *
 * - `mergedInto: "dev:<label>"` on the **retired** device, pointing at its successor.
 * - `labels: ["dev:<self>", "dev:<older>", …]` on the **survivor**, self first.
 *
 * **The merge is registry metadata only — the rows never move.** Historical readings keep the
 * retired label forever, so a survivor holds as little as 3.9 % of its own site's record. A
 * two-year question answered off the survivor label alone returns a real statistic over six
 * weeks of data and says nothing about the other 94 %: a confident wrong answer, which is the
 * failure class this codebase treats as the dangerous one.
 *
 * Upstream shipped chain expansion in `src/utils/deviceLabels.ts` for seven query sites, but
 * **not** for `/water/period` — the only endpoint `query_sensor_data` reads
 * (`SECURITY_FINDINGS.md` §7). So the fan-out has to happen here.
 *
 * ## What this deliberately does not do
 *
 * Expansion is **narrowing-only and same-organization only**, and it is disclosed rather than
 * silent. Two reasons, both read from live data rather than assumed:
 *
 * - `/water/period` does not authorize its `device` parameter at all — the org filter sits in an
 *   `else` branch, so naming a label *replaces* org scoping rather than narrowing it
 *   (`SECURITY_FINDINGS.md` §1). A fan-out that named a label the caller cannot otherwise see
 *   would succeed, silently, at reading another organization's history.
 * - Three of the four live chains **cross organization boundaries** (`BACKEND_FIELDS.md` §5b).
 *   Whether inheriting a buoy inherits its data is the operator's call
 *   (`POD_AUTHORIZATION.md` §11 Q1), and the documented default until they answer is deny.
 *
 * So a predecessor is read only when it appears in the caller's own org-scoped `/devices`
 * response **and** carries the same `organization` string as the survivor. Everything else is
 * withheld and named, so a short history is never mistaken for a complete one.
 */

/**
 * Ceiling on labels in one expansion.
 *
 * Upstream's `deviceLabels.ts` documents the Firestore `in` cap as 30 (`findPeriodWaterData`
 * still slices at 10 — the mismatch is theirs, `SECURITY_FINDINGS.md` §7). We issue one request
 * per label rather than one `in` query, so the cap does not bind us; it is here as a bound on a
 * registry cycle or a pathological chain, the longest real one today being 3.
 */
export const MAX_CHAIN_LABELS = 30;

export interface WithheldLabel {
  label: string;
  /** Why it was not read. Shown to the model, and destined for the report's scope block. */
  reason: string;
}

export interface DeviceChain {
  /** Labels to query, survivor first. Always carries at least the survivor's own label. */
  labels: string[];
  /** Predecessors deliberately not read. */
  withheld: WithheldLabel[];
  /** Set when the *resolved* device is itself retired — it points at its successor. */
  mergedInto?: string;
}

const labelsOf = (device: DeviceSummary): string[] => {
  const value = device.raw.labels;
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry !== "")
    : [];
};

const mergedIntoOf = (device: DeviceSummary): string | undefined => {
  const value = device.raw.mergedInto;
  return typeof value === "string" && value !== "" ? value : undefined;
};

/**
 * Every label the registry ties to `survivor`, in registry order, excluding its own.
 *
 * Walks **backwards only** — a survivor's `labels[]`, plus any device whose `mergedInto` points
 * at one of them, transitively. It never follows a `mergedInto` *forward* from the starting
 * device: a question about a retired pod is a question about that pod's own span, and following
 * it to its successor would widen a read into a device the caller did not name.
 *
 * Both fields are consulted because they are maintained independently — 5 devices carry
 * `mergedInto` and only 4 carry `labels` — so a chain recorded on one side but not the other
 * still resolves. `seen` also makes a registry cycle terminate.
 */
const predecessorsOf = (survivor: DeviceSummary, visible: DeviceSummary[]): string[] => {
  const seen = new Set<string>([survivor.label ?? ""]);
  const found: string[] = [];
  const queue: DeviceSummary[] = [survivor];

  while (queue.length > 0 && found.length < MAX_CHAIN_LABELS) {
    const current = queue.shift() as DeviceSummary;
    const candidates = [
      ...labelsOf(current),
      ...visible
        .filter((device) => mergedIntoOf(device) === current.label && device.label)
        .map((device) => device.label as string),
    ];

    candidates.forEach((label) => {
      if (seen.has(label)) {
        return;
      }
      seen.add(label);
      found.push(label);
      const row = visible.find((device) => device.label === label);
      if (row) {
        queue.push(row);
      }
    });
  }

  return found.slice(0, MAX_CHAIN_LABELS - 1);
};

/**
 * The labels a query about `device` should actually read, plus the ones it must not.
 *
 * `visible` is the caller's **own** `/devices` response — org-scoped by the backend, and
 * therefore the only trustworthy statement of what this caller may see. Intersecting against it
 * is what keeps expansion narrowing-only (`SECURITY_FINDINGS.md` §4.2).
 */
export const resolveChain = (
  device: DeviceSummary,
  visible: DeviceSummary[],
): DeviceChain => {
  const self = device.label;
  if (typeof self !== "string" || self === "") {
    return { labels: [], withheld: [] };
  }

  const merged = mergedIntoOf(device);
  const chain: DeviceChain = {
    labels: [self],
    withheld: [],
    ...(merged ? { mergedInto: merged } : {}),
  };

  // The organization is compared as an opaque string and never resolved through the
  // `organizations` collection: two live devices point at organizations that do not exist, and a
  // lookup either throws or silently returns nothing (`POD_AUTHORIZATION.md` §7). A survivor with
  // no organization of its own therefore inherits nothing — the empty set, never a wildcard.
  const org = device.organization;

  predecessorsOf(device, visible).forEach((label) => {
    const row = visible.find((candidate) => candidate.label === label);
    if (!row) {
      chain.withheld.push({ label, reason: "not visible to this account" });
      return;
    }
    if (!org || row.organization !== org) {
      chain.withheld.push({
        label,
        reason: "different organization — history not transferred",
      });
      return;
    }
    chain.labels.push(label);
  });

  return chain;
};

/**
 * Concatenates per-label batches, dropping rows a later label repeats from an earlier one.
 *
 * Chains overlap: New Trinidad ran 2024-07-04→2026-04-21 while Trinidad Island ran
 * 2024-03-01→2024-12-16, a five-month window in which both labels reported
 * (`BACKEND_FIELDS.md` §4a). Concatenating naively double-counts every sample in that window,
 * which silently reweights every mean computed over it.
 *
 * De-duplication is **across** labels, never within one: a row is dropped only when an *earlier*
 * label already reported that instant. So the first batch — the survivor's own series — comes
 * through byte-identical to an unexpanded query, and expansion can only add history rather than
 * disturb the part that was already right.
 */
export const mergeByTimestamp = <T extends { timestamp?: number }>(batches: T[][]): T[] => {
  const seen = new Set<number>();
  return batches.flatMap((batch) => {
    const kept = batch.filter((row) => row.timestamp === undefined || !seen.has(row.timestamp));
    batch.forEach((row) => {
      if (row.timestamp !== undefined) {
        seen.add(row.timestamp);
      }
    });
    return kept;
  });
};
