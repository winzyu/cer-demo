# Document corpus

The source documents `npm run ingest` parses into `data/corpus/corpus.json`.

> **This file is a pointer, not a manifest.** The authoritative list is `DOC_META` and
> `DIRECT_FEED_SLICE` in [`src/ingestion/corpus.ts`](../src/ingestion/corpus.ts) — it is code, it
> is what actually runs, and it cannot drift from the pipeline the way a hand-maintained list here
> did. Rewritten 2026-08-13; expanded 2026-08-21 (below).

## The five Tier 1 files are present and tracked

`documents/*` is git-ignored, but the five Tier 1 PDFs are **tracked anyway** — `git add -f`
overrides the rule, and `git ls-files documents/` lists them:

```
water-quality-metrics-source-of-truth.pdf
EC_K_1.0_probe.pdf
IORP_probe.pdf
IpH_probe.pdf
Industrial-DO-probe.pdf
```

They are tracked because those five **are** the ◆G9 direct-feed slice, and the failure when they
are absent is silent: `npm run ingest` still **exits 0** and prints `direct-feed slice: 0 chars`,
and the `firestore-direct` arm then answers every question ungrounded — it warns at load, but only
once, into the server log. **Check the `direct-feed slice:` line ingest prints** before trusting a
run. Everything else in `documents/` is untracked and does not survive a fresh clone.

## Current corpus — 18 documents, ~1.25M chars, 558 chunks

Expanded 2026-08-21 from 8 documents (~716K chars) as the retrieval posture moves toward
RAG-first. The corpus is still **scoped to the six parameters the DataPod measures** —
temperature, dissolved oxygen, ORP, conductivity, pH, turbidity — but the reference tier now
carries one authoritative chapter per parameter instead of two chapters covering two of them.

Every row below was measured by the 2026-08-21 ingest run and matches `data/corpus/corpus.json`.

### Tier 1 — company-specific ⟵ the direct-feed slice

| file | chars | chunks | in slice |
|---|---:|---:|---|
| `water-quality-metrics-source-of-truth.pdf` | 11,564 | 5 | **yes** |
| `IpH_probe.pdf` | 7,451 | 3 | **yes** |
| `Industrial-DO-probe.pdf` | 7,433 | 3 | **yes** |
| `IORP_probe.pdf` | 6,440 | 3 | **yes** |
| `EC_K_1.0_probe.pdf` | 4,772 | 2 | **yes** |

Operator-written and vendor material for the probes this deployment actually carries, so it
outranks any general reference. The probe datasheets are **ORP's only vendor-level coverage**.

**Still missing from Tier 1** (operator has not supplied them): a **turbidity probe datasheet**
and a **temperature probe datasheet**. Turbidity is the gap that matters — the fleet's NTU value
is derived from a raw voltage by a provisional, uncalibrated conversion
([`../docs/migration/DEVICE_API.md`](../docs/migration/DEVICE_API.md) §8), and no document in the
corpus describes *this* sensor's optics.

### Tier 2 — USGS National Field Manual, Chapter A6

| file | chars | chunks | edition |
|---|---:|---:|---|
| `usgs-nfm-a6.0-field-measurement-guidelines.pdf` | 87,076 | 44 | TM 9-A6.0 (2023) |
| `usgs-nfm-a6.1-temperature.pdf` | 69,557 | 38 | TM 9-A6.1 (2024) |
| `usgs-nfm-a6.2-dissolved-oxygen.pdf` | 153,946 | 55 | TM 9-A6.2 (2020) |
| `usgs-nfm-a6.3-specific-conductance.pdf` | 74,010 | 42 | TM 9-A6.3 (2019) |
| `usgs-nfm-a6.4-ph.pdf` | 95,663 | 53 | TM 9-A6.4 (2021) |
| `usgs-nfm-a6.5-orp.pdf` | 40,301 | 17 | TWRI v1.2 (2005) |
| `usgs-nfm-a6.6-alkalinity.pdf` | 92,439 | 36 | TWRI v4.0 (2012) |
| `usgs-nfm-a6.7-turbidity.pdf` | 109,601 | 49 | TWRI v2.1 (2005) |
| `usgs-nfm-a6.8-multiparameter-instruments.pdf` | 57,387 | 33 | TM 9-A6.8 v1.1 (2025) |

One chapter per measured parameter, each covering calibration, interferences, troubleshooting and
reporting conventions. This is the tier that answers "what does the procedure actually say".

**Every chapter is the current edition, verified 2026-08-21** against the USGS publications API
(`pubs.usgs.gov/pubs-services/publication/?q=tm9A6.x`), which records `SUPERSEDED_BY` links
explicitly. That check was not ceremony — **five of the nine chapter links in circulation point at
superseded editions**, and USGS keeps the old PDFs served at their original URLs, so a stale link
returns 200 and looks fine:

| chapter | superseded link still live | current edition used here |
|---|---|---|
| 6.0 | `twri9a6_Chapter6.0v2.pdf` (2008) | TM 9-A6.0 (2023) |
| 6.1 | `twri9a6_6.1_ver2.pdf` (2006) | TM 9-A6.1 (2024) |
| 6.2 | `twri9a6_6.2_ver3.pdf` (2006) | TM 9-A6.2 (2020) |
| 6.4 | `twri9a_Section6.4.pdf` (1998/2008) | TM 9-A6.4 (2021) |
| 6.7 | `twri9a_Section6.7.pdf` (1998) | TWRI v2.1 (2005) |
| 6.8 | `twri9a6_6.8.pdf` (2007) | TM 9-A6.8 v1.1 (2025) |

