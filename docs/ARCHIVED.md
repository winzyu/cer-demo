# Archived documents and artifacts

These files were removed from the working tree. They are **not lost** — every one is preserved
in git history under the tag named in its section.

| tag | date | what it holds |
|---|---|---|
| `docs-archive-2026-08-30` | 2026-08-30 | six superseded documents |
| `eval-archive-2026-09-01` | 2026-09-01 | the whole pre-rebuild eval set — 556 files |
| `corpus-archive-2026-09-13` | 2026-09-13 | the operator source-of-truth document and its claim inventory — 2 files |
| `handoffs-archive-2026-09-13` | 2026-09-13 | the last three dated session handoffs, retired for a single living `docs/STATUS.md` |
| `eval-docs-archive-2026-09-15` | 2026-09-15 | the bake-off results report and the two fixture specs for the archived eval set — 3 files |
| `docs-archive-2026-09-23` | 2026-09-23 | four superseded planning and eval docs, and the advice drafts - 9 files |
| `advice-archive-2026-09-17` | 2026-09-23 | the advice drafts, re-tagged under the name the catalogue cites - same commit as `docs-archive-2026-09-23` |
| `docs-tier2-archive-2026-09-23` | 2026-09-23 | the chat UX work plan, the pod-authorization design and the WSL checkout guide - 3 files, plus the untrimmed product-direction doc |
| `old-machine-recovery-2026-09-19` | 2026-09-22 | work from 2026-09-17 to 2026-09-19 that was committed on the old machine but never pushed, rebuilt from session transcripts - 5 planning docs not restored to the tree |

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

`docs/RETRIEVAL_BAKEOFF.md` was considered on 2026-09-15 alongside the three eval docs archived that day, and kept.
It is the pre-registration: its §8a thresholds carry forward verbatim into `EVAL_REBUILD.md` §1, and its §7b/§8b harness design is still in force.
About 45 code, test and script comments cite it by section, and several of the rules they cite (the servable-set rule, why the hard gates are absolute, the transcript capture table, the refusal-scope ruling) live nowhere else.

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

## `eval-docs-archive-2026-09-15` - the bake-off report and fixture specs

Removed on 2026-09-15, preserved under the tag `eval-docs-archive-2026-09-15`, which points at the last commit that contains all three.
Each describes the eval set archived on 2026-09-01 (`eval-archive-2026-09-01`), and each carried a banner saying so.

| file | lines | what it was | why it went |
|---|---:|---|---|
| `docs/RETRIEVAL_COMPARISON.md` | 1,223 | The ◆G7 results report: cost, quality and judge-agreement numbers for the retrieval arms | Every number was measured on `gpt-oss-20b`, a placeholder model, over the archived fixtures (`EVAL_REBUILD.md` §0). The findings code cited from it already live in `EVAL_REBUILD.md` §5 (Phase 2a) and §6 (traps), or inline in the citing comment; the per-answer cost figures are recomputed by `npm run cost` and pinned in `test/unit/cost.test.ts`. |
| `docs/EVAL_FIXTURES.md` | 280 | The spec of the 30-fixture / 62-turn bake-off question set | Superseded by `EVAL_REBUILD.md` §2 and `SPECS.md` §12. Its one rule still in use, that a `must_not` hit outranks a `must_contain` miss, is in `GRADING_GUIDE.md` §3, together with the atomic-claim rule it carried. |
| `docs/EVAL_FIXTURES_NEXT.md` | 418 | A proposed expansion of that set, never merged | Its own banner already marked it archived; nothing cited it. |

**1,921 lines.**

Code, test and doc references were repointed to `EVAL_REBUILD.md` or `GRADING_GUIDE.md` in the same change.
Historical mentions in `RETRIEVAL_BAKEOFF.md`, `EVAL_FIXTURE_QUALIFICATION.md` and dated `timeline.md` entries were left as text, marked archived.
`data/results/judge/repro-2026-08-27/README.md` still cites `RETRIEVAL_COMPARISON.md` §6.4a; it sits beside captured judge ledgers and was not edited.

Retrieve:

```bash
git show eval-docs-archive-2026-09-15:docs/RETRIEVAL_COMPARISON.md
git show eval-docs-archive-2026-09-15:docs/EVAL_FIXTURES.md
git show eval-docs-archive-2026-09-15:docs/EVAL_FIXTURES_NEXT.md
```

## `old-machine-recovery-2026-09-19` - lost old-machine work, rebuilt

The old machine made about 12 commits on `dev` after `05ef730` (2026-09-17 to 2026-09-19) and never pushed them, so the 2026-09-19 wipe lost them, along with the tags `advice-archive-2026-09-17` and `docs-archive-2026-09-19`.
On 2026-09-22 they were rebuilt from the Claude session transcripts and file-history snapshots onto `05ef730` and tagged `old-machine-recovery-2026-09-19`.
The R2 catalogue, the turbidity transcriptions, the payload scanner and four planning docs were merged into `dev`; the files below were not, because later work superseded them.
The doc cleanup of 2026-09-19 (`5b36ae7`, `49e7386`) ran from scratch scripts that no longer exist and could not be rebuilt; the lost tags have no replacement beyond this one.

