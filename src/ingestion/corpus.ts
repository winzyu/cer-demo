/**
 * Corpus metadata and the ◆G9 direct-feed slice.
 *
 * **The corpus is scoped to what the DataPod actually measures** — temperature, DO, ORP,
 * conductivity, pH, turbidity. Documents about pollutants the sensor cannot detect were removed
 * (see `documents/_excluded/`): EPA aquatic-life criteria (metals/pesticides), recreational water
 * criteria (pathogens), and nutrient criteria (N/P). They were not merely useless — the system
 * prompt already declares those topics out of scope, so retrieving them can only pull an answer
 * toward material the bot is supposed to refuse.
 *
 * **Expanded 2026-08-21** from 8 documents to 18, on the way to a RAG-first retrieval posture.
 * The reference tier is now the *whole* USGS National Field Manual Chapter A6 — one chapter per
 * measured parameter rather than two chapters covering two of them — plus EPA numeric-criteria
 * and calibration material and a small situational tier for N6 event detection. The direct-feed
 * slice below is **deliberately unchanged**: the new mass is reachable only by a RAG arm, which
 * is what makes direct-feed a baseline rather than a candidate.
 */

export interface DocMeta {
  title: string;
  sourceUrl?: string;
}

export const DOC_META: Record<string, DocMeta> = {
  // === Tier 1 — company-specific. Operator-written or vendor datasheets for the probes this
  // deployment actually carries, so they outrank any general reference. This is the ◆G9 slice. ===

  "water-quality-metrics-source-of-truth.pdf": {
    title: "Water Quality Metrics — Source of Truth (DataPod)",
  },
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

  // === Tier 2 — USGS National Field Manual, Chapter A6 (field measurements). The authoritative
  // method reference: one chapter per parameter, each covering calibration, interferences,
  // troubleshooting and reporting conventions.
  //
  // **Every chapter here is the current edition, verified against the USGS publications API
  // 2026-08-21** (`pubs-services/publication/?q=tm9A6.x`), which records `SUPERSEDED_BY` links
  // explicitly. Six chapters have been reissued in the newer **Techniques and Methods (TM 9-A6.x)**
  // series; 6.5, 6.6 and 6.7 have not and their current TWRI Book 9 editions are used. The title
  // is what the model cites, so the edition named in the title has to match the file on disk —
  // a stale edition here is how a superseded calibration procedure gets quoted as current. ===

  "usgs-nfm-a6.0-field-measurement-guidelines.pdf": {
    title: "USGS TM 9-A6.0 — Guidelines for Field-Measured Water-Quality Properties (2023)",
    sourceUrl: "https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf",
  },
  "usgs-nfm-a6.1-temperature.pdf": {
    title: "USGS TM 9-A6.1 — Temperature (2024)",
    sourceUrl: "https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf",
  },
  "usgs-nfm-a6.2-dissolved-oxygen.pdf": {
    title: "USGS TM 9-A6.2 — Dissolved Oxygen (2020)",
    sourceUrl: "https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf",
  },
  "usgs-nfm-a6.3-specific-conductance.pdf": {
    title: "USGS TM 9-A6.3 — Specific Conductance (2019)",
    sourceUrl: "https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf",
  },
  "usgs-nfm-a6.4-ph.pdf": {
    title: "USGS TM 9-A6.4 — Measurement of pH (2021)",
    sourceUrl: "https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf",
  },
  "usgs-nfm-a6.5-orp.pdf": {
    title: "USGS NFM 6.5 — Reduction-Oxidation Potential, electrode method (version 1.2, 9/2005)",
    sourceUrl: "https://pubs.usgs.gov/twri/twri9a6/twri9a65/twri9a_6.5_v_1.2.pdf",
  },
  "usgs-nfm-a6.6-alkalinity.pdf": {
    title: "USGS NFM 6.6 — Alkalinity and Acid Neutralizing Capacity (version 4.0, 9/2012)",
    sourceUrl: "https://pubs.usgs.gov/twri/twri9a6/twri9a66/twri9a_6.6.pdf",
  },
  // **Version 2.1, not the 1998 original.** The 1998 edition does not contain the string "FNU"
  // anywhere; v2.1 introduces the NTU/FNU distinction this fleet's turbidity reading depends on
  // (white-light NTU vs infrared FNU — not interchangeable; see timeline.md's turbidity-unit row).
  "usgs-nfm-a6.7-turbidity.pdf": {
    title: "USGS NFM 6.7 — Turbidity (version 2.1, 9/2005)",
    sourceUrl: "https://pubs.usgs.gov/twri/twri9a6/twri9a67/twri9a_Section6.7_v2.1.pdf",
  },
  "usgs-nfm-a6.8-multiparameter-instruments.pdf": {
    title:
      "USGS TM 9-A6.8 — Use of Multiparameter Instruments for Routine Field Measurements "
      + "(version 1.1, 6/2025)",
    sourceUrl: "https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf",
  },

  // === Tier 3 — calibration procedure. Kept deliberately narrow: a document earns a place here
  // only if it carries a procedure or a number for one of the six measured parameters.
  //
  // **Cut 2026-08-24: `epa-wqs-handbook-ch3-water-quality-criteria.pdf`.** It was filed here as
  // the source of numeric thresholds and turned out to carry none — a scan of all 123,131 chars
  // found zero numeric criteria for DO, pH, turbidity, conductivity, temperature or ORP. It is
  // regulatory *process* (how criteria get recommended and adopted), not criteria. 9.8% of the
  // corpus competing for top-k slots with nothing to contribute. Moved to `documents/_excluded/`.
  // ===

  // Scanned images — ingest reads `.ocr_cache/` for this one. See `documents/README.md`.
  "epa-sop-field-instrument-calibration-2010.pdf": {
    title:
      "EPA SOP — Calibration of Field Instruments (Temperature, pH, DO, Conductivity, ORP, "
      + "Turbidity), January 2010",
    sourceUrl:
      "https://19january2017snapshot.epa.gov/sites/production/files/2015-06/documents/"
      + "EQASOP-FieldCalibrat.pdf",
  },

  // === Tier 4 — situational / pollution-event context. **Removed entirely 2026-08-24.**
  //
  // It held `epa-assessing-monitoring-floatable-debris.pdf` and
  // `noaa-nhabon-framework-workshop-report.pdf`, kept for event *interpretation* on the argument
  // that they explain what a DO/pH/turbidity signature tends to mean. Measured against the six
  // parameters they do not: 11 and 15 mentions respectively (0.8 and 1.1 per 10K chars, against
  // 44-109 for the documents that earn their place), and **zero numeric criteria** between them.
  // They were 22.3% of the corpus supplying retrieval noise — floatable-debris alone contributes
  // 87 hits on "storm", directly competing for slots in the stormwater-vs-intrusion question it
  // was supposed to help with. Moved to `documents/_excluded/`.
  //
  // This also settles the tension the tier was always in with the 2026-07-29 scoping rule: both
  // documents were about things the DataPod cannot measure. ◆G4's external-context question is
  // unaffected — it was never going to be answered by a workshop governance report. ===
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
 *
 * **Left alone by the 2026-08-21 corpus expansion, on purpose.** Direct-feed's cost is its slice
 * size, so growing the slice with the new reference tier would not make it a better arm — it
 * would make it a more expensive one and destroy the only fixed point the RAG arms are measured
 * against. Direct-feed keeps this slice as the **baseline** (replacing `stub` in that role);
 * everything added above is reachable only by a RAG arm.
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
