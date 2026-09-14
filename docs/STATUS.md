# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-13.

## Start here

- **Eval (Phase 3 baseline)**: capture the generation baseline on gold context. First step: check which boxes are ticked in [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md), then the Phase 3 row of [`EVAL_REBUILD.md`](EVAL_REBUILD.md). Blocked on the Phase 1d fixture freeze and a spend approval (see "The user's").
- **Report and advice**: advice ships in reports first, once the allowlist is approved. First step: [`advice/README.md`](advice/README.md).
- **Pod-scope/auth (user's branch)**: in flight and uncommitted. Leave its files alone unless the user says otherwise.

## Last session

- Landed: the source-of-truth range veto end to end (`36a882f`, `81c26e0`, `3a0cf64`, `52bd17d`), quote-carrying citations in code and in the chat UI (`50bd3b3`, `c0abece`), docs (`c17f54e`, `71855e6`), `b2fa594` stakeholder question checklist.
- Smoke capture only ($0.0075): citations are wired up, not measured.
- Agent setup: CLAUDE.md slimmed, `git-plan`, `delegate`, `run-local` and `handoff` skills, dated handoffs replaced by this file.

## Working tree

- Branch `dev`; see `git status -sb`.
- Uncommitted, pod-scope/auth: `frontend/` (styles, `index.html`, `js/{api,main,podbar,report,auth,accountbar}.js`), `src/devices/metrics.ts`, `test/unit/{deviceApi,mergeChains,frontendAuth}.test.ts`, `test/fixtures/pod-scope/`, `docs/SPECS.md`, `docs/migration/*`.
- Uncommitted, user's: `eval/fixtures-wave1/_EXIT_CRITERIA.md` (still says 46/92 and 4 `precedence` fixtures).

## Open work

### Stakeholders (operator, supervisor, backend owner)

Tracked with checkboxes in [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md).
Most blocking: item 1, the operator's review of pod alert limits (they now drive event detection); item 6, the supervisor's confirmation of the "configured thresholds" wording; item 7, approval of the 38 advice candidates, 16 of which need new evidence first.

### The user's

1. Phase 1d fixture review on the 45 / 90 set, including the three new `precedence` fixtures and six edited rubrics. Blocks: Phase 3.
2. Update `_EXIT_CRITERIA.md` to 45 / 90 and 3 `precedence` fixtures.
3. On the pod-scope branch: `docs/SPECS.md` and `docs/migration/*` still describe prompt ranges, reference-table baselines and four turbidity bands; a `sup.cite` CSS rule belongs in `frontend/app.css`.
4. Approve `npm run seed:firestore` (writes Firestore; the collection still holds the removed document). Blocks: any `CORPUS_SOURCE=firestore` capture.
5. Approve spend for the Phase 3 capture.
6. Choose the `ADVICE_TIER` test design: append-only tier blocks (recommended) or a pinned prompt per tier.
7. Two audit-log decisions before `AUDIT_LOG` is switched on: a Firestore composite index and a retention/access policy (defects below).
8. Decide what to do about the slice-coverage overshoot before wave 2 spends budget (defects below).

### Claude's

1. Phase 3 capture, once unblocked. Where: `EVAL_REBUILD.md` Phase 3.
2. Measure quote quality on that capture before tuning; short table values under `MIN_QUOTE_CHARS` are the known weakness. Where: `src/eval/gates/checks.ts`.
3. Re-measure contamination for the three new `precedence` fixtures. Where: `_EXIT_CRITERIA.md` "Reproducing".
4. Add tool results to transcripts: `TranscriptTurn` has no field for them and the judge never sees them. Needed before any fixture runs with tools on.
5. Advice in reports, once the allowlist is approved.
6. Browser check of the citation chip (unit-tested only). Use the `run-local` skill.
7. Phase 1e remainder: per-turn label splits, candidate sweep, hard negatives, grade differentiation. Blocks Phase 4, not Phase 3.

## Unfixed defects

Reported 2026-09-10 or 2026-09-13; not re-verified since.

| where | defect | severity |
|---|---|---|
| `src/report/events.ts` | `detectAlgalBloom` returns "Algal bloom" at confidence 0.45 with severity hardcoded "Moderate", bypassing the `CONFIDENCE_FLOOR` downgrade every other type gets. | medium |
| `src/report/events.ts` | `Industrial` (0.3) and `Saltwater intrusion` (0.45) classify below the floor, so they are always rewritten to `Inconclusive` and can never appear. | medium |
| `src/report/buildReportInput.ts` | No diel/tidal classifier: every live parameter is tagged `pattern: "unknown"`, which disables `detectAlgalBloom` on live data and the skip that stops normal daily swings opening event windows. | high |
| `src/report/events.ts` | No `Pattern` value for a slow multi-week trend (for example drought-driven salinity creep). | low |
| `src/report/events.ts` | Still encodes the removed source-of-truth document's signature-matrix patterns (directions, not ranges); their provenance is no longer in the corpus. | low |
| `src/services/auditLog.ts` | `findAuditLogRecords` needs a Firestore composite index (caller equality + timestamp range + orderBy); there is no `firestore.indexes.json`, so the first real query throws `FAILED_PRECONDITION`. | medium |
| `src/services/auditLog.ts` | No retention or access policy; records hold full answers with customer sensor readings. Settle before enabling. | high |
| `eval/fixtures-wave1/` | Slice-coverage overshoot: 88% of answerable turns sit outside the ◆G9 slice, so Phase 4 conclusions only hold for manual-heavy questions. | medium |
| `src/eval/retrieval/types.ts` | Label files carry `locator` and `claimIds` that the `RelevantChunk` type does not declare; add `locator`. | low |
| `../clean-earth-rovers-server` `turbVoltToNTU.ts` | Returns 0 NTU for a missing voltage and for the offline sentinel, same as clear water; the fix belongs in the server repo. | medium |
| device registry | No sensor-model field, so quantitative and qualitative-only turbidity sensors cannot be told apart; chat stays qualitative-only for all pods. | medium |

## Active traps

- Run jest suites one at a time with `--runInBand`; parallel runs on this filesystem get killed for memory.
- Captures need `SENSOR_TOOL=false` on both server and runner. Use port 8010; never kill 8000.
- Re-chunking voids every label. `scripts/resolveRetrievalLabels.ts` does not delete stale label files, and any `-NN`-shaped token in fixture `notes` is read as a claim id.
- `data/corpus/corpus.json` is untracked: a fresh checkout must run `npm run ingest` to get the 14-document, 446-chunk corpus.
- The configured device token sees 5 pods (the August census saw 15); tokens are scoped to one organization.
- Nothing is deployed; all testing is local.

## Where things live

| what | where |
|---|---|
| How the built system works | [`SPECS.md`](SPECS.md) |
| Phases, gates, decision log | [`timeline.md`](timeline.md) |
| Eval plan and phase state | [`EVAL_REBUILD.md`](EVAL_REBUILD.md) |
| Advice allowlist decision | [`RESPONSIBILITY.md`](RESPONSIBILITY.md) |
| Answers owed by stakeholders | [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md) |
| Coding conventions | [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md) |
| House rules for Claude | [`../CLAUDE.md`](../CLAUDE.md), `.claude/skills/` |
| Archived docs, including past handoffs | [`ARCHIVED.md`](ARCHIVED.md) |
