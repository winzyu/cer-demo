# eval/

The Phase N2 bake-off's fixed question set. **Data, not code** — one JSON file per conversation in
`fixtures/`, loaded by `src/eval/fixtures.ts` and validated by `test/unit/evalFixtures.test.ts`.

- **What each fixture means, how it is graded, and what cannot run yet:**
  [`docs/EVAL_FIXTURES.md`](../docs/EVAL_FIXTURES.md).
- **Why the experiment exists:** [`docs/RETRIEVAL_BAKEOFF.md`](../docs/RETRIEVAL_BAKEOFF.md) §5.

These are committed **before any arm runs**, and the rubrics are not revised after seeing an arm's
output. If a rubric turns out to be wrong, fix it and re-grade the saved transcripts — do not
re-run a paid sweep to make an arm look better.

Transcripts and grades land here later (`eval/transcripts/`, `eval/grades/`) when the capture
runner exists.