| file | what it was | why it went |
|---|---|---|
| `docs/migration/SUPERVISOR_QUESTIONS_FINAL.md` | Draft of the supervisor questions | Superseded by the sent version, `SUPERVISOR_QUESTIONS_SEND.md`. |
| `docs/migration/SUPPORTING_DOCS_TASKS.md` | Task packets C1-C8 for the corpus, catalogue and v2 | C1-C4 were done; C5-C8 are covered by STATUS and its gates. |
| `docs/migration/WSL_SANDBOX_TASKS.md` | Task packets W1-W11 for the sandbox and dashboard | Done or overtaken by R3 on the cleaned upstream `local` branches. |
| `docs/migration/DOC_CLEANUP.md` | The 2026-09-19 documentation cleanup plan | Its commits were lost, and the docs have been rewritten since. |
| `docs/migration/RECOVERY_AFTER_RESET.md` | Pre-wipe backup and rebuild guide | Superseded by `WSL_SANDBOX.md` (since folded into `LOCAL_STACK.md`) and `SECURITY_INCIDENT_2026-09-19.md`. |

Retrieve:

```bash
git show old-machine-recovery-2026-09-19:docs/migration/WSL_SANDBOX_TASKS.md
git show old-machine-recovery-2026-09-19:docs/migration/RELEASE_GOAL_AND_PLAN.md   # the untrimmed plan
```

## `docs-archive-2026-09-23` - superseded plans and the advice drafts

Removed on 2026-09-23 after a doc audit against the code, preserved under the tag `docs-archive-2026-09-23`, which points at `9b331a8`, the last commit that contains them.
None is cited by code.
The same commit is also tagged `advice-archive-2026-09-17`: `src/catalogue/catalogue.json` names that tag as the home of the advice drafts, and the original was lost with the old machine, so the name is re-created rather than the catalogue edited.

| file | lines | what it was | why it went |
|---|---:|---|---|
| `docs/advice/` (README, four `candidates-*.md`, `review.html`) | ~1,490 | The 38 advice candidates of 2026-09-10 and their review page | Replaced by the guidance catalogue (`src/catalogue/`, `SPECS.md` §4b), which cites them as `advice-drafts <id>`; their trigger-reachability table predates the 2026-09-22 pattern tags. |
| `docs/EVAL_FIXTURE_QUALIFICATION.md` | 620 | Qualification of the archived 30-fixture set against the 2026-08-21 corpus | Already marked historical; the live equivalent is `eval/fixtures-wave1/_QUALIFICATION.md`. |
| `docs/migration/INTEGRATION_PLAN.md` | ~310 | The 2026-09-04 plan for landing this service in the product | Superseded by `GILLIGAN_TARGET_ARCHITECTURE.md`; Shape C was adopted and built in R3. |
| `docs/migration/codex-migration-report.md` | 155 | Record of the 2026-09-16 Claude and Codex configuration migration | A tooling record nothing links to; the configuration it describes is in the tree. |

Retrieve:

```bash
git show docs-archive-2026-09-23:docs/migration/INTEGRATION_PLAN.md
git show docs-archive-2026-09-23:docs/advice/candidates-oxygen.md
```

## `docs-tier2-archive-2026-09-23` - consolidation tier 2

Removed on 2026-09-23, preserved under the tag `docs-tier2-archive-2026-09-23`, which points at `9c783cd`, the last commit that contains them.
The same tag holds the full text of `docs/migration/GILLIGAN_PRODUCT_DIRECTION.md` before it was trimmed in place.
Code comments that cited these files now cite `SPECS.md`.

| file | lines | what it was | why it went |
|---|---:|---|---|
| `docs/CHAT_UX_WORKPLAN.md` | 404 | The August N5 chat-UX work plan: guardrails, Phase 0, Wave 1 streams WS-1 to WS-7, Wave 2 | Every stream landed in the demo frontend. The lasting rules moved to `SPECS.md` §4, §10.4, §15a and §16; the open Wave 2 items and the dashboard port moved to the chatbot task brief. |
| `docs/migration/POD_AUTHORIZATION.md` | 800 | The 2026-08 design for per-pod grants, with the merge-chain and cross-organization policy | The grant system was never scheduled: on 2026-09-16 access was decided to follow organization membership, confirmed 2026-09-23. The policy that is built lives in `SPECS.md` §10.3c, the upstream holes in `SECURITY_FINDINGS.md` §1 and §5, and the operator question as `STAKEHOLDER_QUESTIONS.md` item 22. |
| `docs/migration/WSL_SANDBOX.md` | 125 | The WSL2 checkout guide and the 2026-09-21 rebuild state | Folded into `LOCAL_STACK.md`, which now covers the checkout, what git does not carry, and running the stack. |

Retrieve:

```bash
git show docs-tier2-archive-2026-09-23:docs/migration/POD_AUTHORIZATION.md
git show docs-tier2-archive-2026-09-23:docs/migration/GILLIGAN_PRODUCT_DIRECTION.md
```

## Rules

- **Do not edit an archived file.** If one was wrong, that is part of the record.
- **Do not restore one to the tree** to consult it. `git show` prints it to stdout.
- Anything archived later gets its own tag and a row in this table.
