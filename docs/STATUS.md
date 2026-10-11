# Status

Updated 2026-10-11 by the Gilligan behaviour chat, on `docs/behavior-handoff` (`docs/launch-handoff` `babb67a` plus `dev` `469e972`); the release chat's 2026-10-07 lines stand.
Current state and next steps only; history is `git log -p docs/STATUS.md`; never cite this file from code or other docs.

## Start here

- **Gilligan is live (2026-10-07).** cer-gilligan `00004-r5q`, cer-api `00081-qon` (tag `rc2`) and cer-ui `00070-dax` (tag `rc1`) take all traffic; record in [`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md) §7 items 10-19.
- **Post-launch backlog (next chat).** Lay out every item set aside for after launch from [`migration/POST_LAUNCH_BACKLOG.md`](migration/POST_LAUNCH_BACKLOG.md), reconcile it with the user's untracked `docs/migration/POST_RELEASE_ITEMS_EXPLAINED.html` (2026-10-02), and agree an order with the user before working on any item.
  The over-flagging change Michael asked for (§1) and the unguarded user-update routes (§2) are the obvious candidates for first.
  §1 is in progress on `task/sot-v2-flagging` (worktree `sot-v2-flagging`; local `1499817` with uncommitted edits, origin `bfa8f33`).
- **Gilligan behaviour (data skepticism).** Gilligan wrote off a week of real readings as sensor faults on a tide link it never measured, then reversed under pushback ([`migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`](migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md)).
  Next: get the user's mirror details, budget and decisions (§5-6 there), then reproduce on the mirror before changing the prompt; build on `task/sot-v2-flagging` once it lands, never edit its files in parallel.
- **Upstream landing.** `develop` is pushed in both repositories (server `5f04064`, dashboard `5ae4993`); next are the `main` merges, which Michael tests first ([`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md) §5).
- **Coordination**: the coordinator alone writes `dev`, this file, the plan and the manual guide; other chats work on their own branch and worktree and report commit IDs; upstream pushes are new branches only, with the user's consent in chat.

## Last session

- Michael's 2026-10-09 chat (read once from production Firestore, read-only) traced to five root causes: no normal-variation guidance, `fault-first` stated as a finding, grounding that checks quotes not inferences, user statements taken as evidence, and no sensor-tool evals.
- The "Searched from 1970 ... incomplete" note under a complete week is fixed: `fix/window-note` `4fb59bf` (from the deployed `ddd6292`) and `dev` `469e972`, both pushed; verified by a reproducing unit test, 280 tests in 11 suites, a live tool read on Algalita Pod (no model) and the live dashboard's notice code. Not deployed.
- Mirror test plan and remaining prompt and catalogue changes written; nothing paid was run; spend $0.

## Working tree

- Code moved to `~/code/work/clean-earth-rovers/` on 2026-10-04 (WSL rebuild); `~/release/` did not survive the move, and Docker's image store was emptied.
- Main checkout on `reflection` with the user's uncommitted path fixes (`.claude/settings.json`, `release/start-rc2-emulator.sh`) and the untracked `docs/migration/POST_RELEASE_ITEMS_EXPLAINED.html`; `_EXIT_CRITERIA.md`, `eval/grading/phase-1d-wave1-fixture-review.html`, `review-marked-up.html` and the root v2 PDF stay untracked on purpose.
- `docs/launch-handoff` (worktree `launch-handoff`) merges `task/release-l6-images` into `dev` and adds the backlog, three timeline rows and a runbook §3.4 correction; it awaits the coordinator's landing on `dev`.
- `dev` moved to `469e972` (the window-note fix, pushed at the user's request outside the coordinator); worktree `dev` holds it.
- This handoff: `docs/behavior-handoff` (worktree `behavior-handoff`) is `docs/launch-handoff` plus `dev` and adds the incident doc, a SPECS §19 rule, a timeline row and a backlog §3 row; the next behaviour chat works from it.
- cer-demo worktrees: 45 besides the main checkout; `window-note`, `dev` and `behavior-handoff` are the behaviour chat's; `release-l6` (pushed, merged here) and `launch-handoff` are this chat's; `post-launch-security` and `mirror-testing` are stale (2026-09-28) with nothing uncommitted.
- Upstream build worktrees `worktrees/build-cer-api-122136d` and `build-cer-ui-fc13d16` are clean detached checkouts of the live commits; the server and dashboard checkouts stay on `local`.
- Running: Docker container `cer-ui-l8-local` on 127.0.0.1:3000 (the release dashboard proxying to cer-api `rc2`, which is now live); the pre-move stacks (mirror, launch-issues, rc2 mirror) are gone.

## Open work

- User, behaviour: mirror details, the test budget (about $1, or $2 with the wave-1 check), whether to stop `cer-ui-l8-local` for port 3000, and whether natural-variation catalogue drafts go to the supervisor; deploy `469e972`'s fix when convenient.
- User: choose the post-launch order; send Michael the launch note; delete the test user `winsyu475+certest@gmail.com`; say when to stop `cer-ui-l8-local`; recover `~/release/` if a backup has it.
- Michael: revoke the old Gemini key and Gmail app password; optionally grant the user Cloud Build bucket write and `roles/datastore.user` on the `gilligan` database (usage resets); test before the `main` merges.
- Agent, behaviour: the mirror fixture, reproduction and prompt and catalogue changes in [`migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`](migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md) §5-6.
- Agent, post-launch: everything in [`migration/POST_LAUNCH_BACKLOG.md`](migration/POST_LAUNCH_BACKLOG.md), once ordered.
- Agent, upstream landing: build the `main` merges (server conflicts in `WaterAnalyticsService.ts`; take the release side); push on consent; tell Michael `62993fe` ships with server `main`.
- Agent, release follow-through: logs and spend in the first days; cer-gilligan to 2 instances after the restart check; remove stale tags (backlog §4).

## Unfixed defects

| Where | Defect | Severity |
|---|---|---|
| server `POST /api/v1/users/account/:id`, `POST`/`DELETE /api/v1/users/:id`, `POST /api/v1/users` | Any logged-in user can set any user's role, organization and email; admins can edit, promote, delete or create users in other organizations; live in production (landing doc §7 item 14). | high |
| server `WaterAnalyticsController.exportCsv` | Any logged-in user exports any pod's readings as CSV (finding 11); fixed on `8463545`, not shipped. | high |
| `../user-dashboard` `src/app/services/device-data.js:341`, `src/app/components/header.js` | A previous account's pod and organization lists survive logout and login in the same tab; a superadmin's pods show to the next account until a reload. | medium |
| Gilligan answers | One out-of-range reading flags a metric and prompts maintenance; the turbidity caveat repeats in almost every answer (backlog §1). | medium |
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
