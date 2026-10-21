import { DATA_ISSUE_ONLY_ENTRIES, entryText } from "./select";
import type { UsableGuidance } from "./select";

/**
 * The chat prompt's view of the catalogue: rules first, then one compact record per usable entry.
 *
 * Carried in the system prompt rather than retrieved, so every entry is grounded by construction
 * (`docs/records/RESPONSIBILITY.md`, "Decided 2026-09-09") and the text is identical on every
 * request, which keeps the cached prefix intact. With no usable entries the block still appears,
 * because "nothing is approved" is itself a rule the model has to follow.
 */

const RULES = `- Possible causes, next steps, services and contacts may come ONLY from the
  entries below. Never suggest a cause, action, product, service or contact that
  is not listed here, and never invent contact details.
- Offer an entry only when the evidence it requires is present in a tool result
  or in a fact the user gave about the site. A cause the user suggests is not
  evidence for an entry. Otherwise describe what was observed and what the
  sensors cannot determine.
- When no entry fits a pattern, describe it as a real measurement and say what the
  sensors cannot determine. That no entry explains it is not a sign of a fault.
- An entry with "Offer only when" may be offered only then, whatever its other
  conditions say.
- Keep an entry's meaning. You may shorten it, but never make it stronger or more
  certain, and include its limitation when you use it.
- Offer a referral only through its entry, and only when that entry applies.
  Never add a referral as a default closing line.
- A question that an entry below answers is in scope.
- Entries are not CONTEXT excerpts: do not put a citation marker on them.`;

const NO_ENTRIES_RULES = `- No guidance is approved yet. Do not suggest possible causes, corrective
  actions, services or contacts. Describe what was observed and what the sensors
  cannot determine.`;

/**
 * The tools already run the instrument checks these entries describe; an out-of-range verdict
 * passed them. See `DATA_ISSUE_ONLY_ENTRIES`.
 */
const DATA_ISSUE_ONLY_LINE = "  Offer only when: a tool reports a \"likely data issue\", a \"board_fault\", a "
  + "failed sensor, or device-flagged or implausible readings; never for an out-of-range verdict "
  + "or an unusual pattern alone.";

export const buildCatalogueBlock = (guidance: UsableGuidance): string => {
  const header = `APPROVED GUIDANCE (catalogue ${guidance.version}):`;
  if (guidance.entries.length === 0) {
    return `${header}\n${NO_ENTRIES_RULES}`;
  }
  const records = guidance.entries.map((entry) => [
    `[${entry.id}] ${entry.kind}`,
    `  Applies when: ${entry.appliesTo.conditions}`,
    ...(DATA_ISSUE_ONLY_ENTRIES.has(entry.id) ? [DATA_ISSUE_ONLY_LINE] : []),
    `  Requires: ${entry.requiredEvidence}`,
    `  Text: ${entryText(entry, guidance)}`,
    `  Limitation: ${entry.limitations}`,
  ].join("\n"));
  return `${header}\n${RULES}\n\n${records.join("\n\n")}`;
};
