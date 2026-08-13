# eval/

The Phase N2 bake-off's fixed question set. **Data, not code** — one JSON file per conversation in
`fixtures/`, loaded by `src/eval/fixtures.ts` and validated by `test/unit/evalFixtures.test.ts`.

- **What each fixture means, how it is graded, and what cannot run yet:**
  [`docs/EVAL_FIXTURES.md`](../docs/EVAL_FIXTURES.md).
- **Why the experiment exists:** [`docs/RETRIEVAL_BAKEOFF.md`](../docs/RETRIEVAL_BAKEOFF.md) §5.

These are committed **before any arm runs**, and the rubrics are not revised after seeing an arm's
output. If a rubric turns out to be wrong, fix it and re-grade the saved transcripts — do not
re-run a paid sweep to make an arm look better.

## What else is in here now

| path | what it is |
|---|---|
| `fixtures/` | the 30 committed conversations (62 turns; 28/58 runnable, 2 need `query_sensor_data`) |
| `transcripts/<pass>/<arm>/` | the captured sweep — 2026-08-11/12, 3 arms × cold+warm × 28 files, **zero failed turns** |
| `grading/<pass>/` | the blind grading packet built from those transcripts by `npm run grade:packet` |

**Transcripts are the graded artifact and are captured, not derived.** They hold the exact context
supplied to the model, the cached/uncached token split, TTFT and wall time — none of which can be
reconstructed later, which is why they are committed rather than regenerated.

`grading/` **can** be regenerated (`npm run grade:packet`), and its label shuffle is seeded from
the fixture id so a rebuild cannot move A/B/C under a judge who is part-way through scoring.
`grading/<pass>/KEY.json` maps labels back to arms — **it is not opened until `scores.csv` is
complete**, or the grading is no longer blind and cannot be used. Instructions for the judge:
[`docs/GRADING_GUIDE.md`](../docs/GRADING_GUIDE.md).
