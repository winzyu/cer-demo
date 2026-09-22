import { config } from "../config";
import rawCatalogue from "./catalogue.json";
import { parseCatalogue } from "./parseCatalogue";
import { usableGuidance } from "./select";

export { parseCatalogue } from "./parseCatalogue";
export {
  entriesFor, entryText, usableGuidance, waterClassFor,
} from "./select";
export type { Finding, UsableGuidance } from "./select";
export { buildCatalogueBlock } from "./promptBlock";
export type * from "./types";

/**
 * The catalogue as shipped, validated at import: a malformed edit fails the boot rather than a
 * customer's report.
 */
export const catalogue = parseCatalogue(rawCatalogue);

/** What this deployment may show customers (`CATALOGUE_DRAFTS`). */
export const guidance = usableGuidance(catalogue, config.catalogue.includeDrafts);
