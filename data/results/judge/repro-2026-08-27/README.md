# Judge reproducibility ledgers — 2026-08-27

Raw verdicts behind `RETRIEVAL_COMPARISON.md` §6.4a. All correctness-only, `gpt-oss-120b`,
temperature 0, judged against `eval/transcripts/warm/`.

| files | what they are |
|---|---|
| `ref1..ref5.jsonl` | five identical runs over the three refusal fixtures, 30 rows each. **All 30 rows identical across all five runs** — the evidence that correctness is deterministic. |
| `cal1.jsonl`, `cal2.jsonl` | two identical runs over the 6 calibration fixtures, 36 rows each. **36/36 identical**, and the run used to attribute the six rows that differ from the pre-fix ledger. |
| `scoped1.jsonl`, `scoped2.jsonl` | the same, with the refusal rule scoped to refusal-only turns. **Reverted**: it changed nothing outside refusal turns and cost one row (`definitional-orp` t1, `firestore-direct`, 2 → 1). Kept because §6.4a cites the result. |

Total spend: $0.202 (9 runs).

**Do not merge these into `warm.jsonl`.** They cover 3 and 6 fixtures respectively, not 28, and a
partial ledger under the full pass's filename is the §6.6 trap.
