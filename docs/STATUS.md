# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-27 by the release coordinator as the baseline for a full reset of every chat, after a roundup of all active sessions; `dev` at the commit that carries this file.

## Start here

- **Gilligan release, September 30.** Tasks, owners and dates are [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md) (IDs such as Q10, S3, L5); where this file and the plan disagree, the plan wins. The user deploys.
  Background: [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md), then [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md).
- **Where we are.** Features are built and almost all landed on `dev`; the mirror has run most checks and found defects that need a fix round (plan Q10, Q11); the release candidate must be rebuilt from `dev` (rc2) before the Sep 28 freeze; nothing is deployed, and deployment waits on Michael's one-time setup.
  Critical path: Michael's setup, then cer-gilligan no-traffic deploy (L5, Sep 28), then staged server and dashboard plus the supervisor demo (L6, L7, Sep 29), then smoke and traffic (L8, L9, Sep 30).
- **Coordination rules.** One coordinator is the only writer of `dev`, this file, the plan and the manual guide; every other chat works on its own branch and worktree and reports commit IDs to the coordinator, who reviews the actual diff and lands it. Upstream pushes are new branches only, each with the user's consent in chat.

## Last session

- Coordinator (2026-09-27): landed `docs/l2-inputs`, the hygiene branch, `task/q3-q5` (Q3-Q6, no-GPS rule), `task/gilligan-ux-contract` (reader notes, citation titles), `feat/service-release` (merged with R4's reasoning options in `LlmService`), `task/q9-413` and `docs/gcp-test-env`; R4 landed `eval/wave1-corrections` itself. Typecheck, lint and touched suites pass singly after each merge.
- User decisions recorded in `timeline.md`: superadmins keep merged-predecessor history withheld; a missing or empty organization counts as null (server test `9751f8f`, pushed); a pod with no GPS counts as never moved; launch counts usage in Firestore; E4 becomes a standing dashboard caveat.
- Manual guide: section K, a "What it checks" column, every session's checks, demo and staged-smoke paths. Plan: Q10 and Q11 for mirror findings 6-11.
- Roundup of every active chat for a full reset; coordinator spend: none.

## Open work

Each item names the chat that owns it after the reset.

- **Coordinator (restart).** Land `cloud/q9-logic` (`bc097e1`) then `cloud/q9-c1-d1` (`ad7eec9`) after the mirror reruns C1 and D1; land the fix round's branch; review server `fix/invited-login` (`f7dec3c`) and the Q11 branch; keep this file, the plan and the guide current; tell the release candidate when `dev` is final for rc2; on Sep 28 move open "should" tasks after launch.
  Do not land `docs/firestore-testing-plan` (`60befd4`): the mirror and L2 docs supersede it; keep it as history.
- **Fix round (new chat).** Plan Q10 on a branch from `dev`: mirror findings 6 (a moved pod's answer and PDF summary claim the full period), 8 (broken-pod referral declined instead of sales@cleanearthrovers.com) and 10 (a fresh-water survivor judged on a salt-water predecessor's conductivity, Action Required); recheck 7 on `dev` first (that run paired the dashboard with a cer-demo that sent no reader notes).
  Plan Q11 on a new server branch: scope the CSV export by organization like `findPeriodWaterData` (finding 11).
  Also: `src/report/buildReportInput.ts:548` returns the model-facing site note as its error; `get_pod_thresholds` has no reader note for rejected (unset or inverted) limits; Q9 follow-ups (calibration notes still say "sensor rails"; a pH limit outside 3-12 can never be crossed and nothing warns; a stale `lastReadingAt` comment in `src/report/types.ts`; the PDF measures reading age from its own clock; `Math.min(...spread)` on very large arrays in `excluded_implausible_min/max`); `.env.example` near line 209 says to keep `DEFAULT_RETRIEVAL` as stub but sets `firestore-direct`.
- **Release candidate (restart; L4, prompt B).** Local, nothing pushed: server `release/gilligan-2026-09-30` `122136d` (local `d12ad6d` plus `cwa-old` `9751f8f`, `user-route-auth` `f9607bd`, `service-key` `9ef59b7`, `firestore-config` `0003170`, `citation-title` `b443e41`, `invited-login` `f7dec3c`), server `mirror/release-rc1` `d1821bd`, dashboard `release/gilligan-2026-09-30` `9e18555`, cer-demo `release/rc1` `5367164` (stale).
  Next: rc2 from the final `dev`, dashboard `817a7c2` plus U7, and the server release plus Q11; the production-mode run (guide P8, P1-P7, G1-G3); `RELEASE_CANDIDATE.md`; share ports with the mirror (the mirror stack holds 8080, 5101, 8010 and 3000).
  The supervisor brief `docs/migration/SUPERVISOR_BRIEF.html` (worktree `supervisor-brief`, branch `docs/supervisor-brief`) is uncommitted because the auto-mode classifier denied its commit; the user reviews it, then it is committed and landed.
- **Dashboard (restart; U1-U7).** `task/gilligan-ux` `817a7c2` in `~/code/clean-earth-rovers/worktrees/dashboard-ux`, reviewed (build completes, provenance 6/6), not pushed. Next: U7, the standing caveat under every answer that cites documents, once the user approves its wording; push `task/gilligan-ux` and server `task/gilligan-citation-title` with consent; recheck X1, X2 and pod-named notes on the release candidate.
- **Mirror end-to-end (restart one chat; T2 offline).** Stack: server `mirror/e2e-p3` `1ef21a7` (local, unpushed: `510cf00` as `3e7c3fb`, fixtures, project `demo-cer-mirror`), cer-demo `test/e2e-rc` `77cd4c9` (local), dashboard worktree `dashboard-e2e` at `9e18555`. Results: [`migration/GILLIGAN_E2E_RESULTS_2026-09-27.md`](migration/GILLIGAN_E2E_RESULTS_2026-09-27.md); about $2.56 of $10 spent.
  Uncommitted in `.claude/worktrees/gcp-test-env`: that results file's M11 row and finding 11; commit it on `docs/gcp-test-env` for the coordinator to land.
  Next: C1 and D1 on a `dev` + Q9 stack (about $0.04, the user approves); groups B, D, E, H and I (about $0.50); recheck finding 7; phase 2 only if the user asks; move to `dev` `5922109` or later so reader notes show; settle with the release candidate whether `1ef21a7`'s `MIRROR_PROJECT_ID` gives way to `0003170` (`mirror/release-rc1` already combines them); rewrite the manual guide's setup section for the 2026-09-27 stack (delegated by the coordinator). Harbor admin's allowance resets at 00:00 UTC.
- **Deploy assist (new chat, once Michael's setup is done; L5-L8).** Runbook [`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md) §2.1, §3 and §4.1.
- **Stop:** the Sep 24-25 orchestrator (`gilligan release reconciliation`), the Q9 orchestrator (`cer-demo-51`; its work passes to the coordinator and the fix round), R4 (`cer-demo-84`), the service chat (`cer-demo-49`), the duplicate mirror chat (`mirror project setup`), and `cer-demo-c1` (unreachable).

- User: **Michael (blocks every deploy).** "Act as" on the compute account is restored (checked 2026-09-27). Still open: create `cer-gilligan-runtime`; create the Fireworks secret and grant the runtime account access; create the dedicated `gilligan` Firestore database and its grants; a TTL policy on `gilligan_usage.expireAt`, never `updatedAt`; disable the `cer-ui` trigger `8ad67b17`, which is still enabled. The user lacks `iam.serviceAccounts.create`, `setIamPolicy`, `secretmanager.secrets.create` and `datastore.databases.create`.
- User: **Launch blockers to confirm:** fix findings 11 (cross-organization CSV export), 6 and 10 before launch (recommended); 8 should; 9 is likely acceptable (a superadmin may see a retired pod by itself).
- User: **Pushes (consent):** dashboard `task/gilligan-ux`; server `task/gilligan-citation-title`, `fix/invited-login`, the Q11 branch, the mirror fixtures (`1ef21a7`), and the combined server release commit before L6.
- User: **Approvals:** U7 wording ("Answers draw on document excerpts and may not cover every step; check the cited sections before acting."); E5, the tools-on live smoke; the mirror's C1 and D1 rerun and its remaining groups; the release candidate's delta test (about $0.10); grade the mirror review sheets (`data/e2e/`).
- User: **Supervisor, Sep 28:** the standing caveat in place of refusals for weak answer classes (E4, D3); the pH 3-12 plausibility band; the demo date (L7, Sep 29) and which Fireworks key it uses; the user-route exposure (`SECURITY_FINDINGS.md` §8); Firestore access for cer-gilligan (launch uses the Firestore store, decided 2026-09-27).
- User: **Optional:** the coordinate audit (`scripts/coordinateAudit.ts`, read-only, finds pods whose GPS dropped out part-way); `scripts/censusFirestore.ts` (untracked in `.claude/worktrees/firestore-mirror`, lint errors; commit to `docs/mirror-parity` or drop; the classifier blocked the agent); removing merged worktrees (`wave1-corrections` needs `--force` for its ignored `.env`).

## Working tree

- `dev` is pushed and level with `origin/dev`; `_EXIT_CRITERIA.md`, `eval/grading/phase-1d-wave1-fixture-review.html`, `review-marked-up.html` and the root v2 PDF stay untracked on purpose.
- cer-demo worktrees still in use: `gcp-test-env` (mirror, uncommitted results edit), `e2e-rc` (`test/e2e-rc`), `release-candidate` (`release/rc1`), `supervisor-brief` (uncommitted brief), `firestore-mirror` (untracked census script). Merged and removable: `q3-q5`, `feat+service-release`, `gilligan-ux-contract`, `wave1-corrections`, `q9-413`, `l2-inputs`, `hygiene`, `gilligan-runbook`, `cwa-old`, `answer-quality-q1`, `token-cap`, `upstream-publish`, `mirror-parity`, `firestore-plan`.
- Upstream: server `local` `d12ad6d`, dashboard `local` `fd103a0`; worktrees under `~/code/clean-earth-rovers/worktrees/` include `server-release`, `server-release-mirror`, `server-citation-title`, `server-invited-login`, `server-cwa-old`, `dashboard-ux`, `dashboard-e2e`, `dashboard-release`; the server's `.worktrees/mirror` is `mirror/e2e-p3` `1ef21a7`.
- Local processes: the mirror's Firestore emulator :8080 (holds the 2026-09-27 rerun's chats and counts) and dashboard :3000 are running.
- Git-ignored restored inputs: `node_modules/`, `.env`, corpus PDFs, `.ocr_cache/`, `data/corpus/`, `data/embeddings/cache.json`. Still missing: `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/`, `serviceAccountKey.json`.

## Unfixed defects

| where | defect | severity |
|---|---|---|
| server `WaterAnalyticsController.exportCsv` | Any logged-in user can export any pod's readings as CSV (mirror finding 11; plan Q11); likely in production. | high |
| cer-demo answers and PDF | A moved pod's answer, PDF title and summary claim the full period though values are current-site only (finding 6; Q10). | high |
| cer-demo merged history | A fresh-water survivor is judged on a salt-water predecessor's conductivity and reads Action Required (finding 10; Q10). | high |
| `release/rc1`, `test/e2e-rc` | Pair dashboard `9e18555`, which shows only reader notes, with a cer-demo that sends none; fixed on `dev` since `5922109`, so rc2 and the mirror must move to it. | high |
| Cloud Build trigger `8ad67b17…` (`cer-ui`) | Builds and deploys `cer-ui` on every push to the dashboard's infected `main`; still enabled. | high |
| server `GilliganService.askQuestionGemini` | Calls the retired `gemini-pro`; production Gilligan fails every question and `gemini` is not a rollback (D9). | high |
| server `findPeriodWaterData`, user routes | Membership check, CWA Old as null and the unauthenticated user routes are fixed on pushed branches and in the release branch, not deployed. | high |
| tools-on answers, `src/devices/plausibility.ts`, report | Silent pods left out of "which pods are online" (C1), pH 2.07 passes plausibility (D1), no reading age in the PDF (#3), empty 1-day series (#4): fixed on `cloud/q9-logic` and `cloud/q9-c1-d1`, not landed. | high |
| cer-demo referrals | "My pod is broken" is declined instead of referred to sales@cleanearthrovers.com (finding 8; Q10). | medium |
| server `UserService.login` | An invited user with no password gets 500; fixed on `fix/invited-login` `f7dec3c`, not pushed. | medium |
| server `assignOrganization` | A non-superadmin with an empty organization sees every pod (mirror A1, D4); no production user has one. | medium |
| tools-on answers | Withheld-history note dropped, water-type note misparaphrased, high dissolved oxygen not flagged (Q8); "anything in the last 24 hours?" answered yes for a pod silent 30 hours. | medium |
| answers (`glm-5p3-flash`) | Refusal wording varies between runs (8 of 8 exact, then 6 of 8); cross-document answers score 0.83. | medium |
| R4 judge, ungrounded dimension | Weak agreement with reference grades (any/none 78%, kappa 0.23), so ungrounded rates are indicative only. | medium |
| `eval/fixtures-wave1/` | Slice-coverage overshoot: 84/90 turns have explanatory sources outside the ◆G9 slice. | medium |
| manual guide setup section | Describes the 2026-09-26 stack (production project id, `local` ancestry check); the mirror chat rewrites it. | medium |
| `src/report/buildReportInput.ts:548` | A report with no usable readings returns the model-facing site note, shown as "Tool failed: … best_lat and best_lon …". | low |
| `src/tools/getPodThresholds.ts` | Rejected (unset or inverted) limits have no reader note. | low |
| server `src/schemas/waterData.schema.ts` | Rejects production-shaped rows, so the legacy unauthenticated `/water-data`, `/device` and `/duration/*` routes fail on real data; after launch, remove or authenticate those routes rather than loosen the schema (`SECURITY_FINDINGS.md` §5 item 2). | low |
| server `findPeriodWaterData` | Slices an organization's labels to 10 for the `in` query (pre-existing; guide M14). | low |
| `src/prompt/promptBuilder.ts` `buildMessages` | CONTEXT is a second system message, which `minimax-m3` drops; probe any new model. | low |
| tools-off answers (`gpt-oss-120b`) | Can loop on malformed citation markers. | low |
| `../user-dashboard` `src/app/gilligan/page.js` | `useSearchParams` outside Suspense deopts the page to client rendering. | low |
| `/tmp/eval-fixtures-*` | 131 directories leaked before the hygiene fix remain. | low |

## Active traps

- **Upstream history carries malware**; branch tips are clean. It runs on `next dev`, `next build` and `npm test`. Never check out `main`, `develop` or an old commit; scan with `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or branch switch.
- **`SENSOR_TOOL` and `REPORT_TOOL`**: on means live production reads; `.env` sets both `true`, so captures and judge runs must set both `false` explicitly.
- `PREDECESSOR_PERIOD_HANDOFF` stays off in production until the patched server takes all cer-api traffic; the mirror sets it `true` because its server is patched.
- Production reads go through the user: the auto-mode classifier refuses them from agents even with chat approval, and it also refused one worktree inspection and one commit today.
- The mirror now runs under a `demo-` project (`demo-cer-mirror`) on `1ef21a7` and `d1821bd`; older stacks used the production project id with the emulator host set. Application default credentials exist on this machine, so a missing emulator host would reach production.
- The server's integration suites (`test/setup/testDb.ts`) connect to the real `qa-db`: never run them. Its Jest `roots` spans sibling worktrees: run server unit suites with `FIRESTORE_EMULATOR_HOST=127.0.0.1:1`. The server `.env` cannot be copied (deny rule).
- Every `cer-gilligan` guard defaults to off or unlimited (quota, store, window, retrieval); a release environment file missing a variable fails open. Set 20 messages, 5 reports and 1,000,000 tokens explicitly.
- Both servers read `.env` at boot only; a fresh worktree has no `node_modules`, `.env` or `data/` (link per the `run-local` skill). `EnterWorktree` cuts from `origin/main`; reset onto `dev`.
- Run Jest suites singly with `--runInBand`; use port 8010, never kill 8000. The mirror stack holds 8080, 5101, 8010 and 3000; coordinate before starting another stack.
- R4 judge runs must pass `--judge-model=accounts/fireworks/models/deepseek-v4p1-flash`; GLM rejects reasoning off, so use `LLM_REASONING_EFFORT=low`; `gold-context` runs with `QUERY_REWRITE` off; captures and judge runs need `--run=<id>`.
- Re-ingesting with a different tesseract build moves 12 chunk ids and voids labels. Anything in `documents/` is ingested; keep the v2 PDF at the repo root.
- `scores.csv` notes hold unquoted commas: edit rows line by line.
- The device token is superadmin with no `exp` claim.
- Nothing is deployed; all testing is local.

## Where things live

- **Release**: [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md), [`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md), [`migration/GILLIGAN_MANUAL_TEST_GUIDE.md`](migration/GILLIGAN_MANUAL_TEST_GUIDE.md) (checks, demo and smoke paths), [`migration/LIVE_TEST_LIST.md`](migration/LIVE_TEST_LIST.md), [`migration/E2E_CHECKLIST.md`](migration/E2E_CHECKLIST.md), [`migration/GILLIGAN_E2E_RESULTS_2026-09-27.md`](migration/GILLIGAN_E2E_RESULTS_2026-09-27.md), [`migration/GILLIGAN_FIRESTORE_FRAMEWORK.md`](migration/GILLIGAN_FIRESTORE_FRAMEWORK.md), [`migration/MIRROR_PRODUCTION_PARITY.md`](migration/MIRROR_PRODUCTION_PARITY.md).
- **Gilligan**: [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) (decisions D1-D12), [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md).
- **Environment and security**: [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md), [`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md), [`migration/SECURITY_FINDINGS.md`](migration/SECURITY_FINDINGS.md), [`migration/BACKEND_FIELDS.md`](migration/BACKEND_FIELDS.md).
- **Behaviour and decisions**: [`SPECS.md`](SPECS.md), [`timeline.md`](timeline.md), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md).
- **Evaluation**: [`../eval/reviews/phase3-2026-09-23/R4_REPORT.md`](../eval/reviews/phase3-2026-09-23/R4_REPORT.md), [`EVAL_REBUILD.md`](EVAL_REBUILD.md), [`GRADING_GUIDE.md`](GRADING_GUIDE.md).
- **People**: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md), [`ARCHIVED.md`](ARCHIVED.md), house rules in [`../CLAUDE.md`](../CLAUDE.md) and `.claude/skills/`.
