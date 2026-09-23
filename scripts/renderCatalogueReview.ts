/**
 * Writes the supervisor's review page for the guidance catalogue.
 *
 *   npm run catalogue:review
 *
 * Regenerate after every change to `src/catalogue/catalogue.json`; the page is generated and
 * never edited by hand. Offline: no network, no credentials.
 */

import fs from "fs";
import path from "path";
import { catalogue } from "../src/catalogue";
import { renderReviewPage } from "../src/catalogue/reviewPage";

const out = path.join(process.cwd(), "docs", "catalogue", "review.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, renderReviewPage(catalogue));
process.stdout.write(`Wrote ${path.relative(process.cwd(), out)} (catalogue ${catalogue.version}, ${catalogue.entries.length} entries)\n`);
