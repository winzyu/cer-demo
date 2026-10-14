# Status

Updated 2026-10-13 at `f945ccb` on `task/flagging-share-window` for the flagging rework only; otherwise as the coordinator's 2026-10-12 update after landing `land/post-launch` on `dev`: `docs/launch-handoff`, `task/sot-v2-flagging`, `task/report-omit`, `docs/behavior-handoff` and `task/data-skepticism`'s coverage-line work, plus three landing fixes; other workstreams as of the release chat's 2026-10-07 update after L9.
Current state and next steps only; history is `git log -p docs/STATUS.md`; never cite this file from code or other docs.

## Start here

- **Gilligan is live (2026-10-07).** cer-gilligan `00004-r5q`, cer-api `00081-qon` (tag `rc2`) and cer-ui `00070-dax` (tag `rc1`) take all traffic; record in [`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md) §7 items 10-19.
- **Flagging rework** (Michael's 2026-10-12 decisions, on top of v2 flagging, landed on `dev` 2026-10-12): built, tested and replayed on `task/flagging-share-window`, pushed, not merged or deployed; decisions in [`timeline.md`](timeline.md) 2026-10-13.
  Checked on Algalita's real month 2026-10-13 (the report now judges with the day before its period, as chat does; the fixture is reshaped on the real month).
  Next: start at [`migration/FLAGGING_REWORK_HANDOFF_2026-10-13.md`](migration/FLAGGING_REWORK_HANDOFF_2026-10-13.md) "Start here": the user sends Michael its summary and addendum, then revert what he rejects.
- **Post-launch backlog.** Order the remaining items in [`migration/POST_LAUNCH_BACKLOG.md`](migration/POST_LAUNCH_BACKLOG.md) with the user, reconciled with the untracked `docs/migration/POST_RELEASE_ITEMS_EXPLAINED.html` (2026-10-02); the unguarded user-update routes (§2) are the obvious next candidate.
- **Report editing (backlog §6).** Report options (`omit`) are built and unit-tested on cer-demo `task/report-omit` and server `task/gilligan-report-omit`; the Mirror tests (2026-10-10 and 11, [`migration/REPORT_OMIT_MIRROR_RESULTS_2026-10-10.md`](migration/REPORT_OMIT_MIRROR_RESULTS_2026-10-10.md)) pass the mechanism; the false-claim fix (`5390332`: server-written "New PDF in this reply" line, forced retry) made a report in 8 of 8 replays and all three turns of a cer-api chat, with the retry firing in 7 of 11 (results doc, "Fix test").
  Landed on `dev` (2026-10-12), with the report-claim check no longer reading reading-QC sentences as claims and `threshold_notes` covering every threshold footnote; not deployed. Next: the user sends Michael the samples in `migration/report-omit-samples/`; the server branch `task/gilligan-report-omit` waits for push consent.
  This chat leaves over-flagging (§1) out by the user's decision.
- **Gilligan behaviour (data skepticism).** Gilligan wrote off a week of real readings as sensor faults on a tide link it never measured, then reversed under pushback ([`migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`](migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md)).
  Next: get the user's mirror details, budget and decisions (§5-6 there), then reproduce on the mirror before changing the prompt; build on `task/sot-v2-flagging` once it lands, never edit its files in parallel.
  In progress on `task/data-skepticism` (worktree `data-skepticism`, cut from `task/sot-v2-flagging` `eb90575`); blocked on the user's choice of mirror test route.
- **Upstream landing.** `develop` is pushed in both repositories (server `5f04064`, dashboard `5ae4993`); next are the `main` merges, which Michael tests first ([`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md) §5).
- **Coordination**: the coordinator alone writes `dev`, this file, the plan and the manual guide; other chats work on their own branch and worktree and report commit IDs; upstream pushes are new branches only, with the user's consent in chat.

## Last session

- Flagging rework: decisions 1-10 taken with the user and recorded; implemented in `63fab5f` (reading labels, share rule, current-only Action Required, edge rule, device-only data issues, events from flags); behaviour in [`SPECS.md`](SPECS.md) "The flag rule", "Reading labels", "Verdicts".
- Checks: 23 suites run singly, all passing, including a new Algalita end-to-end suite on recorded plus synthetic readings; typecheck and lint clean; full `npm test` not run.
- Paid replay of the customer's two questions on a fake device API: $0.053 of the approved $0.30; `dev` calls Sep 26 a data issue and the report Action Required, the branch describes the drop and reports Watch with past flags.
- The user's read-only pull of Algalita's month (2026-10-13) confirmed the rules locally; it found the report missing a flag that straddles the period's start, now fixed, and the test fixture was reshaped on the real month without committing its readings (handoff, "Real-month check").
- Earlier sessions' outcomes are in their durable docs; history is `git log -p docs/STATUS.md`.

## Working tree

