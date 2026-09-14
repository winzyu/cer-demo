# Archived documents and artifacts

These files were removed from the working tree. They are **not lost** — every one is preserved
in git history under the tag named in its section.

| tag | date | what it holds |
|---|---|---|
| `docs-archive-2026-08-30` | 2026-08-30 | six superseded documents |
| `eval-archive-2026-09-01` | 2026-09-01 | the whole pre-rebuild eval set — 556 files |
| `corpus-archive-2026-09-13` | 2026-09-13 | the operator source-of-truth document and its claim inventory — 2 files |
| `handoffs-archive-2026-09-13` | 2026-09-13 | the last three dated session handoffs, retired for a single living `docs/STATUS.md` |

Retrieve one by path:

```bash
git show docs-archive-2026-08-30:docs/HANDOFF.md
git show docs-archive-2026-08-30:docs/migration/CONVENTIONS.server.md > /tmp/conventions.server.md
git show eval-archive-2026-09-01:eval/grading/warm/scores.csv
```

They were removed rather than moved to `docs/archive/` so that a search of this repository does
not surface stale statements as though they described the current system. Every one of them was
accurate when written and is wrong now in at least one material way.

| file | lines | what it was | why it went |
|---|---:|---|---|
| `docs/HANDOFF.md` | 362 | Session record, 2026-08-13 | Superseded twice. Its state, branch table and "next task" all describe a tree that no longer exists. Current state is `HANDOFF_2026-08-27.md`. |
| `docs/HANDOFF_2026-08-26.md` | 333 | Session record, 2026-08-26 | Superseded by `HANDOFF_2026-08-27.md`. |
| `docs/DOC_CLEANUP_2026-08-24.md` | 115 | Record of a previous doc cleanup | A record of housekeeping, referenced by nothing. |
| `docs/notes/generation-2026-08-26.md` | 251 | Agent findings on generation quality | Its §5 describes a check as "not implemented" that was implemented the next day; its §0 describes a worktree that has since been corrected. The durable findings belong in the evaluation doc. |
| `docs/migration/CONVENTIONS.dashboard.md` | 391 | Conventions of `../user-dashboard` | Describes a reference repo that `CLAUDE.md` marks read-only. Not conventions this repo follows. |
| `docs/migration/CONVENTIONS.server.md` | 638 | Conventions of `../clean-earth-rovers-server` | Same. `docs/migration/CONVENTIONS.md` is the file that governs code here. |

**2,090 lines.**

## What was considered and kept

`docs/migration/MIGRATION_SPEC.md` was an archive candidate — the FastAPI to Node port it
describes is finished. It stays because **21 source files cite it by section** as the reason
their behaviour is what it is (`systemPrompt.ts`, `ChatOrchestrator.ts`, `chunk.ts`,
`querySensorData.ts`, and others). Archiving it would leave those comments pointing at nothing.

## `eval-archive-2026-09-01` — the pre-rebuild eval set

Removed from the working tree on 2026-09-01, preserved under the tag `eval-archive-2026-09-01`
(which points at `92438f3`, the last commit that contains them). The eval apparatus is being
rebuilt from scratch; the reasons are in [`EVAL_REBUILD.md`](EVAL_REBUILD.md) §0, and the
archive is Phase 0 item 4 of that plan.

