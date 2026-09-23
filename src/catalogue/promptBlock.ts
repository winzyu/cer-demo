import { entryText } from "./select";
import type { UsableGuidance } from "./select";

/**
 * The chat prompt's view of the catalogue: rules first, then one compact record per usable entry.
 *
 * Carried in the system prompt rather than retrieved, so every entry is grounded by construction
 * (`docs/RESPONSIBILITY.md`, "Decided 2026-09-09") and the text is identical on every request,
 * which keeps the cached prefix intact. With no usable entries the block still appears, because
 * "nothing is approved" is itself a rule the model has to follow.
 */

const RULES = `- Possible causes, next steps, services and contacts may come ONLY from the
  entries below. Never suggest a cause, action, product, service or contact that
  is not listed here, and never invent contact details.
- Offer an entry only when the evidence it requires is present in a tool result
  or in what the user told you. Otherwise describe what was observed and what the
  sensors cannot determine.
- Keep an entry's meaning. You may shorten it, but never make it stronger or more
  certain, and include its limitation when you use it.
- Offer a referral only through its entry, and only when that entry applies.
  Never add a referral as a default closing line.
- A question that an entry below answers is in scope.
- Entries are not CONTEXT excerpts: do not put a citation marker on them.`;

const NO_ENTRIES_RULES = `- No guidance is approved yet. Do not suggest possible causes, corrective
  actions, services or contacts. Describe what was observed and what the sensors
  cannot determine.`;

export const buildCatalogueBlock = (guidance: UsableGuidance): string => {
  const header = `APPROVED GUIDANCE (catalogue ${guidance.version}):`;
  if (guidance.entries.length === 0) {
    return `${header}\n${NO_ENTRIES_RULES}`;
  }
  const records = guidance.entries.map((entry) => [
    `[${entry.id}] ${entry.kind}`,
    `  Applies when: ${entry.appliesTo.conditions}`,
    `  Requires: ${entry.requiredEvidence}`,
    `  Text: ${entryText(entry, guidance)}`,
    `  Limitation: ${entry.limitations}`,
  ].join("\n"));
  return `${header}\n${RULES}\n\n${records.join("\n\n")}`;
};
