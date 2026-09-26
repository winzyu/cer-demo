# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-25 (late) at `dev` commit `621da45` plus this handoff and the user's decisions on the open items, by the release orchestrator session; R4 facts are as `eval/wave1-corrections` records them.

## Start here

- **Gilligan release, September 30.** The task list, owners and dates are [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md) (task IDs such as Q1, S3, L5); where this file and the plan disagree, the plan wins. The user deploys.
  Background: [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md), then [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md).
- **Orchestration.** One session reviews each workstream's actual diff when it reports done, lands cer-demo branches on `dev` one at a time in dependency order (Q1 before Q3-Q6; prompt changes before R4's final capture), runs typecheck, lint and the touched suites singly after each merge, pushes `dev`, and keeps the plan current. It never pushes upstream and implements nothing itself beyond small fixes.
  Next: land the ready branches under "Awaiting review", chase the three must-tasks due Sep 26 that have not started (Q3-Q6, L1, dashboard), and review each session's diff as it reports done.
- **Eval (R4)** on `eval/wave1-corrections` (`ab686f1`, pushed, not in `dev`). E1-E3 are done: correctness kappa 0.849 on the tuned 32 rows, 9/12 exact on the held-out round (the E3 arm means stand), and the final capture scored 1.01 on gold context and 0.58-0.59 on `hybrid-slice-vector`, both failing the Tier 2 gates.
  The improvement round found no lever: a reranker lifts recall from 39.5% to 51.9% but correctness only to 0.62, and answer-model reasoning `high` scores 0.88 against 1.00 with 12 empty answers; neither is recommended for launch. Three outside reviews (Gemini, Claude, Codex) of whether the rubric is too strict all return "mixed" and agree 1.01 stays the reported result. The user chose to fix only flawed points: rubric v2 (32 edits in 24 turns, questions unchanged) is committed; v2 scores are secondary to 1.01.
  Next: re-judge E3 on v2 (approved by the user for the next session), measure the always-included datasheet slice, then the user's reranker and E4 decisions, then E6 (`eval/reviews/phase3-2026-09-23/HANDOFF.md` and [`EVAL_REBUILD.md`](EVAL_REBUILD.md) from "R4 final capture (E3)" on, both on that branch).
