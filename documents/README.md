# Document corpus

The source documents `npm run ingest` parses into `data/corpus/corpus.json`.

> **This file is a pointer, not a manifest.** The authoritative list is `DOC_META` and
> `DIRECT_FEED_SLICE` in [`src/ingestion/corpus.ts`](../src/ingestion/corpus.ts) — it is code, it
> is what actually runs, and it cannot drift from the pipeline the way a hand-maintained list here
> did. Rewritten 2026-08-13; the previous version still described the pre-2026-07-29 corpus and
> told you to run `python -m backend.seed`, which has not existed since the stack conversion.

## Current corpus — 8 documents, ~716K chars, 305 chunks

The corpus is **scoped to the six parameters the DataPod measures**: temperature, dissolved
oxygen, ORP, conductivity, pH, turbidity.

| file | chars | chunks | in direct-feed slice |
|---|---:|---:|---|
| `water-quality-metrics-source-of-truth.pdf` | 11,564 | 5 | **yes** |
| `IpH_probe.pdf` | 7,451 | 3 | **yes** |
| `Industrial-DO-probe.pdf` | 7,433 | 3 | **yes** |
| `IORP_probe.pdf` | 6,440 | 3 | **yes** |
| `EC_K_1.0_probe.pdf` | 4,772 | 2 | **yes** |
| `tm9a6.2.pdf` | 153,946 | 55 | no |
| `tm9a6.8.pdf` | 57,387 | 33 | no |
| `volunteer_stream_monitoring_a_methods_manual.pdf` | 467,610 | 201 | no |

**The slice column is load-bearing.** The `firestore-direct` retrieval arm feeds only those five
documents (~9.4K tokens) to the model, whole, on every request — decision ◆G9 in
[`../docs/RETRIEVAL_BAKEOFF.md`](../docs/RETRIEVAL_BAKEOFF.md). The three long manuals are indexed
by the vector arms but are **out of reach for direct-feed by design**, which is the single
question class it loses and the whole case for keeping a RAG arm.

What each group provides:

- **`water-quality-metrics-source-of-truth.pdf`** — operator-written. All six parameters,
  per-water-type baseline ranges, a pollution-event signature matrix, and sensor data-quality
  caveats. The most important document in the corpus.
- **The four Atlas Scientific probe datasheets** — specs and operating principles for the EC, ORP,
  pH and DO probes. These are **ORP's only coverage anywhere in the corpus**.
- **`tm9a6.2.pdf`** — USGS Techniques and Methods 9–A6.2, *Dissolved Oxygen*. Field calibration
  procedure: air calibration, air-saturated-water calibration, zero-DO checks.
- **`tm9a6.8.pdf`** — USGS TM 9–A6.8 v1.1 (June 2025), *Use of Multiparameter Instruments for
  Routine Field Measurements*. Sonde stabilization tolerances, wait-time rules, turbidity optics.
- **`volunteer_stream_monitoring_a_methods_manual.pdf`** — EPA, 1997. Broad field-methods
  reference; the largest document by far.

## `_excluded/`

Documents deliberately removed from the corpus on 2026-07-29 because they cover analytes this
sensor **cannot detect** — metals, pesticides, pathogens, nutrients — plus two superseded DO
references. Kept rather than deleted so the decision stays auditable.

Two were worse than useless: the system prompt already refuses pathogen and non-measured-pollutant
questions, so retrieving them can only pull an answer toward material the bot must decline.
`aquatic-life-criteria-table.md` was additionally unusable — a pandoc grid table whose cells are
shredded across 8-character columns, unreadable by any arm.

Nothing in `_excluded/` is parsed by `npm run ingest`.

## Git and OCR

- **These files are large but most are tracked in git** despite the `documents/*` rule in
  `.gitignore` — they were committed before that rule was added, and gitignore does not untrack
  existing files. Do not assume a deleted PDF is gone; check `git status` first.
- **OCR is not performed at ingest.** If a scanned PDF averages under 50 chars/page the pipeline
  reuses a cached transcription at `.ocr_cache/<filename>.txt`; a missing cache is a hard error,
  never silent partial text. No document in the current corpus needs it.

## Changing the corpus

Adding or removing a file means editing `DOC_META` in `src/ingestion/corpus.ts`, then:

```bash
npm run ingest                 # rebuild data/corpus/corpus.json
npm run seed:firestore         # re-upload corpus_documents
npm run seed:firestore-chunks  # re-embed for firestore-vector (costs embedding tokens)
```

**A corpus change invalidates captured bake-off transcripts.** Every arm was measured against a
fixed corpus; changing it and re-grading old transcripts compares answers to material the model
never saw. Re-run the sweep instead.
