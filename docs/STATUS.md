# Status

Updated 2026-10-11 by the v2 flagging chat on `task/sot-v2-flagging` after its smoke check (cut from `docs/launch-handoff`); other workstreams as of the release chat's 2026-10-07 update after L9.
Current state and next steps only; history is `git log -p docs/STATUS.md`; never cite this file from code or other docs.

## Start here

- **Gilligan is live (2026-10-07).** cer-gilligan `00004-r5q`, cer-api `00081-qon` (tag `rc2`) and cer-ui `00070-dax` (tag `rc1`) take all traffic; record in [`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md) §7 items 10-19.
- **v2 flagging (backlog §1, items A1-D3)**: built and pushed on `task/sot-v2-flagging` (worktree `sot-v2-flagging`). The smoke check passed (2026-10-11, about $0.07, [`migration/V2_FLAGGING_SMOKE_2026-10-11.md`](migration/V2_FLAGGING_SMOKE_2026-10-11.md)). Next: the coordinator lands the branch on `dev`.
- **Post-launch backlog.** Order the remaining items in [`migration/POST_LAUNCH_BACKLOG.md`](migration/POST_LAUNCH_BACKLOG.md) with the user, reconciled with the untracked `docs/migration/POST_RELEASE_ITEMS_EXPLAINED.html` (2026-10-02); the unguarded user-update routes (§2) are the obvious next candidate.
- **Upstream landing.** `develop` is pushed in both repositories (server `5f04064`, dashboard `5ae4993`); next are the `main` merges, which Michael tests first ([`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md) §5).
- **Coordination**: the coordinator alone writes `dev`, this file, the plan and the manual guide; other chats work on their own branch and worktree and report commit IDs; upstream pushes are new branches only, with the user's consent in chat.

## Last session