- Code moved to `~/code/work/clean-earth-rovers/` on 2026-10-04 (WSL rebuild); `~/release/` did not survive the move, and Docker's image store was emptied.
- Main checkout on `reflection` with the user's uncommitted path fixes (`.claude/settings.json`, `release/start-rc2-emulator.sh`) and the untracked `docs/migration/POST_RELEASE_ITEMS_EXPLAINED.html`; `_EXIT_CRITERIA.md`, `eval/grading/phase-1d-wave1-fixture-review.html`, `review-marked-up.html` and the root v2 PDF stay untracked on purpose.
- Landing: `dev` is `land/post-launch` (2026-10-12), tested per [`migration/POST_LAUNCH_MERGE_TESTS.md`](migration/POST_LAUNCH_MERGE_TESTS.md) and [`migration/POST_LAUNCH_MERGE_RESULTS_2026-10-11.md`](migration/POST_LAUNCH_MERGE_RESULTS_2026-10-11.md); new work branches from `dev`.
- `dev` moved to `469e972` (the window-note fix, pushed at the user's request outside the coordinator); worktree `dev` holds it.
- Flagging: worktree `flagging-share-window`, branch `task/flagging-share-window` pushed at `f945ccb`, clean; `.env` copied into worktree `dev` and the `data/` caches linked into both, ignored; `sot-v2-flagging` (landed) is clean.
- cer-demo worktrees: 47 besides the main checkout; `post-launch-land` is the coordinator's; `data-skepticism` and `skeptic-repro` are the behaviour chat's; `post-launch-security` and `mirror-testing` are stale (2026-09-28) with nothing uncommitted.
- Upstream build worktrees `worktrees/build-cer-api-122136d` and `build-cer-ui-fc13d16` are clean detached checkouts of the live commits; the server and dashboard checkouts stay on `local`.
- Report editing: worktree `report-omit` on `task/report-omit` (pushed; feature `97e396e`, plan `ac212d1`, then a merge of `docs/launch-handoff`), so the coordinator lands `docs/launch-handoff` first; server worktree `worktrees/server-report-omit` on `task/gilligan-report-omit` `ddcddc5` (local only, never push without consent); the options comparison `docs/migration/REPORT_EDITING_OPTIONS.html` is untracked in the main checkout.
- Report editing, Mirror stack (running until about 07:37 UTC 2026-10-12, fabricated data): emulator 8080, cer-api 5101 and Gilligan 8010 (the `report-omit` worktree under `ts-node-dev`, so saves restart it); the server runs from a `git archive` export of `mirror/release-rc1` plus the omit patch in the session scratchpad, whose `mirror-env.sh` (secrets, never print), `bin/m` helper, `bin/marker.js` replay and `OTHER_CHAT_PROMPT.md` (for a parallel over-refusal chat) the next chat needs; the worktree `.env` is a full copy of the main one, overridden by `mirror-env.sh`; delete `mirror-env.sh` and `server-mirror/` there when done.
- Running: Docker container `cer-ui-l8-local` on 127.0.0.1:3000 (the release dashboard proxying to cer-api `rc2`, which is now live); the pre-move stacks (mirror, launch-issues, rc2 mirror) are gone.

## Open work

- User, behaviour: mirror details, the test budget (about $1, or $2 with the wave-1 check), whether to stop `cer-ui-l8-local` for port 3000, and whether natural-variation catalogue drafts go to the supervisor; deploy `469e972`'s fix when convenient.
- User: choose the rest of the post-launch order; send Michael the launch note; delete the test user `winsyu475+certest@gmail.com`; say when to stop `cer-ui-l8-local`; recover `~/release/` if a backup has it.
- Michael: revoke the old Gemini key and Gmail app password; optionally grant the user Cloud Build bucket write and `roles/datastore.user` on the `gilligan` database (usage resets); test before the `main` merges.
- User, report editing: send Michael the before-and-after PDFs and correct the earlier message that the model edits parts of the report (it never did; the variation came from data-driven templates).
- Agent, report editing: optionally relay `report_retried` through cer-api (`CerRagService.ask`) so retries show without Gilligan's log; stop the Mirror stack when the user says (delete `mirror-env.sh` and `server-mirror/`).
- Agent, behaviour: the mirror fixture, reproduction and prompt and catalogue changes in [`migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`](migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md) §5-6.
- User, flagging: send Michael the handoff's summary and addendum; say when to merge into `dev`; the replay on the reshaped month ran 2026-10-14 ($0.044, handoff).
- Agent, flagging: Michael's answers into [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md) 27-29, revert rejected rules (the handoff's "Where each rule lives").
- Agent, post-launch: the rest of [`migration/POST_LAUNCH_BACKLOG.md`](migration/POST_LAUNCH_BACKLOG.md), once ordered.
- Agent, upstream landing: build the `main` merges (server conflicts in `WaterAnalyticsService.ts`; take the release side); push on consent; tell Michael `62993fe` ships with server `main`.
- Agent, release follow-through: logs and spend in the first days; cer-gilligan to 2 instances after the restart check; remove stale tags (backlog §4).

