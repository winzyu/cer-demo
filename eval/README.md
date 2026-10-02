# eval/

The evaluation set. **Data, not code** — one JSON file per conversation, loaded by
`src/eval/fixtures.ts` and validated by `test/unit/evalFixtures.test.ts`.

**The apparatus was rebuilt between 2026-09-01 and 2026-09-28.** The plan, its rules and the dated
record of every capture are in [`docs/EVAL_REBUILD.md`](../docs/EVAL_REBUILD.md); the release
readout is [`reviews/phase3-2026-09-23/R4_REPORT.md`](reviews/phase3-2026-09-23/R4_REPORT.md).
Read those before anything else in `docs/` that describes an eval — `RETRIEVAL_BAKEOFF.md`
describes the set that was archived on 2026-09-01, and its report and fixture spec are archived too
(`docs/ARCHIVED.md`).

## What is here

| path | what it is |
|---|---|
| `fixtures-wave1/` | the wave 1 rebuild — **45 conversations, 90 turns**, frozen 2026-09-23, all runnable (no fixture declares a `requires`). Seven classes; slice coverage 41 none / 5 partial / 0 full. `FIXTURE_DIR` points here. `_BRIEF.md`, `_CONTAMINATION.md` and `_QUALIFICATION.md` record how it was written and checked. |
| `fixtures-long/` | five 12-turn conversations for the long-conversation check of 2026-09-28 (`_BRIEF.md`) |
| `fixtures-e7/` | six fixtures drafted for the E7 corpus additions, reviewed once, not yet captured |
| `claims/` | the Phase 1a claim inventory — what each chunk supports, which drives the class quotas and the refusal fixtures; extended for the E7 corpus |
| `turn-claims/`, `turn-claims-long/` | each named claim assigned to the turn it supports (2026-09-28) |
| `retrieval-labels/` | Phase 1e chunk labels, one file per wave 1 fixture, fixture-wide; regenerate with `scripts/resolveRetrievalLabels.ts` |
| `retrieval-labels-per-turn/`, `retrieval-labels-long/`, `retrieval-labels-long-per-turn/` | the same labels per turn and for the long set (`--turn-claims=`); `retrieval:eval --labels=<dir>` picks a set |
| `transcripts/<run>/` | every captured run since the rebuild, verbatim; never edited or regenerated |
| `grading/<run>/` | blind grading packets for the human grading rounds; regenerate with `npm run grade:packet` |
| `reviews/` | written reviews: the wave 1 agent review and corrections, the rubric strictness audit, and the Phase 3 / R4 report |

## What is not here

`fixtures/`, `fixtures-next/`, `retrieval-labels/`, `transcripts/` and `grading/` were archived on
2026-09-01 under the tag `eval-archive-2026-09-01`. Nothing is lost —
`git show eval-archive-2026-09-01:eval/grading/warm/scores.csv`. The reasons, and what breaks
until the rebuild refills them, are in [`docs/ARCHIVED.md`](../docs/ARCHIVED.md).

The rebuild's captures, packets and labels have since refilled `transcripts/`, `grading/` and
`retrieval-labels/`; the archived files are the pre-rebuild set only. `fixtures/` stays empty until
the last step of the migration renames `fixtures-wave1/` into it.

`grading/phase-1d-wave1-fixture-review.html`, the Phase 1d human-verification sheet recovered
2026-09-21 after the incident, is deliberately left untracked. It is the review *tool plus its
fixture data*, *not* the review's results — the page saves decisions to `localStorage` in whichever
browser they were made. The page is still live and owned by the user at
`https://claude.ai/code/artifact/9ee30967-633b-42ca-86b4-418cff7858e6`. It describes the superseded
46-fixture / 92-turn set, and Phase 1d was closed without human verification (2026-09-23).

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