| directory | files | size | what it was | why it went |
|---|---:|---:|---|---|
| `eval/fixtures/` | 30 | 120K | The committed bake-off conversations, 30 fixtures / 62 turns | Superseded by `eval/fixtures-wave1/` (46 fixtures / 92 turns). 27 of the 30 were answerable from 4.4% of the corpus, and three fixtures carried the entire `deep-in-manual` class — a three-sample class mean has a standard error of 0.43 on a 0/2 scale and cannot support a conclusion. |
| `eval/fixtures-next/` | 18 | 72K | The proposed 2026-08-21 expansion, never merged | Superseded. It was an expansion of a set that is being replaced, and was written against the pre-rebuild design. |
| `eval/retrieval-labels/` | 48 | 208K | Chunk-level relevance ground truth for `npm run retrieval:eval` | The labels are keyed to fixtures that no longer exist. Rebuilt from scratch in Phase 1e, with a **human locator** (document + section + short quote) alongside each chunk hash, so a future re-chunk can re-resolve a label instead of voiding it. |
| `eval/transcripts/` | 224 | 15M | Every captured sweep, `<pass>/<arm>/<fixture>.json` | All captured on `gpt-oss-20b`, a placeholder model that is being replaced by `gpt-oss-120b` (§1). Every number in them — the oracle-router ceiling of 1.155, the dilution finding, the per-class results — is a property of a model that is not shipping. |
| `eval/grading/` | 236 | 4.9M | The blind human grading packets — base and the 2026-08-27 round | See the warning below. |

**556 files, ~20MB.**

### Warning — this breaks `npm run judge -- --calibrate` until Phase 2c

`eval/grading/` held **the only judge-vs-human evidence that exists**: 36 human-graded rows,
24 of them comparable (12 excluded as stale — the arm was re-captured after grading). Those 24
rows are what selected `deepseek-v4-flash-0731` as the judge, at correctness κ 0.937 — the only
candidate clearing κ 0.70 on all three dimensions (`EVAL_REBUILD.md` §3a).

Archiving them means `npm run judge -- --calibrate` has no graded sample and throws
`No graded sample at eval/grading/warm`. **This is expected and accepted.** The rows grade
answers from a placeholder model against fixtures that no longer exist, so nothing may be
re-derived from them; §3a already records the judge choice as *provisional until Phase 2c*,
which produces a new 30-row stratified sample and re-measures κ against the ≥ 0.70 bar. The
judge decision stands on the archived evidence in the meantime — it is not re-opened by the
archive, only un-recomputable.

The row data is confirmed present in history before deletion:

```bash
git show eval-archive-2026-09-01:eval/grading/warm/scores.csv     # 36 filled rows of 174
git show eval-archive-2026-09-01:eval/grading/warm/KEY.json       # the blind label -> arm mapping
```

### What else went dead, deliberately

Three commands now throw a clear "nothing captured yet" error instead of reporting numbers
about the old set. That is the point of the archive — the alternative was `npm run gate:check`
grading `gpt-oss-20b` transcripts and printing a PASS/FAIL that means nothing for the new set.

| command | what it does now (observed 2026-09-01) | fixed by |
|---|---|---|
| `npm run gate:check` | `Error: No transcripts at .../eval/transcripts/warm. Capture a pass first (npm run bakeoff).` | Phase 3 |
| `npm run judge -- --calibrate` | `Judge failed: No transcripts at .../eval/transcripts/warm. Capture a pass first (npm run bakeoff).` — it builds the task list before it reads the graded sample, so the transcripts are what it misses first. `calibrate()` itself throws `No graded sample at eval/grading/warm`. | Phase 3, then Phase 2c |
| `npm run retrieval:eval` | `No retrieval labels at .../eval/retrieval-labels. They are the ground truth for \`npm run retrieval:eval\`; see docs/RETRIEVAL_LABELS.md.` | Phase 1e |

`gate:check` and `retrieval:eval` print the message inside a stack trace rather than a clean
line — pre-existing, neither wraps `main` in a catch. The message is right; it was left alone.

The directory **names** are deliberately left free. New captures, packets and labels land back at
`eval/transcripts/`, `eval/grading/` and `eval/retrieval-labels/`, so none of those constants
moved. `eval/fixtures/` is the exception: it is free but not yet occupied, because renaming
`eval/fixtures-wave1/` into it is the last step of the migration.

## `corpus-archive-2026-09-13` — the operator source-of-truth document

Removed from the corpus on 2026-09-13, preserved under the tag `corpus-archive-2026-09-13` (which
points at `774b152`, the last commit that contains both files).