## Unfixed defects

| Where | Defect | Severity |
|---|---|---|
| server `POST /api/v1/users/account/:id`, `POST`/`DELETE /api/v1/users/:id`, `POST /api/v1/users` | Any logged-in user can set any user's role, organization and email; admins can edit, promote, delete or create users in other organizations; live in production (landing doc §7 item 14). | high |
| server `WaterAnalyticsController.exportCsv` | Any logged-in user exports any pod's readings as CSV (finding 11); fixed on `8463545`, not shipped. | high |
| `../user-dashboard` `src/app/services/device-data.js:341`, `src/app/components/header.js` | A previous account's pod and organization lists survive logout and login in the same tab; a superadmin's pods show to the next account until a reload. | medium |
| Gilligan answers (live) | One out-of-range reading flags a metric and prompts maintenance; the turbidity caveat repeats in almost every answer (backlog §1); fixed on `dev`, reworked on `task/flagging-share-window`, not deployed. | medium |
| `src/tools/timeRange.ts` | A calendar date resolves as a UTC day, so a Pacific evening (Algalita's Sep 26 17:56 drop) falls on the next day. | medium |
| server `checkWaterDataAndSendAlerts` | Alert emails fire on the latest reading alone, so an email can alert while chat calls the metric in range (stakeholder question 27). | low |
| Gilligan answers, `src/prompt/systemPrompt.ts`, `src/catalogue/` | Real readings called sensor faults on an unmeasured cause (tides); positions flip under pushback without a fresh tool call (Michael, 2026-10-09). | high |
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
- `MIRROR_RUNBOOK.md` predates the 2026-10-04 move: its paths are under `~/code/clean-earth-rovers/`, `server-release-mirror`'s `node_modules` link is broken, and port 3000 now belongs to `cer-ui-l8-local` (live cer-api); `REPORT_OMIT_MIRROR_TEST.md` lists the substitutions.
- The auto-mode classifier refuses branch and worktree creation in the upstream server repository, and paid Mirror runs from the agent (as production reads), so the user runs those scripts with `!`; the Mirror seed stores turbidity as 0, so no Mirror report has a turbidity row; the seed can crash once on a WSL clock step ("Request time should not be before the last token refill time"), and a retry works.

- Upstream history carries malware (tips are clean; it runs on `next dev`, `next build`, `npm test`): never check out `main`, `develop` or an old commit; scan with `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or switch.
- Rollback targets are `cer-ui-00067-jid` and `cer-api-secrets-1005-1653`; the latter carries the revoked mail password and the Gemini-backed Gilligan, so roll back cer-ui first.
- cer-gilligan traffic is pinned to a revision: any `services update` (minimum instances, settings) creates a revision with no traffic; route it with `update-traffic`.
- The dashboard's `API_PROXY_TARGET` is read at run time; a local test dashboard needs `docker run -e API_PROXY_TARGET=...`, or it proxies to the live cer-api.
- Docker 29 pushes OCI indexes: Cloud Run records the linux/amd64 manifest digest, not the pushed tag's digest. After the WSL move, a corrupt build cache failed every build until `docker builder prune -af`.
- Agents cannot push images, deploy, or write deploy scripts (the auto-mode classifier refuses); the user runs them from chat-supplied commands, one line each.
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
- Launch record: [`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md); backlog: [`migration/POST_LAUNCH_BACKLOG.md`](migration/POST_LAUNCH_BACKLOG.md); Michael's tasks: [`migration/MICHAEL_TASKS.html`](migration/MICHAEL_TASKS.html), [`migration/MICHAEL_DEPLOY_BLOCKERS.md`](migration/MICHAEL_DEPLOY_BLOCKERS.md)
- Release: [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md), [`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md), [`migration/GILLIGAN_MANUAL_TEST_GUIDE.md`](migration/GILLIGAN_MANUAL_TEST_GUIDE.md), [`migration/LIVE_TEST_LIST.md`](migration/LIVE_TEST_LIST.md), [`migration/MIRROR_RUNBOOK.md`](migration/MIRROR_RUNBOOK.md), [`migration/LAUNCH_ISSUES_CHECKLIST.md`](migration/LAUNCH_ISSUES_CHECKLIST.md)
- Security and environment: [`migration/SECURITY_FINDINGS.md`](migration/SECURITY_FINDINGS.md), [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md), [`migration/GILLIGAN_FIRESTORE_FRAMEWORK.md`](migration/GILLIGAN_FIRESTORE_FRAMEWORK.md)
- Behavior: [`SPECS.md`](SPECS.md); architecture: [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md)
- Decisions: [`timeline.md`](timeline.md)
- Evaluation: [`EVAL_REBUILD.md`](EVAL_REBUILD.md), [`../eval/reviews/phase3-2026-09-23/R4_REPORT.md`](../eval/reviews/phase3-2026-09-23/R4_REPORT.md)
- Conventions: [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md); people: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md)
