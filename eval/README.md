# eval/

The evaluation set. **Data, not code** — one JSON file per conversation, loaded by
`src/eval/fixtures.ts` and validated by `test/unit/evalFixtures.test.ts`.

**The apparatus is being rebuilt.** The plan, and the only context a fresh session needs, is
[`docs/EVAL_REBUILD.md`](../docs/EVAL_REBUILD.md). Read that before anything else in `docs/` that
describes an eval — `EVAL_FIXTURES.md`, `RETRIEVAL_BAKEOFF.md` and `RETRIEVAL_COMPARISON.md` all
describe the set that was archived on 2026-09-01.

## What is here

| path | what it is |
|---|---|
| `fixtures-wave1/` | the wave 1 rebuild — **46 conversations, 92 turns**, all runnable (no fixture declares a `requires`). Seven classes; slice coverage 41 none / 5 partial / 0 full. `FIXTURE_DIR` points here. |
| `claims/` | the Phase 1a claim inventory — what each chunk supports, which drives the class quotas and the refusal fixtures |

## What is not here

`fixtures/`, `fixtures-next/`, `retrieval-labels/`, `transcripts/` and `grading/` were archived on
2026-09-01 under the tag `eval-archive-2026-09-01`. Nothing is lost —
`git show eval-archive-2026-09-01:eval/grading/warm/scores.csv`. The reasons, and what breaks
until the rebuild refills them, are in [`docs/ARCHIVED.md`](../docs/ARCHIVED.md).

Their names are deliberately free. New captures, packets and labels land back at
`transcripts/`, `grading/` and `retrieval-labels/`. `fixtures/` stays empty until the last step
of the migration renames `fixtures-wave1/` into it.

## Rules that did not change

**Fixtures are committed before any arm runs, and the rubrics are not revised after seeing an
arm's output.** If a rubric turns out to be wrong, fix it and re-grade the saved transcripts — do
not re-run a paid sweep to make an arm look better.

**Transcripts are the graded artifact and are captured, not derived.** They hold the exact context
supplied to the model, the cached/uncached token split, TTFT and wall time — none of which can be
reconstructed later, which is why they are committed rather than regenerated.

`grading/` **can** be regenerated (`npm run grade:packet`), and its label shuffle is seeded from
the fixture id so a rebuild cannot move A/B/C under a judge who is part-way through scoring.
`grading/<pass>/KEY.json` maps labels back to arms — **it is not opened until `scores.csv` is
complete**, or the grading is no longer blind and cannot be used. Instructions for the judge:
[`docs/GRADING_GUIDE.md`](../docs/GRADING_GUIDE.md). Use `--out=<dir>`, never `--force`; that
flag destroyed 36 completed rows once.
