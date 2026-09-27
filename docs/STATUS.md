# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-27 at `dev` `f9efb96` by the release orchestrator (L2 and hygiene landed, Q6 decisions, WaterDataRepository finding); otherwise as of 2026-09-26 at `61172a7`; R4 entries were updated 2026-09-27 by the R4 session at `eval/wave1-corrections` `a358bf2`, and L2 entries come from `docs/l2-inputs` (`f308ea3`).

## Start here

- **Gilligan release, September 30.** The task list, owners and dates are [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md) (task IDs such as Q1, S3, L5); where this file and the plan disagree, the plan wins. The user deploys.
  Background: [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md), then [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md).
- **Orchestration.** One session reviews each workstream's actual diff when it reports done, lands cer-demo branches on `dev` one at a time in dependency order, runs typecheck, lint and the touched suites singly after each merge, pushes `dev`, keeps the plan current, and pushes upstream only as new branches with the user's consent.
  Next: review the R4, dashboard, service, mirror and release-candidate sessions (all started) as they report, one at a time.
- **Eval (R4)** on `eval/wave1-corrections` (`a358bf2`, pushed, clean, not in `dev`). E3's reported result stays 1.01 on gold context, failing the Tier 2 gates; later numbers use the replacement judge `deepseek-v4p1-flash` and rubric v2 and compare only with each other.
  2026-09-27 round: GLM passed a tool-calling check on the fabricated mirror; `QUERY_REWRITE_FIRST_TURN` (off by default) and a tools-off prompt rule were added; `local-rerank` k=20 with both rewrites scored 1.11 / 1.17 against 1.07 / 1.06 but fails the refusal gate at about three times the cost per question, so the reranker is on hold.
  Next: the `local-vector` control capture that decides the reranker (about $0.50, awaiting approval), in `eval/reviews/phase3-2026-09-23/HANDOFF.md` "Next steps"; results in [`EVAL_REBUILD.md`](EVAL_REBUILD.md) from "Follow-up rewriting and keyword search, offline" on, both on that branch.
- **Answer quality.** Q3-Q6 are implemented and reviewed on `task/q3-q5` (`e8bbaa9`, pushed, not on `dev`); the rules are in its `SPECS.md` and the 2026-09-26 timeline row. Server Q6 is `task/gilligan-cwa-old` (`510cf00`, pushed).
  2026-09-27: a pod with no GPS in its history now counts as never having moved (`ac8a166`, pushed; `sensorChat` 17/17). Landed on `dev` 2026-09-27 (`abe4169`); 17 touched suites pass singly. The user may still run `scripts/coordinateAudit.ts` (read-only) to find pods whose GPS dropped out part-way; a fix for any it finds goes on `dev`. Q9 and the 413 are another chat's (`task/q9-413`).
- **Deployment inputs (L2).** Landed on `dev` 2026-09-27 (`6f4d060`): the plan's L2 answers, runbook §2 and a new §2.2 "What differs from the mirror run", and three timeline rows. The runbook itself (L1) is on `dev` (`fa4103f`).
  Next: the user sends Michael the runbook §2.1 list; the user cannot deploy any service until he restores "act as".