- **Answer quality.** Q1 landed on `dev` (`SPECS.md` §10.2). Q3-Q6 (current site, stuck sensors, over-wide limits, CWA Old) have not started and are due Sep 26; decided 2026-09-25: current site only with no earlier-site option (Q3), and a non-existent organization id counts as null so CWA Old merges into OWC 2026 (Q6, now must); Q8 holds Q1's re-check gaps. The report audit ([`migration/REPORT_AUDIT_2026-09-25.md`](migration/REPORT_AUDIT_2026-09-25.md)) adds 20 findings, several outside Q3-Q5.
- **Upstream.** Both `feature/gilligan-rag-assistant` branches are pushed (server `b2074b8`, dashboard `da5412f`); server `task/gilligan-release-p3-p4`, `fix/user-route-auth` and `feat/service-key` and dashboard `task/gilligan-release-p3-p4` were pushed 2026-09-25 as new branches; PRs are held back ([`migration/UPSTREAM_PR_BODIES.md`](migration/UPSTREAM_PR_BODIES.md)). The user merges and deploys after the demo.
  The malware did run on a build machine; the user was told every credential was rotated. Build only from the clean feature branches ([`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md)).

## Awaiting review

- **Ready to land on `dev`** (reviewed): hygiene L3 `chore/hygiene-2026-09-24` (four commits: `deviceApi` test, eval-fixtures cleanup, settings deny paths, `.agents` git-plan sync).
  Also ready when their sessions agree: `docs/l2-inputs` (`9d448f8`, L2 inputs and the dedicated Gilligan database decision), `docs/gcp-test-env` (`bef9c6e`, setup, the mirror end-to-end ticket and preflight results; its last commit is unpushed), `docs/firestore-testing-plan` (`60befd4`, this orchestrator's test and Firestore plan, partly superseded by those two).
- **Service (S1-S4, Q7)**: `feat/service-release` (`cc8a300`, pushed) in `.claude/worktrees/feat+service-release`; not reported done. Before landing it needs `expireAt` on usage documents and a longer timeout on the emulator concurrency test (`migration/GILLIGAN_FIRESTORE_FRAMEWORK.md` "Corrections").
- **Mirror end-to-end (T2 offline)**: fabricated Firestore data in the local emulator, server `mirror/e2e-p3` (now `37fec03`) in `clean-earth-rovers-server/.worktrees/mirror`, run by its own session from `docs/gcp-test-env`; phase 1 ran 2026-09-25 (46 scenarios, 43 pass, 3 fail: A1/D4 orphan sees every pod, A3 invited-user 500; plus a 413 once a chat's history passes about 100 KB). The session was stopped with a full context; phase 2 has not run. The user approved $10 for its model calls. The `mirror/*` branches are test-only and never ship.
  Whatever the mirror cannot prove goes in [`migration/LIVE_TEST_LIST.md`](migration/LIVE_TEST_LIST.md).

## Not started (due Sep 26)

- **Q3-Q6** in one session cut from `dev`.
- **L1 runbook rewrite** for the user deploying: [`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md).
- **Dashboard session** (U1-U6, P5) from the dashboard `task/gilligan-release-p3-p4`.

## Last session

- Orchestrator: landed `docs/stale-o7` (`90de90f`) and the report audit (`621da45`) on `dev`, typecheck and lint clean; fetched Sol's P3/P4 fixes upstream after review (server tests 7/7 and 3/3, `tsc` clean).
- Reviewed `fix/user-route-auth` (9/9, `tsc` clean); recorded it (`SECURITY_FINDINGS.md` §8) and two Firestore-table corrections (retention field, database-level IAM) for F2.
- Wrote the Firestore and testing plan (`docs/firestore-testing-plan`); the user then set up `gcloud`, the emulator, project `cer-demo-2026` and the mirror in other sessions.
- Orchestrator spend: none; one blocked read of the old QA server.
- R4: rubric v2 applied and logged (`RUBRIC_FIXES.md`); the source-of-truth PDF is in no prompt (answer-model prompt median 19.5K tokens on `hybrid-slice-vector`, 5.2K on gold context); four eval suites, typecheck and lint clean; no spend, R4 about $13.90 of $20.

## Working tree

- `dev` `621da45` plus this handoff, level with `origin/dev` once pushed; `_EXIT_CRITERIA.md`, `eval/grading/phase-1d-wave1-fixture-review.html`, `review-marked-up.html` and the root v2 PDF stay untracked on purpose (`migration/LOCAL_STACK.md`).
- cer-demo worktrees: `wave1-corrections` (R4; untracked re-judge link only), `feat+service-release`, `l2-inputs`, `gcp-test-env`, `firestore-plan`, `firestore-mirror` (branch `feat/firestore-mirror` at `c4fe461`, no commits), `hygiene`. Merged and removable once their sessions close: `answer-quality-q1`, `token-cap`, `upstream-publish`.
- Upstream: server `local` `d12ad6d`, dashboard `local` `fd103a0`, with git-ignored `.env` files; worktrees under `~/code/clean-earth-rovers/worktrees/` (`server-publish`, `server-service-key`, `server-user-auth`, `dashboard-publish`) and the server's `.worktrees/mirror` (excluded in `.git/info/exclude`).
- Local processes left running by the mirror session: Firestore emulator :8080 (hub :4400), server :5101, cer-demo :8010.
- Tools: `gcloud`, `firebase-tools` and Java 21 are installed (`LOCAL_STACK.md` on `docs/gcp-test-env`); test project `cer-demo-2026` with database `gilligan-test`.
- Git-ignored or untracked restored inputs: `node_modules/`, `.env`, the corpus PDFs, `.ocr_cache/`, `data/corpus/`, `data/embeddings/cache.json`. Still missing: `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/`, `serviceAccountKey.json`.

## Open work

- User: start the Q3-Q6, L1 and dashboard sessions; test on the local mirror, then approve the demo, after which CER's Fireworks key replaces ours and credentials rotate (S5); get the technical Firestore permissions (F2 and the dedicated database are approved); R4: the rubric question and E4's choices, in the user's own eval session.
- User, later: T2's live write batches, if any are still needed after the mirror.
- Agent: land the ready branches; pass the two service fixes to the service session; keep the plan current; on Sep 28 move open "should" tasks after launch and freeze the release candidate (L4).
- Agent (R4): v2 re-judge, the datasheet-slice measurement proposal, then E4 and E6, on `eval/wave1-corrections`.
- Standing: re-seed Firestore needs approval; the slice-coverage overshoot and `ADVICE_TIER` design wait for after launch.

## Unfixed defects

| where | defect | severity |
|---|---|---|
| `Dockerfile` + `.dockerignore` on `dev` | The image excludes `data/`, so it ships without corpus or embedding cache; fixed on `feat/service-release`, not landed. | high |
| `src/quota/InMemoryQuotaStore.ts` on `dev` | Quotas reset on restart and multiply per instance; the Firestore store is on `feat/service-release`, not landed. | medium |
| server `findPeriodWaterData` | Device filters are not checked against membership (`migration/SECURITY_FINDINGS.md` §1); fixed on `task/gilligan-release-p3-p4` (`ccc759e`), pushed, not deployed. CWA Old, whose organization id does not exist, stays withheld until Q6 treats it as null. | high |
| server `src/routes/userRoutes.ts:17,72`, `testDbRoutes.ts` | Unauthenticated user list, user lookup and database probe (`SECURITY_FINDINGS.md` §8); fixed on `fix/user-route-auth`, pushed, not deployed. | high |
| server `UserService.login` | An invited user with no password gets 500 (zod `password: Required`) instead of a 4xx; seen on the mirror, likely in production. | medium |
| `src/report/renderPdf.ts` | The PDF never states the last reading's age, so a pod silent for two weeks can read "Normal" (report audit #3). | high |
| `src/report/buildReportInput.ts` | `MIN_BUCKET_SAMPLES` against 1-hour buckets empties 1-day series on pods reporting twice an hour (report audit #4). | high |
| `gilligan_usage` retention (`feat/service-release`) | A TTL policy on `updatedAt` would delete the current day's counter; needs `expireAt`. | medium |
| server `findPeriodWaterData` | Slices an organization's labels to 10 for the `in` query, dropping pods past the tenth (pre-existing). | low |
| server `GilliganService.askQuestionGemini` | Calls the retired `gemini-pro`; production Gilligan fails every question and `gemini` is not a rollback (D9). | high |
| `scripts/judge.ts` on `dev` | Exits 0 and writes an empty summary when every call fails; fixed on `eval/wave1-corrections` (`e662fa0`), not landed. | medium |
| R4 judge, ungrounded dimension | Agreement with the reference grades is weak (any/none 78%, count kappa 0.23), so ungrounded rates are indicative only. | medium |
| R4 judge (`deepseek-v4-flash-0731`) | Returns an empty reply on a few percent of `--final` calls (34 attempts in E3); re-run until a pass reports 0 failed. | low |
| tools-off answers (`gpt-oss-120b`) | Can loop on malformed citation markers: one answer in R4's reranker capture emitted 807; the audit strips them from display, but the citation rate counts them. | low |
| tools-on answers | Withheld-history note dropped, water-type note misparaphrased, implausibly high dissolved oxygen not flagged (plan Q8). | medium |
| `test/unit/deviceApi.test.ts`, `test/unit/evalFixtures.test.ts` | Missing `quota_reports_exceeded`; leaked `/tmp/eval-fixtures-*` directories. Fixed on the hygiene branch, not landed; the old directories remain. | low |
| `../user-dashboard` `src/app/confirm-email` | Imports `confirmEmail`, which `services/auth` does not export; build reports "Attempted import error" (plan P5). | medium |
| `../user-dashboard` `src/app/gilligan/page.js` | `useSearchParams` outside Suspense deopts the page to client rendering. | low |
| citation contract | Citations carry only `source`, so a document shows as its address (plan U5). | low |
| `eval/fixtures-wave1/` | Slice-coverage overshoot: 84/90 turns have explanatory sources outside the ◆G9 slice. | medium |

## Active traps

- **Upstream history carries malware**; branch tips are clean. It runs on `next dev`, `next build` and `npm test`. Never check out `main`, `develop` or an old commit; scan with `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or branch switch.
- **`SENSOR_TOOL` and `REPORT_TOOL`**: on means live production reads; `.env` sets both `true`, so captures and judge runs must set both `false` explicitly on server and runner.
- Both servers read `.env` at boot only. `hybrid-slice-vector` needs the git-ignored embedding cache; a fresh worktree has no `node_modules`, `.env` or `data/` (link per the `run-local` skill). `EnterWorktree` cuts from `origin/main`; reset onto `dev`.
- Re-ingesting with a different tesseract build moves 12 chunk ids and voids labels; `resolveRetrievalLabels.ts` does not delete stale label files.
- Anything in `documents/` is ingested; keep the v2 PDF at the repo root.
- `.claude/settings.json` deny rules point at old OneDrive paths, so the upstream read-only guard is inert until the hygiene branch lands.
- The emulator mirror runs under the production project id because the server hard-codes it; without `FIRESTORE_EMULATOR_HOST` that server reaches the live database with application default credentials, which now exist on this machine.
- The server's integration suites (`test/setup/testDb.ts`) force `DB_ENVIRONMENT=qa` and connect to the real `qa-db`: never run them.
- Every `cer-gilligan` guard defaults to off or unlimited (quota, store, window, retrieval); a release environment file missing a variable fails open.
- Run Jest suites singly with `--runInBand`; use port 8010, never kill 8000.
- The device token is superadmin (5 pods) with no `exp` claim.
- Eval captures and judge runs need `--run=<id>`; the judge ledger has no answer hash. On `dev` a judge exit status of 0 does not prove calls succeeded (fixed on `eval/wave1-corrections`).
- `scores.csv` notes hold unquoted commas: edit rows line by line, never through a CSV library.
- Sandboxed sessions (Codex) may lack network and write access to upstream `.git`; they work in `/tmp` clones, which a restart can erase.
- Nothing is deployed; all testing is local.

## Where things live

- **Release**: [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md), [`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md), [`migration/GILLIGAN_FIRESTORE_FRAMEWORK.md`](migration/GILLIGAN_FIRESTORE_FRAMEWORK.md), [`migration/LIVE_TEST_DATA.md`](migration/LIVE_TEST_DATA.md).
- **Gilligan**: [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) (decisions D1-D12), [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md), [`migration/TASK_C_HANDOFF.md`](migration/TASK_C_HANDOFF.md), [`migration/CONVERSATION_QA_2026-09-24.md`](migration/CONVERSATION_QA_2026-09-24.md).
- **Environment and security**: [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md), [`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md), [`migration/SECURITY_FINDINGS.md`](migration/SECURITY_FINDINGS.md), [`migration/BACKEND_FIELDS.md`](migration/BACKEND_FIELDS.md).
- **Behaviour and decisions**: [`SPECS.md`](SPECS.md), [`timeline.md`](timeline.md), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md).
- **Evaluation**: [`EVAL_REBUILD.md`](EVAL_REBUILD.md) (full R4 state on `eval/wave1-corrections`), [`GRADING_GUIDE.md`](GRADING_GUIDE.md).
- **People**: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md), [`ARCHIVED.md`](ARCHIVED.md), house rules in [`../CLAUDE.md`](../CLAUDE.md) and `.claude/skills/`.
