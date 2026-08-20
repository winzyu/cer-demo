/**
 * Corpus metadata and the ◆G9 direct-feed slice.
 *
 * **The corpus is scoped to what the DataPod actually measures** — temperature, DO, ORP,
 * conductivity, pH, turbidity. Documents about pollutants the sensor cannot detect were removed
 * (see `documents/_excluded/`): EPA aquatic-life criteria (metals/pesticides), recreational water
 * criteria (pathogens), and nutrient criteria (N/P). They were not merely useless — the system
 * prompt already declares those topics out of scope, so retrieving them can only pull an answer
 * toward material the bot is supposed to refuse.
 */

export interface DocMeta {
  title: string;
  sourceUrl?: string;
}

export const DOC_META: Record<string, DocMeta> = {
  // --- Operator source of truth: the six measured parameters, their ranges, and how they move
  // together. Written for this deployment, so it outranks any general reference. ---
  "water-quality-metrics-source-of-truth.pdf": {
    title: "Water Quality Metrics — Source of Truth (DataPod)",
  },

  // --- Probe datasheets: specs, operating principle, calibration and fouling behavior.
  // These are what "does this reading mean the sensor is broken?" gets answered from. ---
  "EC_K_1.0_probe.pdf": {
    title: "Atlas Scientific Conductivity Probe K 1.0 — Datasheet",
  },
  "IORP_probe.pdf": {
    title: "Atlas Scientific Industrial ORP Probe — Datasheet",
  },
  "IpH_probe.pdf": {
    title: "Atlas Scientific Industrial pH Probe — Datasheet",
  },
  "Industrial-DO-probe.pdf": {
    title: "Atlas Scientific Industrial Dissolved Oxygen Probe — Datasheet",
  },

  // --- Field-methods references, retained for depth on measured metrics. ---
  "tm9a6.2.pdf": {
    title: "USGS TM 9-A6.2 — Dissolved Oxygen (field methods)",
  },
  // Not a turbidity chapter — A6.8 covers multiparameter sondes. (The turbidity chapter is
  // A6.7, which is not in this corpus.) The title is what the model cites, so a wrong one
  // makes citation-validity ungradeable in the N2 eval.
  "tm9a6.8.pdf": {
    title: "USGS TM 9-A6.8 — Use of Multiparameter Instruments for Routine Field Measurements",
  },
  "volunteer_stream_monitoring_a_methods_manual.pdf": {
    title: "Volunteer Stream Monitoring: A Methods Manual (EPA)",
  },
};

/**
 * ◆G9 — the direct-feed slice.
 *
 * Revised after the original slice proved unusable: it was 83% a pandoc grid table whose cells
 * were shredded across 8-character columns, covering pollutants this sensor cannot measure.
 *
 * The replacement is the operator's source-of-truth reference plus the four probe datasheets —
 * ~9.4K tokens, every one of them about a parameter the DataPod actually reads. Smaller than the
 * document it replaced, and it covers all six metrics rather than none of them.
 */
export const DIRECT_FEED_SLICE = [
  "water-quality-metrics-source-of-truth.pdf",
  "EC_K_1.0_probe.pdf",
  "IORP_probe.pdf",
  "IpH_probe.pdf",
  "Industrial-DO-probe.pdf",
];

/** `documents/README.md` is a manifest, not source material (MIGRATION_SPEC.md §10.1). */
export const EXCLUDED_FILES = ["README.md"];

export const INGESTIBLE_EXTENSIONS = [".pdf", ".md", ".txt"];

export const metaFor = (filename: string): DocMeta => DOC_META[filename] ?? { title: filename };
