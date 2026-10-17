# Status

Updated 2026-10-17 by the coordinator after landing the docs overhaul proposal; the coordinator's open items are in [`migration/COORDINATOR_HANDOFF_2026-10-15.md`](migration/COORDINATOR_HANDOFF_2026-10-15.md).
Current state and next steps only; history is `git log -p docs/STATUS.md`; never cite this file from code or other docs.

## Start here

- **Gilligan is live (2026-10-07).** cer-gilligan `00004-r5q`, cer-api `00081-qon` (tag `rc2`) and cer-ui `00070-dax` (tag `rc1`) take all traffic; record in [`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md) §7 items 10-19. Nothing on `dev` after it is deployed.
- **Next release** (user decision 2026-10-15, [`timeline.md`](timeline.md)): the data-skepticism fix, report omission and the flagging rework ship together once Michael has answered the rework's questions; `dev` is not deployed alone before then. `dev` already carries v2 flagging, report options (`omit`), the data-skepticism fix and the coverage line. Stage with `release/deploy-cer-gilligan.sh` (runbook §6.1; `IMAGE` and `TAG` required), then move `main` to the deployed commit ([`timeline.md`](timeline.md) 2026-10-14).
- **Flagging rework** (Michael's 2026-10-12 decisions): built on `task/flagging-share-window` (worktree `flagging-share-window`, pushed `c5d90df`), not landed, waiting on Michael's answers to stakeholder questions 28-35 (sent 2026-10-15). Its commit `9c57aa9` deleted about 680 lines of `SPECS.md` (§10.7-§19): restore dev's sections before landing. Its own handoff, `docs/migration/FLAGGING_REWORK_HANDOFF_2026-10-13.md`, is on that branch. It edits this file, `timeline.md`, `SPECS.md` and `STAKEHOLDER_QUESTIONS.md`: when landing it, merge, keep both sides' timeline rows, and rewrite its STATUS lines against this version.
- **Report editing (backlog §6).** Report options (`omit`) landed on `dev` 2026-10-12, not deployed; Michael approved samples S1-S4 (timeline, 2026-10-12). Server `task/gilligan-report-omit` (`ddcddc5`) merges cleanly into `develop`; its PR body and a tested `report_retried` relay patch are in `~/code/work/clean-earth-rovers/handoff/2026-10-15/`, neither applied nor opened; the user approved going ahead (2026-10-15) after the Mirror test in [`runbooks/REPORT_OMIT_MIRROR_RUNBOOK.md`](runbooks/REPORT_OMIT_MIRROR_RUNBOOK.md). The test ran on 2026-10-16 ([`migration/REPORT_OMIT_MIRROR_RESULTS_2026-10-16.md`](migration/REPORT_OMIT_MIRROR_RESULTS_2026-10-16.md)): the server side passes, so the PR can go ahead (runbook §10); its two cer-demo findings (C1 "shorter" guessed every group; the A4 retry forced an unrequested report) reproduced and are fixed on `dev` (`acb9d7d`, Mirror rerun passes). Runbook §7.3 runs the chat steps without a browser. The HTML-template recommendation ([`migration/REPORT_HTML_OPTION_2026-10-15.md`](migration/REPORT_HTML_OPTION_2026-10-15.md)) says not to build it now.
- **Data skepticism.** Real readings called sensor faults ([`migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`](migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md)): fixed on `dev` (`16cec6e`, `c303c2f`; [`migration/DATA_SKEPTICISM_FIX_2026-10-12.md`](migration/DATA_SKEPTICISM_FIX_2026-10-12.md)), not deployed. The triage against the flagging rework ([`migration/DATA_SKEPTICISM_TRIAGE_2026-10-15.md`](migration/DATA_SKEPTICISM_TRIAGE_2026-10-15.md)) finds it covers none of the six Remaining items; the swell claim is accepted and `task/swell-rule` dropped (user, 2026-10-15); the before-fix comparison at `c514e0b` is dropped (user, 2026-10-16). A customer (Katie Allen, Clean Bay Collective) met the pre-fix behaviour on 2026-10-12; the flagging chat covers it.
- **Post-launch backlog.** Order the remaining items in [`migration/POST_LAUNCH_BACKLOG.md`](migration/POST_LAUNCH_BACKLOG.md) with the user, reconciled with the untracked `docs/migration/POST_RELEASE_ITEMS_EXPLAINED.html`; the unguarded user-update routes (§2) are the recommended next item.
- **Outside-data tools** (Michael's request, backlog §7; post-release unless done in time): `get_tides` built on `task/tide-tool` (worktree `tide-tool`, `dde1a26`) behind `TIDE_TOOL`, no model run yet. Next: read `docs/migration/OUTSIDE_DATA_TOOLS_HANDOFF.md` on `task/tide-tool` and continue from its "Next step".
- **Docs overhaul** (user approved 2026-10-17): `docs/` is being reorganized into folders by role so `docs/migration/` can go away, in eight batches on `docs/cleanup` (worktree `docs-cleanup`), each landed on `dev` by the coordinator; batches 7-8 wait for the flagging rework. Plan and decisions: [`migration/DOCS_OVERHAUL_PROPOSAL.md`](migration/DOCS_OVERHAUL_PROPOSAL.md); the docs chat resumes from [`migration/DOCS_OVERHAUL_HANDOFF.md`](migration/DOCS_OVERHAUL_HANDOFF.md). Both move to `docs/plans/` in batch 6.
- **Upstream on hold** (user, 2026-10-16; [`timeline.md`](timeline.md)): every upstream branch was force-pushed with the malware payload on 2026-10-14; nothing touches either upstream repository, and the server PR waits, until Michael or someone else at CER answers. Never fetch-and-trust `origin/*` there; local branches are the clean copies.
- **Upstream landing.** `develop` is pushed in both repositories (server `5f04064`, dashboard `5ae4993`); next are the `main` merges, which Michael tests first ([`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md) §5).
- **Reflection course** (branch `reflection`, user-facing teaching, no product changes): next, read `docs/reflection/HANDOFF.md` on `reflection` and continue from its "Next step".
- **Coordination**: the coordinator alone writes `dev`, this file, the plan and the manual guide; other chats work on their own branch and worktree and report commit IDs. Upstream repositories: edits and commits on `local` freely, every push and any irreversible Git only on the user's approval of the exact command in chat ([`timeline.md`](timeline.md) 2026-10-14).

## Last session

- Coordinator, 2026-10-16: ran the report-omission Mirror paid steps without a browser (`scripts/mirror/reportOmitDrive.mjs`; 429,072 tokens, about $0.06) and recorded them; reproduced A4 and C1, fixed both (`acb9d7d`) and reran them on the Mirror (551,943 tokens, about $0.08); added the browserless playbook as runbook §7.3; removed the `swell-rule` worktree; recorded the user's dates and the dropped `c514e0b` comparison; landed the docs cleanup (`6e019cf`; nine docs retired under tags `docs-archive-2026-10-16` and `-16b`, see `ARCHIVED.md`; the four docs it left are in the coordinator handoff, "Docs cleanup review"). The Mirror stack is still running; a report-omission chat (server PR, stopping the Mirror) and an upstream cleanup chat are working in parallel.

## Working tree

- Code lives under `~/code/work/clean-earth-rovers/` since 2026-10-04; the release files once in `~/release/` are in `release/` on `dev` (`0921140`); `release/rc2-mirror.env.sh` (secrets) and `release/rc2-artifacts/` exist only in the main checkout, ignored.
- Main checkout on `reflection` (`4c15796`): the user's uncommitted `.claude/settings.json` and `release/start-rc2-emulator.sh` edits are now redundant with `dev` (the user decides); untracked user files (`docs/migration/*_EXPLAINED.html`, `REPORT_EDITING_OPTIONS.html`, `_EXIT_CRITERIA.md`, `eval/grading/phase-1d-wave1-fixture-review.html`, `review-marked-up.html`, the root v2 PDF) stay untracked on purpose.
- Worktrees (`git worktree list`): `dev` (coordinator), `omit-mirror` (detached `dev` for the report-omit Mirror; ignored `.env` copy and linked caches), `flagging-share-window`, `tide-tool`, `docs-cleanup` (`docs/cleanup` `6e019cf`, landed on `dev`, pushed), `e7-corpus`, `firestore-plan`, `post-launch-land` (merged), `window-note`, and detached `e2e-dev`, `skeptic-before`, `skeptic-evals-run`, `skeptic-repro` (cleanup candidates; check each is clean and reachable from a branch or tag first).
- Remote branches (`git ls-remote --heads origin`): `main` `fcf6343`, `dev`, `reflection`, `task/flagging-share-window`, `task/tide-tool`, `task/report-html-option`, `task/skeptic-triage`, `task/swell-rule`, `fix/window-note`, `land/post-launch`, `task/e7-corpus`, `docs/firestore-testing-plan`, `docs/cleanup`. The repository is public.
- The report-omit Mirror server tree is the export `~/code/work/clean-earth-rovers/worktrees/mirror-report-omit` (runbook §3.1; ignored `.env.mirror.local` copy). The older report-omit Mirror stack is down; delete the old scratchpad secrets under `/tmp/claude-1000*/46402f68-fd11-42b5-a864-1ea3b3e21aa9/scratchpad` (`mirror-env.sh`, `auth-*`, `server-mirror/`). No containers were running at handoff (`docker ps`).

## Open work

- User: [`migration/COORDINATOR_HANDOFF_2026-10-15.md`](migration/COORDINATOR_HANDOFF_2026-10-15.md) "Waiting on the user": the server PR commands (runbook §10), data-skepticism items 2, 3 and 5a, the "free prompt-rule inventory", post-launch order, the remaining worktree cleanup, and the older items (scratchpad secrets, the test user `winsyu475+certest@gmail.com`, the main checkout's uncommitted edits).
- Michael: answer stakeholder questions 27-35 (28-35 sent 2026-10-15); send him nothing more until he does (user, 2026-10-15). Also: revoke the old Gemini key and Gmail app password; optionally grant the user Cloud Build bucket write and `roles/datastore.user` on the `gilligan` database; test before the `main` merges.
- Agent, coordinator: walk the user through the server PR; land each docs-overhaul batch; on Michael's answers, record them and land `task/flagging-share-window` with the checklist in the coordinator handoff ("Next step" 4); then prepare the release; refresh this file.
- Agent, outside-data tools: `docs/migration/OUTSIDE_DATA_TOOLS_HANDOFF.md` on `task/tide-tool`.
- Agent, upstream landing: build the `main` merges (server conflicts in `WaterAnalyticsService.ts`; take the release side); push on consent; tell Michael `62993fe` ships with server `main`.
- Agent, release follow-through: cer-gilligan to 2 instances after the restart check; remove stale tags (backlog §4).

## Unfixed defects

| Where | Defect | Severity |
|---|---|---|
| server `POST /api/v1/users/account/:id`, `POST`/`DELETE /api/v1/users/:id`, `POST /api/v1/users` | Any logged-in user can set any user's role, organization and email; admins can edit, promote, delete or create users in other organizations; live in production (landing doc §7 item 14). | high |
| server `WaterAnalyticsController.exportCsv` | Any logged-in user exports any pod's readings as CSV (finding 11); fixed on `8463545`, not shipped. | high |
| Gilligan answers, `src/prompt/systemPrompt.ts`, `src/catalogue/` | Real readings called sensor faults on an unmeasured cause (tides); positions flip under pushback without a fresh tool call (Michael, 2026-10-09); fixed on `dev`, not deployed. | high |
| `../user-dashboard` `src/app/services/device-data.js:341`, `src/app/components/header.js` | A previous account's pod and organization lists survive logout and login in the same tab; a superadmin's pods show to the next account until a reload. | medium |
| Gilligan answers (live) | One out-of-range reading flags a metric and prompts maintenance; the turbidity caveat repeats in almost every answer (backlog §1); fixed on `dev`, reworked on `task/flagging-share-window`, not deployed. | medium |
| `task/flagging-share-window` `9c57aa9` | Deleted about 680 lines of `docs/SPECS.md` (§10.7-§19, including §10.9); restore dev's sections when landing. | medium |
| server `src/utils/tideStations.ts:48` | Reads NOAA's `stationList`, but NOAA answers `stations`: CER's tide markers get no automatic station; registry `noaaTidesId` `9087057` is a Great Lakes station with no predictions. | low |
| `scripts/skepticism/replay.ts:240-243`, `src/prompt/systemPrompt.ts` "persistent" verdict | G1 fails by design once the flagging rework lands; the "persistent" line still offers "sensor fouling or calibration" beside the no-fault-theory rule. | low |
| `src/prompt/systemPrompt.ts:175` | The tool-note rule still names "the device's water type differing from the deployment's", a note no tool writes any more (removed with Q10 T12). | low |
| server `.eslintrc.js` | No TypeScript parser, so `npm run lint` cannot parse `src/*.ts`. | low |
| server `checkWaterDataAndSendAlerts` | Alert emails fire on the latest reading alone, so an email can alert while chat calls the metric in range (stakeholder question 27). | low |
| server `assignOrganization` | A non-superadmin with an empty organization sees every pod; no production user has one; fixed on `8463545`, not shipped. | medium |
| Gilligan answers (L8) | "How is the water this week?" answers with actions and a report offer; another organization's pod named by a customer gets an answer about the caller's own pod without saying the named one is unavailable; near-identical repeat answers after a reload. | low |
| cer-demo referrals | "My pod is broken" is declined instead of referred to sales@cleanearthrovers.com (finding 8); recheck on production. | medium |
| answers (`glm-5p3-flash`) | Refusal wording varies between runs; cross-document answers score 0.83. | medium |
| R4 judge, ungrounded dimension | Weak agreement with reference grades (kappa 0.23); ungrounded rates are indicative only. | medium |
| `eval/fixtures-wave1/` | 84/90 turns have explanatory sources outside the ◆G9 slice. | medium |
| `src/report/buildReportInput.ts:548` | A report with no usable readings shows the model-facing site note as "Tool failed". | low |
| `src/tools/getPodThresholds.ts` | Rejected (unset or inverted) limits have no reader note. | low |
| eval gates | Catalogue-id markers such as `【fault-first】` count as invalid citations. | low |
| server `src/schemas/waterData.schema.ts` | Legacy unauthenticated `/water-data`, `/device`, `/duration/*` fail on real rows; remove or authenticate. | low |
| server `findPeriodWaterData` | Slices an organization's labels to 10 for the `in` query. | low |
| server charts (CER's own code) | Chart timestamps run 7 hours past their labels; unverified in a browser. | low |
| `src/prompt/promptBuilder.ts` `buildMessages` | CONTEXT is a second system message, which `minimax-m3` drops; probe any new model. | low |
| tools-off answers (`gpt-oss-120b`) | Can loop on malformed citation markers. | low |
| `../user-dashboard` `src/app/gilligan/page.js` | `useSearchParams` outside Suspense deopts the page to client rendering. | low |
| `/tmp/eval-fixtures-*` | 131 directories leaked before the hygiene fix remain. | low |

## Active traps

- QC (`src/devices/readingQc.ts`) fails 24 identical consecutive readings on any metric: a test fixture with a constant value now reads as a stuck sensor, so vary fixture values.
- `npm run lint` covers `src` only; `eslint --fix` on a test file reformats unrelated lines.
- `MIRROR_RUNBOOK.md` predates the 2026-10-04 move: its paths are under `~/code/clean-earth-rovers/`, `server-release-mirror`'s `node_modules` link is broken, and port 3000 belonged to `cer-ui-l8-local` (live cer-api); `REPORT_OMIT_MIRROR_TEST.md` lists the substitutions.
- The auto-mode classifier refuses branch and worktree creation in the upstream server repository, and paid Mirror runs from the agent (as production reads), so the user runs those scripts with `!`; the Mirror seed stores turbidity as 0, so no Mirror report has a turbidity row; the seed can crash once on a WSL clock step ("Request time should not be before the last token refill time"), and a retry works.
- Upstream history carries malware (tips are clean; it runs on `next dev`, `next build`, `npm test`): never check out `main`, `develop` or an old commit; scan with `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or switch.
- Rollback targets are `cer-ui-00067-jid` and `cer-api-secrets-1005-1653`; the latter carries the revoked mail password and the Gemini-backed Gilligan, so roll back cer-ui first.
- cer-gilligan traffic is pinned to a revision: any `services update` (minimum instances, settings) creates a revision with no traffic; route it with `update-traffic`.
- The dashboard's `API_PROXY_TARGET` is read at run time; a local test dashboard needs `docker run -e API_PROXY_TARGET=...`, or it proxies to the live cer-api.
- Docker 29 pushes OCI indexes: Cloud Run records the linux/amd64 manifest digest, not the pushed tag's digest. After the WSL move, a corrupt build cache failed every build until `docker builder prune -af`.
- Subagents cannot write report or doc files ("Subagents should return findings as text"): have them return the text and write it yourself. Auto mode also refused `git am` into the upstream server worktree; hand the user the command.
- Agents cannot push images or deploy, and the auto-mode classifier refused config edits and the public push of `release/` files even with chat approval (2026-10-14); the user runs those from chat-supplied commands, one line each, from the session's working directory (use absolute paths).
- Anything done through the release dashboard writes CER's production database (users, chats, usage); use only the test user.
- The user's account cannot read `cer-gilligan-service-key` or Fireworks secret versions, and has only read access to Firestore.
- `gcloud logging read` text matches can hit `insertId`; filter on `textPayload` or `jsonPayload`.
- Quote curl's proxy bypass as `--noproxy '*'`; bare `*` expands to file names that resolve as internet hosts.
- `.env` sets `SENSOR_TOOL` and `REPORT_TOOL` true, which means live production reads: captures and judge runs set both false.
- On an existing Cloud Run service use `--update-secrets` and `--update-env-vars`; `--set-secrets` replaces every secret reference.
- Long `gcloud` commands pasted into a terminal can split at a line break; paste them as one line.
- Never run the server's integration suites (they hit the real `qa-db`); run server unit suites with `FIRESTORE_EMULATOR_HOST=127.0.0.1:1`.
- Run Jest suites singly with `--runInBand`; never kill 8000; coordinate ports before starting a stack.
- R4 judge runs pass `--judge-model=accounts/fireworks/models/deepseek-v4p1-flash` and `--run=<id>`; GLM needs `LLM_REASONING_EFFORT=low`.
- Re-ingesting with a different tesseract build moves 12 chunk ids; `data/corpus/` is the Sep 21 corpus until rc2 re-ingests.
- The device token is superadmin with no `exp` claim.

## Where things live

- Gilligan behaviour: [`migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`](migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md)
- Launch record: [`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md); backlog: [`migration/POST_LAUNCH_BACKLOG.md`](migration/POST_LAUNCH_BACKLOG.md); Michael's tasks: [`people/MICHAEL_TASKS.html`](people/MICHAEL_TASKS.html), [`people/MICHAEL_DEPLOY_BLOCKERS.md`](people/MICHAEL_DEPLOY_BLOCKERS.md)
- Release: [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md), [`runbooks/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](runbooks/GILLIGAN_DEPLOYMENT_RUNBOOK.md), [`runbooks/GILLIGAN_MANUAL_TEST_GUIDE.md`](runbooks/GILLIGAN_MANUAL_TEST_GUIDE.md), [`runbooks/LIVE_TEST_LIST.md`](runbooks/LIVE_TEST_LIST.md), [`runbooks/MIRROR_RUNBOOK.md`](runbooks/MIRROR_RUNBOOK.md), [`migration/LAUNCH_ISSUES_CHECKLIST.md`](migration/LAUNCH_ISSUES_CHECKLIST.md)
- Security and environment: [`migration/SECURITY_FINDINGS.md`](migration/SECURITY_FINDINGS.md), [`runbooks/LOCAL_STACK.md`](runbooks/LOCAL_STACK.md), [`reference/GILLIGAN_FIRESTORE_FRAMEWORK.md`](reference/GILLIGAN_FIRESTORE_FRAMEWORK.md)
- Behavior: [`SPECS.md`](SPECS.md); architecture: [`reference/GILLIGAN_TARGET_ARCHITECTURE.md`](reference/GILLIGAN_TARGET_ARCHITECTURE.md)
- Decisions: [`timeline.md`](timeline.md)
- Evaluation: [`EVAL_REBUILD.md`](EVAL_REBUILD.md), [`../eval/reviews/phase3-2026-09-23/R4_REPORT.md`](../eval/reviews/phase3-2026-09-23/R4_REPORT.md)
- Conventions: [`reference/CONVENTIONS.md`](reference/CONVENTIONS.md); people: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md)
