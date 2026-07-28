/**
 * Corpus metadata and the ◆G9 direct-feed slice.
 *
 * Titles and source URLs are the legacy `DOC_META` map (`MIGRATION_SPEC.md` §5.1 step 5).
 * Unknown filenames fall back to `title = filename`, `sourceUrl = undefined`.
 */

export interface DocMeta {
  title: string;
  sourceUrl?: string;
}

export const DOC_META: Record<string, DocMeta> = {
  "aquatic-life-criteria-table.md": {
    title: "National Recommended Aquatic Life Criteria Table",
    sourceUrl: "https://www.epa.gov/wqc/national-recommended-water-quality-criteria-aquatic-life-criteria-table",
  },
  "Dissolved Oxygen and Water _ U.S. Geological Survey.pdf": {
    title: "Dissolved Oxygen and Water (USGS)",
    sourceUrl: "https://www.usgs.gov/special-topics/water-science-school/science/dissolved-oxygen-and-water",
  },
  "nutrient-lakes-reservoirs-factsheet-final.pdf": {
    title: "Nutrient Criteria for Lakes and Reservoirs — Factsheet",
  },
  "nutrient-lakes-reservoirs-report-final.pdf": {
    title: "Nutrient Criteria for Lakes and Reservoirs — Report",
  },
  "ambient-wqc-dissolved-oxygen-1986.pdf": {
    title: "Ambient Water Quality Criteria for Dissolved Oxygen (1986)",
  },
  "rwqc2012.pdf": { title: "Recreational Water Quality Criteria (2012)" },
  "tm9a6.2.pdf": { title: "USGS TM 9-A6.2 — Dissolved Oxygen" },
  "tm9a6.8.pdf": { title: "USGS TM 9-A6.8 — Turbidity" },
  "volunteer_stream_monitoring_a_methods_manual.pdf": {
    title: "Volunteer Stream Monitoring: A Methods Manual",
  },
};

/**
 * ◆G9 — the direct-feed slice: the small tier, ~21K tokens total.
 *
 * These three carry the authoritative thresholds most questions actually need, and together fit
 * comfortably in context with room for an answer. The long manuals are deliberately excluded —
 * questions that need them are expected to fail on the direct-feed arm, and measuring that gap
 * is part of the experiment (docs/RETRIEVAL_BAKEOFF.md ◆G9).
 */
export const DIRECT_FEED_SLICE = [
  "aquatic-life-criteria-table.md",
  "Dissolved Oxygen and Water _ U.S. Geological Survey.pdf",
  "nutrient-lakes-reservoirs-factsheet-final.pdf",
];

/** `documents/README.md` is a manifest, not source material (MIGRATION_SPEC.md §10.1). */
export const EXCLUDED_FILES = ["README.md"];

export const INGESTIBLE_EXTENSIONS = [".pdf", ".md", ".txt"];

export const metaFor = (filename: string): DocMeta => DOC_META[filename] ?? { title: filename };
