# Phase 1a claim inventory — COMPLETE

Finished 2026-09-01. Chunk set is the post-re-ingest 451 (alpha-ratio filter off).

**451/451 chunks. 2250 claims, 1685 high-specificity. 168 recorded gaps.**

Every file passes integrity validation: every `chunkId` resolves against `data/corpus/corpus.json`,
every `quote` is an exact substring of its chunk and <=200 chars, no duplicate claim ids, every
`type` and `metrics` value legal.

| document | slice | chunks | claims | high-spec | empty | gaps |
|---|---|---:|---:|---:|---:|---:|
| `usgs-nfm-a6.7-turbidity.pdf` | no | 51/51 | 303 | 257 | 5 | 12 |
| `usgs-nfm-a6.4-ph.pdf` | no | 56/56 | 274 | 205 | 18 | 14 |
| `usgs-nfm-a6.2-dissolved-oxygen.pdf` | no | 91/91 | 265 | 183 | 20 | 13 |
| `usgs-nfm-a6.0-field-measurement-guidelines.pdf` | no | 47/47 | 233 | 175 | 14 | 10 |
| `usgs-nfm-a6.3-specific-conductance.pdf` | no | 44/44 | 180 | 139 | 15 | 12 |
| `usgs-nfm-a6.1-temperature.pdf` | no | 40/40 | 175 | 108 | 12 | 10 |
| `usgs-nfm-a6.6-alkalinity.pdf` | no | 42/42 | 175 | 158 | 5 | 13 |
| `usgs-nfm-a6.8-multiparameter-instruments.pdf` | no | 34/34 | 173 | 111 | 9 | 8 |
| `epa-sop-field-instrument-calibration-2010.pdf` | no | 12/12 | 121 | 87 | 0 | 12 |
| `usgs-nfm-a6.5-orp.pdf` | no | 18/18 | 118 | 82 | 2 | 9 |
| `water-quality-metrics-source-of-truth.pdf` | **yes** | 5/5 | 73 | 64 | 0 | 12 |
| `IpH_probe.pdf` | **yes** | 3/3 | 46 | 33 | 0 | 11 |
| `Industrial-DO-probe.pdf` | **yes** | 3/3 | 42 | 34 | 0 | 11 |
| `IORP_probe.pdf` | **yes** | 3/3 | 40 | 28 | 0 | 10 |
| `EC_K_1.0_probe.pdf` | **yes** | 2/2 | 32 | 21 | 0 | 11 |

**Slice vs corpus.** The 5 slice documents hold 233 claims (180 high-specificity) across 16 chunks.
The 10 documents outside the slice hold 2017 (1505 high-specificity) across 435 chunks.
**89.3% of high-specificity claims sit outside the diamond-G9 slice** — see the Phase 1a
handback for what that means for exit criterion 3.

## Verified cross-document findings

- **A6.0 Table 6.0-1 and A6.8 Table 6.8-5 AGREE numerically** on all five stabilization criteria
  (temp +/-0.2 C, SC +/-5 uS/cm or +/-3%, DO +/-0.2 mg/L, pH +/-0.1, turbidity +/-0.5 TU or 5%).
  This is redundancy, **not** a precedence conflict. A fixture premised on them disagreeing would be false.
- **A6.2 defines "hypoxic to anoxic" as < 1.0 mg/L**, as a QA trigger for optical sensors, while the
  operator source-of-truth puts hypoxia at < 2 mg/L. Genuine `precedence` material.
- **A6.4 never sets pH 6.5-8.5 as a criterion.** Its ranges are descriptive or instrument-envelope only,
  while the operator document states 6.5-8.5 as guidance. The conflict is "asserted band vs described
  range", not a numeric clash — harder and more interesting than first assumed.

## Notes

- Empty `claims: []` chunks are front matter, TOC dot leaders, acknowledgments, bibliographies and
  pure-overlap page-break fragments. That is correct, not missing work.
- Headerless table continuations are flagged in each file's `locator` and `summary.notes`. **A fixture
  whose answer needs a cell from one of those is not honestly answerable from retrieval.**
- Chunk dumps are regenerated from `data/corpus/corpus.json` and are not committed. Regenerate after
  any re-ingest or indices will not match.
- `a6.0` chunks 38-46 and the summary blocks for `a6.0` and `a6.8` were written on the main thread
  after subagents were terminated by account spend limits. All preceding subagent work was verified
  unaltered against commit `11bbc07`.
- Read-only git is permitted for agents verifying they have not destroyed prior work. Only mutating
  git commands are off limits.