**Turbidity is the one where the edition changes an answer.** The 1998 chapter does not contain
the string `FNU` anywhere; v2.1 mentions it 10 times. NTU (white light) and FNU (infrared) are not
interchangeable, and "the fleet reports NTU" is a resolved decision in
[`../docs/timeline.md`](../docs/timeline.md). On the 1998 edition the corpus could not ground that
distinction at all.

Not used: `twri9a6_final508ChapterA6.pdf`, circulated as "the full combined chapter". It is **9
pages of front matter and table of contents** (12,359 chars), not the combined text.

### Tier 3 — regulatory / numeric thresholds

| file | chars | chunks | note |
|---|---:|---:|---|
| `epa-wqs-handbook-ch3-water-quality-criteria.pdf` | 123,131 | 56 | EPA 823-B-23-001, Dec 2023 |
| `epa-sop-field-instrument-calibration-2010.pdf` | 34,251 | 10 | **scanned — OCR, see below** |

Where a number comes from when the operator's source-of-truth does not carry one. The EPA SOP
covers calibration of exactly the six measured parameters and is the grounding N6's
recalibration-guidance feature needs.

### Tier 4 — situational / pollution-event context

| file | chars | chunks |
|---|---:|---:|
| `epa-assessing-monitoring-floatable-debris.pdf` | 142,843 | 57 |
| `noaa-nhabon-framework-workshop-report.pdf` | 137,034 | 52 |

**Read the tension here before adding more of this tier.** These cover things the DataPod cannot
measure — floating debris; algal toxins and chlorophyll — which is the exact property that got six
documents moved to `_excluded/` on 2026-07-29. They are kept for event *interpretation* (what a
DO/pH/turbidity signature tends to mean) rather than detection, and NHABON specifically because
◆G4 now looks less like a design choice than a question of which NOAA dataset the shipped product
already uses ([`../docs/timeline.md`](../docs/timeline.md) Phase N6).

The risk is measurable, not hypothetical: `refusal-pathogens` exists because a RAG arm can retrieve
on-topic-looking text and get pulled off a refusal the service must make.
[`../docs/SPECS.md`](../docs/SPECS.md) §14b records `firestore-vector` retrieving the volunteer
manual's fecal-bacteria chapter and refusing anyway. **Re-check the refusal fixtures after any
sweep on this corpus** — if over-refusal drops or a refusal turn starts answering, this tier is the
first thing to pull.

## OCR

`epa-sop-field-instrument-calibration-2010.pdf` is **scanned images — 18 chars/page extracted**,
far under the 50 char/page threshold in `src/ingestion/extract.ts`. Ingest does not perform OCR; it
reads `.ocr_cache/<filename>.txt` and **hard-errors if the cache is missing**, so this document
cannot be ingested on a machine without it.

The cache was produced 2026-08-21 with `pdftoppm -r 300 -gray` → `tesseract 5.3.4 --psm 1 -l eng`
(34,349 chars, ~1,908 chars/page). Body text is clean; the signature blocks on the revision pages
are garbled, which is what OCR does to handwriting and is not worth fixing.

**`.ocr_cache/` is git-ignored**, so this file does not travel with the repo. Anyone else who needs
to ingest must re-run OCR or be handed the `.txt`. That is a pre-existing convention, not new here.

## `_excluded/`

Documents deliberately kept out of the corpus, rather than deleted, so the decisions stay auditable.
Nothing in `_excluded/` is parsed by `npm run ingest`.

- **Removed 2026-07-29** — analytes this sensor cannot detect (metals, pesticides, pathogens,
  nutrients) plus two superseded DO references. Two were worse than useless: the system prompt
  already refuses pathogen and non-measured-pollutant questions, so retrieving them can only pull
  an answer toward material the bot must decline. `aquatic-life-criteria-table.md` was additionally
  unusable — a pandoc grid table whose cells are shredded across 8-character columns.
- **Removed 2026-08-21** — `volunteer_stream_monitoring_a_methods_manual.pdf` (EPA, 1997;
  467,610 chars, 201 chunks, the largest document in the old corpus). Superseded for all six
  parameters by the Tier 2 chapters above, which are more recent, more specific, and per-parameter.
  **This one is a judgement call and is reversible with one `mv`** — it is broad field-methods
  material with no direct replacement outside the six parameters, and two eval fixtures
  (`deepmanual-turbidity-optics`, and the `refusal-pathogens` retrieval path) reference it.

## Git

**These files are large and mostly untracked.** `.gitignore` has a `documents/*` rule. Tracked
anyway, by exception: this README, and the five Tier 1 PDFs that make up the ◆G9 direct-feed slice
(above). The two USGS chapters that predate the rule are also tracked, renamed in place on
2026-08-21. Everything else — the other seven USGS chapters, both EPA documents, both situational
documents — is untracked and absent from a fresh clone. `git ls-files documents/` is the answer;
check it before assuming a file is or is not in the repo.

## Changing the corpus

Adding or removing a file means editing `DOC_META` in `src/ingestion/corpus.ts`, then:

```bash
npm run ingest                 # rebuild data/corpus/corpus.json
npm run seed:firestore         # re-upload corpus_documents
npm run seed:firestore-chunks  # re-embed for firestore-vector (costs embedding tokens)
```

**Check the `direct-feed slice:` line ingest prints.** `0 chars` means the Tier 1 files are missing;
ingest will not tell you twice and will not fail.

**A corpus change invalidates captured bake-off transcripts.** Every arm was measured against a
fixed corpus; changing it and re-grading old transcripts compares answers to material the model
never saw. Re-run the sweep instead. The 2026-08-21 expansion invalidates the Phase N2 sweep for
*re-running* purposes — the captured transcripts stay valid as ◆G7 evidence, because each one
embeds the exact context the model was given.
