# Phase 1a claim inventory — status

Regenerated 2026-08-31 17:55 PDT. Chunk set is the post-re-ingest 451 (alpha-ratio filter off).

Every file passes integrity validation: every `chunkId` resolves against `data/corpus/corpus.json`,
every `quote` is an exact substring of its chunk and <=200 chars, no duplicate claim ids, every
`type` and `metrics` value legal.

| document | slice | chunks done | claims | remaining newly-recovered | status |
|---|---|---:|---:|---:|---|
| `usgs-nfm-a6.4-ph.pdf` | no | 20/56 | 96 | — | **PARTIAL** |
| `usgs-nfm-a6.2-dissolved-oxygen.pdf` | no | 35/91 | 106 | 34 | **PARTIAL** |
| `usgs-nfm-a6.7-turbidity.pdf` | no | 25/51 | 157 | 2 | **PARTIAL** |
| `usgs-nfm-a6.0-field-measurement-guidelines.pdf` | no | 27/47 | 123 | — | **PARTIAL** |
| `epa-sop-field-instrument-calibration-2010.pdf` | no | 10/12 | 109 | 2 | **PARTIAL** |
| `usgs-nfm-a6.6-alkalinity.pdf` | no | 36/42 | 148 | 6 | **PARTIAL** |
| `usgs-nfm-a6.5-orp.pdf` | no | 17/18 | 118 | 1 | **PARTIAL** |
| `usgs-nfm-a6.1-temperature.pdf` | no | 38/40 | 175 | 2 | **PARTIAL** |
| `EC_K_1.0_probe.pdf` | yes | 2/2 | 32 | — | COMPLETE |
| `IORP_probe.pdf` | yes | 3/3 | 40 | — | COMPLETE |
| `Industrial-DO-probe.pdf` | yes | 3/3 | 42 | — | COMPLETE |
| `IpH_probe.pdf` | yes | 3/3 | 46 | — | COMPLETE |
| `usgs-nfm-a6.3-specific-conductance.pdf` | no | 44/44 | 180 | — | COMPLETE |
| `usgs-nfm-a6.8-multiparameter-instruments.pdf` | no | 34/34 | 173 | — | COMPLETE |
| `water-quality-metrics-source-of-truth.pdf` | yes | 5/5 | 73 | — | COMPLETE |

**302/451 chunks, 1618 claims.** Remaining: 149 chunks, 47 of them newly recovered.

## What each unfinished document still needs

- `usgs-nfm-a6.4-ph.pdf` — 36 chunks: indices 20-55. **Top up the existing file; do not restart it.**
- `usgs-nfm-a6.2-dissolved-oxygen.pdf` — 56 chunks: indices 35-90. **Top up the existing file; do not restart it.**
- `usgs-nfm-a6.7-turbidity.pdf` — 26 chunks: indices 0-1, 27-50. **Top up the existing file; do not restart it.**
- `usgs-nfm-a6.0-field-measurement-guidelines.pdf` — 20 chunks: indices 27-46. **Top up the existing file; do not restart it.**
- `epa-sop-field-instrument-calibration-2010.pdf` — 2 chunks: indices 10-11. **Top up the existing file; do not restart it.**
- `usgs-nfm-a6.6-alkalinity.pdf` — 6 chunks: indices 0-2, 22-23, 30. **Top up the existing file; do not restart it.**
- `usgs-nfm-a6.5-orp.pdf` — 1 chunks: indices 0. **Top up the existing file; do not restart it.**
- `usgs-nfm-a6.1-temperature.pdf` — 2 chunks: indices 1-2. **Top up the existing file; do not restart it.**

## Notes for whoever resumes

- Front matter, dot leaders and reference lists correctly yield `"claims": []`. Do not manufacture filler.
- Headerless table continuations must be flagged in the `locator` and in `summary.notes`, and must
  not assert what a cell means. See `_BRIEF.md` addendum.
- Chunk dumps are regenerated from `data/corpus/corpus.json` and are not committed. Regenerate them
  after any re-ingest or the indices will not match.
- `usgs-nfm-a6.7-turbidity.json` still carries a PARTIAL marker in `summary.notes` and has no real
  summary or `gaps`. It is not done until those are written.
- Give each agent its own scratchpad filenames.