- v2 flagging smoke check: 8 live questions on a local server at 8020 (stopped), all pass; read-only production reads, about $0.07.
- v2 flagging: per-reading QC (flat lines, spikes, read and board failures), operator thresholds with v2 §3 fallbacks, the 3-in-a-row rule with v2's minimum detectable change, per-metric verdicts in `query_sensor_data`, and the matching report flags, tiers and prompt rules; behaviour in [`SPECS.md`](SPECS.md) §19 and §10.7.
- Decisions of 2026-10-11 (no conductivity or coastal ORP fallback, run and data-issue details, inspection only for a likely data issue) are in [`timeline.md`](timeline.md); [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md) now holds only open questions, with new items 24-27.
- Checks: 27 unit suites and 3 integration suites run singly, typecheck and lint clean; full `npm test` not run; no production reads and no spend.
- Release chat (2026-10-07): L6-L9 done ([`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md) §7); an estimated $0.10-0.30 on CER's Fireworks key for the L6 and L8 checks.

## Working tree

- Code moved to `~/code/work/clean-earth-rovers/` on 2026-10-04 (WSL rebuild); `~/release/` did not survive the move, and Docker's image store was emptied.
- Main checkout on `reflection` with the user's uncommitted path fixes (`.claude/settings.json`, `release/start-rc2-emulator.sh`) and the untracked `docs/migration/POST_RELEASE_ITEMS_EXPLAINED.html`; `_EXIT_CRITERIA.md`, `eval/grading/phase-1d-wave1-fixture-review.html`, `review-marked-up.html` and the root v2 PDF stay untracked on purpose.
- This handoff: branch `docs/launch-handoff` (worktree `launch-handoff`) merges `task/release-l6-images` into `dev` and adds the backlog, three timeline rows and a runbook §3.4 correction; it awaits the coordinator's landing on `dev`.
- v2 flagging: worktree `sot-v2-flagging`, branch `task/sot-v2-flagging` pushed, clean; `node_modules`, `.env` and the `data/` caches are linked or copied in, ignored.
- cer-demo worktrees: 45 besides the main checkout; `release-l6` (pushed, merged here) and `launch-handoff` are this chat's; `post-launch-security` and `mirror-testing` are stale (2026-09-28) with nothing uncommitted.
- Upstream build worktrees `worktrees/build-cer-api-122136d` and `build-cer-ui-fc13d16` are clean detached checkouts of the live commits; the server and dashboard checkouts stay on `local`.
- Running: Docker container `cer-ui-l8-local` on 127.0.0.1:3000 (the release dashboard proxying to cer-api `rc2`, which is now live); the pre-move stacks (mirror, launch-issues, rc2 mirror) are gone.

## Open work

- User: choose the rest of the post-launch order; send Michael the launch note; delete the test user `winsyu475+certest@gmail.com`; say when to stop `cer-ui-l8-local`; recover `~/release/` if a backup has it.
- Michael: revoke the old Gemini key and Gmail app password; optionally grant the user Cloud Build bucket write and `roles/datastore.user` on the `gilligan` database (usage resets); test before the `main` merges.
- Agent, v2 flagging: the coordinator lands `task/sot-v2-flagging` on `dev`.
- Agent, post-launch: the rest of [`migration/POST_LAUNCH_BACKLOG.md`](migration/POST_LAUNCH_BACKLOG.md), once ordered.
- Agent, upstream landing: build the `main` merges (server conflicts in `WaterAnalyticsService.ts`; take the release side); push on consent; tell Michael `62993fe` ships with server `main`.
- Agent, release follow-through: logs and spend in the first days; cer-gilligan to 2 instances after the restart check; remove stale tags (backlog §4).

## Unfixed defects

| Where | Defect | Severity |
|---|---|---|
| server `POST /api/v1/users/account/:id`, `POST`/`DELETE /api/v1/users/:id`, `POST /api/v1/users` | Any logged-in user can set any user's role, organization and email; admins can edit, promote, delete or create users in other organizations; live in production (landing doc §7 item 14). | high |
| server `WaterAnalyticsController.exportCsv` | Any logged-in user exports any pod's readings as CSV (finding 11); fixed on `8463545`, not shipped. | high |
| `../user-dashboard` `src/app/services/device-data.js:341`, `src/app/components/header.js` | A previous account's pod and organization lists survive logout and login in the same tab; a superadmin's pods show to the next account until a reload. | medium |
| Gilligan answers (live) | One out-of-range reading flags a metric and prompts maintenance; the turbidity caveat repeats in almost every answer (backlog §1); fixed on `task/sot-v2-flagging`, not landed or deployed. | medium |
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

- Launch record: [`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md); backlog: [`migration/POST_LAUNCH_BACKLOG.md`](migration/POST_LAUNCH_BACKLOG.md); Michael's tasks: [`migration/MICHAEL_TASKS.html`](migration/MICHAEL_TASKS.html), [`migration/MICHAEL_DEPLOY_BLOCKERS.md`](migration/MICHAEL_DEPLOY_BLOCKERS.md)
- Release: [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md), [`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md), [`migration/GILLIGAN_MANUAL_TEST_GUIDE.md`](migration/GILLIGAN_MANUAL_TEST_GUIDE.md), [`migration/LIVE_TEST_LIST.md`](migration/LIVE_TEST_LIST.md), [`migration/MIRROR_RUNBOOK.md`](migration/MIRROR_RUNBOOK.md), [`migration/LAUNCH_ISSUES_CHECKLIST.md`](migration/LAUNCH_ISSUES_CHECKLIST.md)
- Security and environment: [`migration/SECURITY_FINDINGS.md`](migration/SECURITY_FINDINGS.md), [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md), [`migration/GILLIGAN_FIRESTORE_FRAMEWORK.md`](migration/GILLIGAN_FIRESTORE_FRAMEWORK.md)
- Behavior: [`SPECS.md`](SPECS.md); architecture: [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md)
- Decisions: [`timeline.md`](timeline.md)
- Evaluation: [`EVAL_REBUILD.md`](EVAL_REBUILD.md), [`../eval/reviews/phase3-2026-09-23/R4_REPORT.md`](../eval/reviews/phase3-2026-09-23/R4_REPORT.md)
- Conventions: [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md); people: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md)