- **Upstream.** Pushed as new branches: server `feature/gilligan-rag-assistant`, `task/gilligan-release-p3-p4`, `fix/user-route-auth`, `feat/service-key`, `task/gilligan-cwa-old`; dashboard `feature/gilligan-rag-assistant`, `task/gilligan-release-p3-p4`. PRs are held back ([`migration/UPSTREAM_PR_BODIES.md`](migration/UPSTREAM_PR_BODIES.md)); the server needs one combined release commit before L6. The user merges and deploys after the demo.
  The malware did run on a build machine; the user was told every credential was rotated. Build only from the clean feature branches ([`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md)).

## In flight

- **Ready to land on `dev`**: `docs/gcp-test-env` (`5ab30e8`, pushed: mirror setup, ticket, bot, phase 1 results); `docs/firestore-testing-plan` (`60befd4`, partly superseded).
- **Service (S1-S4, Q7)**: `feat/service-release` (`cc8a300`), no active session. Before landing: `expireAt` on usage documents, a longer emulator concurrency timeout, and a `.gcloudignore` that uploads `data/` for Cloud Build (runbook §3.3).
- **Dashboard (U1-U6, P5, checklist X1 and X2)**: `task/gilligan-ux` in `~/code/clean-earth-rovers/worktrees/dashboard-ux`, not started.
- **Mirror end-to-end (T2 offline)**: phase 1 on 2026-09-25, 46 scenarios, 43 pass (A1/D4 empty-organization user sees every pod, A3 invited-user 500, and a 413 past about 100 KB of history); phase 2 waits for Q3-Q6. Next session: the user's merged prompt A (seed CWA Old and a moved pod, cherry-pick `510cf00` and `feat/firestore-config` with `-x`, $10 budget). Unprovable items go in [`migration/LIVE_TEST_LIST.md`](migration/LIVE_TEST_LIST.md).
- **Release candidate**: the user's prompt B (one server and one dashboard release branch, the mirror rebuilt from it, a production-mode local run), not started.
- **End-to-end checklist** ([`migration/E2E_CHECKLIST.md`](migration/E2E_CHECKLIST.md)): level-1 baseline 2026-09-26, 25 pass, 5 fail, 1 N/A, about $0.22; findings routed in the plan (dashboard, R4, Q9).

## Last session

- Orchestrator: recorded the user's decisions (CWA Old null, current site only, mirror-first testing, $10 mirror budget, the Q3-Q6 review rules) and started `LIVE_TEST_LIST.md`; pushed the server and dashboard branches above.
- Landed on `dev`: runbook, checklist, mirror parity, the Codex manual testing guide (rescued from `/tmp`); reviewed Q6 and Codex's Q3-Q5 and fix round, fixed the `generateReport` stubs; typecheck, lint and 20 touched suites pass except `sensorChat` 16/17 (Algalita GPS).
- The auto-mode classifier refused the live coordinate read despite chat approval; the user runs it. Orchestrator spend: none.
- L2 session: found the user's Editor role replaced on 2026-09-23 (no "act as") and the `cer-ui` trigger building the infected `main`; a production read found 0 of 27 users with an empty organization.
- R4 (2026-09-27): ran approved steps 1 and 3-6 (step 2 not run); the user kept the tools-off rule and allowed the mirror login; about $2.25 spent, R4 about $20.65 of $30 (estimated, the judge's rate is not in `prices.ts`).

## Working tree

- `dev` `f9efb96` plus this STATUS, plan, timeline and manual-guide update, pushed; `_EXIT_CRITERIA.md`, `eval/grading/phase-1d-wave1-fixture-review.html`, `review-marked-up.html` and the root v2 PDF stay untracked on purpose.
- cer-demo worktrees: `wave1-corrections` (R4), `q3-q5`, `feat+service-release`, `l2-inputs`, `mirror-parity`, `gcp-test-env`, `firestore-plan`, `firestore-mirror` (no commits), `hygiene`. Merged and removable: `gilligan-runbook`, `cwa-old`, `answer-quality-q1`, `token-cap`, `upstream-publish`; Codex's `/tmp/cer-q3-q5` and `/tmp/cer-manual-testing-guide` are preserved in branches.
- Upstream: server `local` `d12ad6d` and dashboard `local` `fd103a0` with git-ignored `.env` files; worktrees under `~/code/clean-earth-rovers/worktrees/`: `server-publish`, `server-service-key`, `server-user-auth`, `server-cwa-old`, `server-firestore-config` (`0003170`, unpushed), `dashboard-publish`, `dashboard-ux`; the server's `.worktrees/mirror` (`mirror/e2e-p3` `37fec03`).
- Local processes: Firestore emulator :8080 (hub :4400) and something on :3000; the mirror's server :5101 and cer-demo :8010 are down.
- Tools: `gcloud`, `firebase-tools` and Java 21 are installed (`LOCAL_STACK.md` on `docs/gcp-test-env`); test project `cer-demo-2026` with database `gilligan-test`.
- Git-ignored or untracked restored inputs: `node_modules/`, `.env`, the corpus PDFs, `.ocr_cache/`, `data/corpus/`, `data/embeddings/cache.json`. Still missing: `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/`, `serviceAccountKey.json`.

## Open work

- User: run the coordinate audit (`cd .claude/worktrees/q3-q5 && ln -sf ../../../.env .env && npx --no-install ts-node scripts/coordinateAudit.ts`); send Michael runbook §2.1 and tell him not to use the repositories' deploy scripts; get Firestore access or choose the Sep 28 fallback (one instance, in-memory counts); start the dashboard, service, mirror (A) and release-candidate (B) sessions; grade `data/e2e/phase1-2026-09-25-review.html`; approve the demo, then S5; R4: approve the control capture (about $0.50); decide `QUERY_REWRITE` and `QUERY_REWRITE_FIRST_TURN` for launch (both recommended on), the production retrieval setting and the reranker (recommended unpinned `local-vector` k=20 until the control), the judge default in code, and E4's per-class caveats or refusals.
- User (decisions pending 2026-09-27): the coordinate audit (optional, read-only); the census commit and run (blocked for the agent by the auto-mode classifier); `scripts/censusFirestore.ts` (untracked, 24 lint errors, in `.claude/worktrees/firestore-mirror`); who adds the emulator test timeout on `feat/service-release`; Firestore access or the fallback, decided Sep 28 with the supervisor.
- Agent: land the ready branches; land `task/q3-q5` after the audit decision, then run Q9; keep the plan current; on Sep 28 move open "should" tasks after launch and freeze the release candidate (L4).
- Agent (R4): the handoff's next steps (control capture, GLM refusal fix, catalogue-prompt capture, the judge's rate), then E4, E6 and the R4 report, on `eval/wave1-corrections`; at landing, switch the runbook to `glm-5p3-flash`, whose tool check passed (handoff "Edits wanted").
- Standing: re-seed Firestore needs approval; the slice-coverage overshoot and `ADVICE_TIER` design wait for after launch.

## Unfixed defects

| where | defect | severity |
|---|---|---|
| `Dockerfile` + `.dockerignore` on `dev` | The image excludes `data/`, so it ships without corpus or embedding cache; fixed on `feat/service-release`, not landed; Cloud Build also needs a `.gcloudignore`. | high |
| `src/quota/InMemoryQuotaStore.ts` on `dev` | Quotas reset on restart and multiply per instance; the Firestore store is on `feat/service-release`, not landed. | medium |
| server `findPeriodWaterData` | Device filters not checked against membership (`migration/SECURITY_FINDINGS.md` §1): fixed on `task/gilligan-release-p3-p4`; CWA Old as null on `task/gilligan-cwa-old`; both pushed, not deployed. | high |
| server `src/routes/userRoutes.ts:17,72`, `testDbRoutes.ts` | Unauthenticated user list, user lookup and database probe (`SECURITY_FINDINGS.md` §8); fixed on `fix/user-route-auth`, pushed, not deployed. | high |
| server `UserService.login` | An invited user with no password gets 500 (zod `password: Required`) instead of a 4xx; seen on the mirror, likely in production. | medium |
| server `assignOrganization` | A non-superadmin with an empty organization is unfiltered and sees every pod, also through Gilligan (mirror A1, D4); no production user has one. | medium |
| Cloud Build trigger `8ad67b17…` (`cer-ui`) | Builds and deploys `cer-ui` on every push to the dashboard's infected `main`; Michael disables it (runbook §2.1). | high |
| cer-demo `src/app.ts` `express.json()` and the server relay | The whole chat history is sent each turn, so the 100 KB body limit returns 413 on long chats (mirror finding 5; Q9). | medium |
| `src/report/renderPdf.ts`, `src/report/buildReportInput.ts` | The PDF never states the last reading's age, and 1-day series empty on pods reporting twice an hour (report audit #3 and #4; Q9). | high |
| dashboard `src/app/shared/gilligan-provenance.js` | Tool notes written for the model show under every data answer, and a retried tool call still shows "Tool failed" (checklist X1, X2). | medium |
| tools-on answers, `src/devices/plausibility.ts` | Silent pods left out of "which pods are online" (C1); a pH of 2.07 passes plausibility (D1); "How does temperature affect DO?" refused after retrieval pulls a salinity table (B3, R4). | medium |
| `gilligan_usage` retention (`feat/service-release`) | A TTL policy on `updatedAt` would delete the current day's counter; needs `expireAt`. | medium |
| server `findPeriodWaterData` | Slices an organization's labels to 10 for the `in` query, dropping pods past the tenth (pre-existing). | low |
| server `GilliganService.askQuestionGemini` | Calls the retired `gemini-pro`; production Gilligan fails every question and `gemini` is not a rollback (D9). | high |
| `scripts/judge.ts` on `dev` | Exits 0 and writes an empty summary when every call fails; fixed on `eval/wave1-corrections` (`e662fa0`), not landed. | medium |
| R4 judge, ungrounded dimension | Agreement with the reference grades is weak (any/none 78%, count kappa 0.23), so ungrounded rates are indicative only. | medium |
| `src/eval/judge/runner.ts` `DEFAULT_JUDGE_MODEL` | Still `deepseek-v4-flash-0731`, which Fireworks now answers with 404; its replacement's rate is not in `prices.ts`. | medium |
| `src/prompt/promptBuilder.ts` `buildMessages` | CONTEXT is a second system message, which `minimax-m3` on Fireworks drops; any new model needs a two-system-message probe. | low |
| tools-off answers (`gpt-oss-120b`) | Can loop on malformed citation markers: one answer in R4's reranker capture emitted 807; the audit strips them from display, but the citation rate counts them. | low |
| tools-on answers | Withheld-history note dropped, water-type note misparaphrased, implausibly high dissolved oxygen not flagged (plan Q8); "anything in the last 24 hours?" answered yes for a pod silent 30 hours, since the tool anchors relative windows to its last report (R4 GLM tool check). | medium |
| tools-off answers (`glm-5p3-flash`) | Fail the refusal-integrity gate: 1-2 of 8 must-refuse turns answered on gold context, 2 with the reranker, taking a figure from a retrieved passage (R4, `eval/wave1-corrections`). | medium |
| `/tmp/eval-fixtures-*` | 131 directories leaked before the hygiene fix (landed `f9efb96`) remain. | low |
| server `src/schemas/waterData.schema.ts` via `WaterDataRepository` | Wants string `lat`, `lon`, `bat` and `time_meas`; production rows carry numeric `lat`/`lon` and no `bat`, so the legacy unauthenticated `/water-data`, `/device` and `/duration/*` routes fail on real rows (mirror P5). Pre-existing (unchanged since `0c91404`); Gilligan and the dashboard use `/water/*`, which does not parse. Loosening the schema alone would re-open `SECURITY_FINDINGS.md` §5 item 2, so fix it by removing or authenticating those routes. | low |
| `../user-dashboard` `src/app/confirm-email` | Imports `confirmEmail`, which `services/auth` does not export; build reports "Attempted import error" (plan P5). | medium |
| `../user-dashboard` `src/app/gilligan/page.js` | `useSearchParams` outside Suspense deopts the page to client rendering. | low |
| citation contract | Citations carry only `source`, so a document shows as its address (plan U5). | low |
| `eval/fixtures-wave1/` | Slice-coverage overshoot: 84/90 turns have explanatory sources outside the ◆G9 slice. | medium |

## Active traps

- **Upstream history carries malware**; branch tips are clean. It runs on `next dev`, `next build` and `npm test`. Never check out `main`, `develop` or an old commit; scan with `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or branch switch.
- **`SENSOR_TOOL` and `REPORT_TOOL`**: on means live production reads; `.env` sets both `true`, so captures and judge runs must set both `false` explicitly on server and runner.
- `PREDECESSOR_PERIOD_HANDOFF` (on `task/q3-q5`) stays off until the patched server takes all cer-api traffic; with an unpatched period route it returns another organization's history.
- The user's production roles lack `iam.serviceAccounts.actAs` (since 2026-09-23), so no service can be deployed until Michael restores it; production reads go through the user, and the auto-mode classifier refuses them from this agent even with chat approval.
- Both servers read `.env` at boot only. `hybrid-slice-vector` needs the git-ignored embedding cache; a fresh worktree has no `node_modules`, `.env` or `data/` (link per the `run-local` skill). `EnterWorktree` cuts from `origin/main`; reset onto `dev`.
- Re-ingesting with a different tesseract build moves 12 chunk ids and voids labels; `resolveRetrievalLabels.ts` does not delete stale label files.
- Anything in `documents/` is ingested; keep the v2 PDF at the repo root.
- The mirror runs under the production project id because the server hard-codes it, and application default credentials exist on this machine; `feat/firestore-config` (`0003170`, unpushed) takes the project from the environment once the mirror picks it.
- The server's integration suites (`test/setup/testDb.ts`) force `DB_ENVIRONMENT=qa` and connect to the real `qa-db`: never run them.
- Every `cer-gilligan` guard defaults to off or unlimited (quota, store, window, retrieval); a release environment file missing a variable fails open.
- Run Jest suites singly with `--runInBand`; use port 8010, never kill 8000.
- The device token is superadmin (6 pods in 3 organizations on 2026-09-26; Marina Park DataPod™ silent since July 2025) with no `exp` claim.
- R4 judge runs must pass `--judge-model=accounts/fireworks/models/deepseek-v4p1-flash`; `DEFAULT_TOP_K` is a code constant, so an env var of that name is ignored; `gold-context` must run with `QUERY_REWRITE` off; GLM rejects reasoning off, so use `LLM_REASONING_EFFORT=low`.
- Eval captures and judge runs need `--run=<id>`; the judge ledger has no answer hash. On `dev` a judge exit status of 0 does not prove calls succeeded (fixed on `eval/wave1-corrections`).
- `scores.csv` notes hold unquoted commas: edit rows line by line, never through a CSV library.
- Sandboxed sessions (Codex) may lack network and write access to upstream `.git`; they work in `/tmp` clones, which a restart can erase.
- Nothing is deployed; all testing is local.

## Where things live

- **Release**: [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md), [`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md), [`migration/GILLIGAN_FIRESTORE_FRAMEWORK.md`](migration/GILLIGAN_FIRESTORE_FRAMEWORK.md), [`migration/LIVE_TEST_LIST.md`](migration/LIVE_TEST_LIST.md), [`migration/E2E_CHECKLIST.md`](migration/E2E_CHECKLIST.md), [`migration/GILLIGAN_MANUAL_TEST_GUIDE.md`](migration/GILLIGAN_MANUAL_TEST_GUIDE.md), [`migration/MIRROR_PRODUCTION_PARITY.md`](migration/MIRROR_PRODUCTION_PARITY.md).
- **Gilligan**: [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) (decisions D1-D12), [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md), [`migration/TASK_C_HANDOFF.md`](migration/TASK_C_HANDOFF.md), [`migration/CONVERSATION_QA_2026-09-24.md`](migration/CONVERSATION_QA_2026-09-24.md).
- **Environment and security**: [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md), [`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md), [`migration/SECURITY_FINDINGS.md`](migration/SECURITY_FINDINGS.md), [`migration/BACKEND_FIELDS.md`](migration/BACKEND_FIELDS.md).
- **Behaviour and decisions**: [`SPECS.md`](SPECS.md), [`timeline.md`](timeline.md), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md).
- **Evaluation**: [`EVAL_REBUILD.md`](EVAL_REBUILD.md) (full R4 state on `eval/wave1-corrections`), [`GRADING_GUIDE.md`](GRADING_GUIDE.md).
- **People**: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md), [`ARCHIVED.md`](ARCHIVED.md), house rules in [`../CLAUDE.md`](../CLAUDE.md) and `.claude/skills/`.