| file | what it was | why it went |
|---|---|---|
| `documents/water-quality-metrics-source-of-truth.pdf` | The operator's reference for the six DataPod parameters: per-water-type range tables, a DO threshold ladder, a pollution-event signature matrix, and sensor caveats. 5 chunks, and one of the five ◆G9 direct-feed slice documents. | The project supervisor vetoed its ranges: pod ranges come only from each device's registry thresholds (`get_pod_thresholds`). Its ranges were woven through the prose of every chunk rather than kept in one table, so removing the whole document was the only way to guarantee a vetoed range is never retrieved. The file itself sits in `documents/_excluded/`, which ingestion never reads. |
| `eval/claims/water-quality-metrics-source-of-truth.json` | Its claim inventory: 73 claims, 15 numeric. | Its chunks no longer exist, and `scripts/resolveRetrievalLabels.ts` reads every file in `eval/claims/`. |

What moved with it, deliberately: the direct-feed slice is now the four probe datasheets (26,096
chars); the report's `BASELINE_RANGES` table, transcribed from this document, was replaced by
registry thresholds; the four `precedence` fixtures were rewritten around document ranges versus
the pod's configured threshold; and the fixtures whose rubrics cited it were edited to stand on the
remaining corpus. The event-classification rules in `src/report/events.ts` still encode the
document's signature-matrix *patterns* (directions of movement, not ranges), and advice-catalogue
entries in `docs/advice/` cite its claims as evidence — both are recorded as open follow-ups in
`docs/timeline.md`.

Retrieve:

```bash
git show corpus-archive-2026-09-13:eval/claims/water-quality-metrics-source-of-truth.json
git show corpus-archive-2026-09-13:documents/water-quality-metrics-source-of-truth.pdf > /tmp/sot.pdf
```

## `handoffs-archive-2026-09-13` - dated session handoffs, retired

Removed on 2026-09-13, preserved under the tag `handoffs-archive-2026-09-13` (which points at
`71855e6`, the last commit that contains all three).

Dated handoffs were replaced by one living `docs/STATUS.md`, rewritten in place at the end of each
session by the `/handoff` skill, with its history in `git log -p docs/STATUS.md`. They only
mattered to the next session but accumulated, stayed linked as "start here" after going stale, and
collected durable reasoning that code comments then cited.

| file | lines | what it was | why it went |
|---|---:|---|---|
| `docs/HANDOFF_2026-08-27.md` | 540 | Session record, 2026-08-27: the ◆G7 split, timing and cost-model fixes, the retrieval ceiling | Superseded twice. The ◆G7 decision and the prompt unpinning it cited are in `timeline.md`. |
| `docs/HANDOFF_2026-09-10.md` | 256 | Session record, 2026-09-10: the Tier 1 refusal gate, regenerated labels, gold-context arm, advice candidates, 13 findings | Superseded. The turbidity-band adoption and the instrument-agnostic prompt rule it held became `timeline.md` decision-log rows; its still-open findings moved to `STATUS.md`. |
| `docs/HANDOFF_2026-09-13.md` | 188 | Session record, 2026-09-13: the source-of-truth range veto, quote citations | Replaced by `STATUS.md`. Its final uncommitted edits (the stakeholder-question pointers and traps) were folded into `STATUS.md` rather than committed, so the tagged copy is the `71855e6` version. |

Code, test and doc references were repointed to `timeline.md` or `STATUS.md` in the same change.

Retrieve:

```bash
git show handoffs-archive-2026-09-13:docs/HANDOFF_2026-09-13.md
git show handoffs-archive-2026-09-13:docs/HANDOFF_2026-09-10.md
git show handoffs-archive-2026-09-13:docs/HANDOFF_2026-08-27.md
```

## Rules

- **Do not edit an archived file.** If one was wrong, that is part of the record.
- **Do not restore one to the tree** to consult it. `git show` prints it to stdout.
- Anything archived later gets its own tag and a row in this table.
