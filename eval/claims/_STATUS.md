# Phase 1a claim inventory — status

Regenerated 2026-08-31 after the alpha-ratio filter was dropped and the corpus re-ingested
(393 -> 451 chunks). **All 393 pre-existing chunk ids survived the re-ingest**, so every claim
already extracted stayed valid; only `index` was re-derived from `chunkId`. 58 new chunks now
need extraction on top of the backlog left by the interrupted first run.

Every file below passes integrity validation: every `chunkId` resolves against
`data/corpus/corpus.json`, every `quote` is an exact substring of its chunk, no duplicate claim
ids, every `type` and `metrics` value legal.

| document | slice | chunks done | claims | of the remainder, newly recovered | status |
|---|---|---:|---:|---:|---|
| `usgs-nfm-a6.0-field-measurement-guidelines.pdf` | no | 0/47 | 0 | 3 | **NOT STARTED** |
| `usgs-nfm-a6.2-dissolved-oxygen.pdf` | no | 0/91 | 0 | 36 | **NOT STARTED** |
| `usgs-nfm-a6.4-ph.pdf` | no | 0/56 | 0 | 3 | **NOT STARTED** |
| `usgs-nfm-a6.8-multiparameter-instruments.pdf` | no | 0/34 | 0 | 1 | **NOT STARTED** |
| `usgs-nfm-a6.3-specific-conductance.pdf` | no | 17/44 | 83 | 2 | **PARTIAL** |
| `usgs-nfm-a6.7-turbidity.pdf` | no | 25/51 | 157 | 2 | **PARTIAL** |
| `epa-sop-field-instrument-calibration-2010.pdf` | no | 10/12 | 109 | 2 | **PARTIAL** |
| `usgs-nfm-a6.6-alkalinity.pdf` | no | 36/42 | 148 | 6 | **PARTIAL** |
| `usgs-nfm-a6.5-orp.pdf` | no | 17/18 | 118 | 1 | **PARTIAL** |
| `usgs-nfm-a6.1-temperature.pdf` | no | 38/40 | 175 | 2 | **PARTIAL** |
| `EC_K_1.0_probe.pdf` | yes | 2/2 | 32 | — | COMPLETE |
| `IORP_probe.pdf` | yes | 3/3 | 40 | — | COMPLETE |
| `Industrial-DO-probe.pdf` | yes | 3/3 | 42 | — | COMPLETE |
| `IpH_probe.pdf` | yes | 3/3 | 46 | — | COMPLETE |
| `water-quality-metrics-source-of-truth.pdf` | yes | 5/5 | 73 | — | COMPLETE |

**159/451 chunks, 1023 claims.** Remaining: 292 chunks, of which 58 are newly recovered tables and front matter.

## What each unfinished document still needs

- `usgs-nfm-a6.0-field-measurement-guidelines.pdf` — all 47 chunks.
- `usgs-nfm-a6.2-dissolved-oxygen.pdf` — all 91 chunks.
- `usgs-nfm-a6.4-ph.pdf` — all 56 chunks.
- `usgs-nfm-a6.8-multiparameter-instruments.pdf` — all 34 chunks.
- `usgs-nfm-a6.3-specific-conductance.pdf` — 27 chunks: indices 1, 2, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43. **Top up the existing file; do not restart it.**
- `usgs-nfm-a6.7-turbidity.pdf` — 26 chunks: indices 0, 1, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50. **Top up the existing file; do not restart it.**
- `epa-sop-field-instrument-calibration-2010.pdf` — 2 chunks: indices 10, 11. **Top up the existing file; do not restart it.**
- `usgs-nfm-a6.6-alkalinity.pdf` — 6 chunks: indices 0, 1, 2, 22, 23, 30. **Top up the existing file; do not restart it.**
- `usgs-nfm-a6.5-orp.pdf` — 1 chunks: indices 0. **Top up the existing file; do not restart it.**
- `usgs-nfm-a6.1-temperature.pdf` — 2 chunks: indices 1, 2. **Top up the existing file; do not restart it.**

## Notes for whoever resumes

- The newly recovered chunks are mostly numeric tables, plus some front matter, TOC dot-leader
  blocks and reference lists. Front matter and dot-leaders will yield `"claims": []` — that is
  correct, do not manufacture filler for them.
- **11 of the 35 recovered table chunks are bare number grids** whose caption and column header
  fell on the other side of a chunk boundary. Record what they are from the locator, and say so
  in `summary.notes`. A fixture that needs a value from one of these is not safely answerable by
  a retrieval arm even now.
- Chunk dumps are regenerated from `data/corpus/corpus.json`; they are not committed. Regenerate
  them after any re-ingest or the indices will not match.
- `eval/claims/_BRIEF.md` is the extraction brief the first run used.
- Give each agent its own scratchpad filenames; the first run had agents overwrite each other.
