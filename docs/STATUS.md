# Status

Updated 2026-09-30 by the upstream-landing chat, on branch `docs/release-pin` (from `dev` `5f00487`).
Current state and next steps only; history is `git log -p docs/STATUS.md`; never cite this file from code or other docs.

## Start here

- **Gilligan release, September 30**: tasks, owners and dates are in [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md), which wins over this file; the user deploys.
  Next: each chat reads its section of [`migration/GILLIGAN_RESET_2026-09-28.md`](migration/GILLIGAN_RESET_2026-09-28.md).
- **Upstream landing**: land the release in CER's `develop`, then `main`, of the server and dashboard ([`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md)).
  Next: the user's consent to push the two `develop` merges (landing doc section 6), and whether to run the paid delta test first.
- **Where we are**: `dev` is final for rc2 at `303280d` (the full `npm test` passes, 1584 tests); rc2 is cut (`release/rc2` `ddd6292`) and approved for release; Michael picked server `122136d` (`timeline.md`, 2026-09-29) with dashboard `fc13d16`; nothing is deployed.
  Critical path: Michael's setup, L5 no-traffic deploy, L6-L7 staged stack and demo (Sep 29), L8-L9 smoke and traffic (Sep 30); Sep 29 has no slack left.
- **Production fixes outside Gilligan**: with `122136d` the user routes, period query and invited login ship; the CSV export scope and empty-organization refusal follow launch (`timeline.md`, 2026-09-29).
- **Chats after the reset**: release (L4-L9), Gilligan behaviour, release plan (coordinator), release demo; suggested: server security fixes, mirror testing.
- **Coordination**: the coordinator alone writes `dev`, this file, the plan and the manual guide; other chats work on their own branch and worktree and report commit IDs; upstream pushes are new branches only, with the user's consent in chat.

## Last session

- Upstream landing: server `122136d` and dashboard `fc13d16` merged into CER's `develop` as local commits `5f04064` and `5ae4993`, trees identical to the release commits; not pushed.
- Checks: server typecheck and 10 unit suites (76 tests), dashboard tests 7/7 and production build, free end-to-end on ports 8082/5103/8012/3002 all pass; A6 ships as expected.
- A test script's unquoted `curl --noproxy *` sent fabricated mirror logins to three `.md` domains (landing doc finding 1); spend: none.

## Working tree

- Branch `dev`, pushed and level with `origin/dev`; `docs/release-pin` (`timeline.md` row, landing doc, this handoff) is pushed and awaits the coordinator; `_EXIT_CRITERIA.md`, `eval/grading/phase-1d-wave1-fixture-review.html`, `review-marked-up.html` and the root v2 PDF stay untracked on purpose.
- cer-demo worktrees in use: `gcp-test-env` (bot and Codex outputs, git-ignored), `e2e-rc` (the mirror's Gilligan), `release-candidate` (`release/rc1`, stale), `supervisor-brief` (uncommitted brief), `firestore-mirror` (untracked census script), `e7-corpus` (E7 `corpus.json` and cache), `launch-issues` (`7a2f2fc`, landed, branch unpushed).
  Removable: `e2e-dev`, `long-conversations`, `answer-quality-q1`, `cwa-old`, `e7-claims`, `e7-fixtures`, `feat+service-release`, `gilligan-runbook`, `gilligan-ux-contract`, `hygiene`, `l2-inputs`, `mirror-parity`, `per-turn-labels`, `q3-q5`, `q9-413`, `stale-claims`, `token-cap`, `upstream-publish`, `wave1-corrections`, `firestore-plan` (keep its branch).
- Upstream: local branches `land/gilligan-develop` in both repositories hold the `develop` merges; worktree `dashboard-land` is a clean `fc13d16` with a production build.
- Upstream worktrees are under `~/code/clean-earth-rovers/worktrees/` (release, mirror, citation-title, invited-login, cwa-old, dashboard-ux, dashboard-e2e, dashboard-release, and the launch-issues `*-original`, `*-release-demo`, `server-original-seed`); the server's `.worktrees/mirror` is `mirror/e2e-p3` `1ef21a7`.
- Running: another chat's rc2 mirror on 8081, 5102 (server `8463545`), 8011 and 3001; the landing stack on 8082, 5103, 8012 and 3002 has stopped; mirror emulator :8080 (2026-09-27 evidence), dashboard :3000 and Gilligan :8010; the mirror server :5101 has stopped (`MIRROR_RUNBOOK.md` §3); launch-issues emulator :8180 (viewer :4180), Current :3100 and :5201, Release :3300 and :5301.
- Git-ignored restored inputs: `node_modules/`, `.env`, corpus PDFs, `.ocr_cache/`, `data/corpus/` (Sep 21 corpus here), `data/embeddings/cache.json`; still missing `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/`, `serviceAccountKey.json`.

## Open work

- User, Michael (blocks every deploy): `cer-gilligan-runtime`; the Fireworks secret and grant; the service-key secret for the runtime and compute accounts (runbook §2.1 item 5); the `gilligan` database and grants; a TTL policy on `gilligan_usage.expireAt`; whether an organization policy forbids unauthenticated invocation (§2.1 item 6); disable the `cer-ui` trigger `8ad67b17`; rotate `DEVICE_API_TOKEN`, printed into a local transcript on 2026-09-28.
- User, launch blockers: findings 6 and 10 (recommended must); the A items per Michael; 8 should; 9 accept (recommended).
- User, go-aheads: build `task/q9-land`; the mirror's pH 2.07 and 18-hour event fixtures; the Gilligan behaviour decisions listed in the reset brief; U7 wording and placement; the history citation-marker fix.
- User, spend: mirror C1/D1 about $0.04, K21 and catalogue checks about $0.20, groups about $0.51; Gilligan behaviour checks about $0.21; dashboard recheck about $0.05; rc2 delta test up to $0.15; the rc2 embedding rebuild; E5 tools-on live smoke; five read-only live `gcloud` checks of Michael's setup (run with `!`).
- User, pushes: dashboard `task/gilligan-ux`; server `task/gilligan-citation-title`, `fix/invited-login`, the Q11 branch, the combined release commit before L6; optionally `test/launch-issues`.
- User, supervisor or Michael at the demo: the standing caveat in place of refusals; the pH 3-12 band; the demo date and key; the A items; Firestore access for cer-gilligan.
- User, landing: consent to push `develop` in the server and dashboard; approve or skip the delta test (up to $0.15); before `main`, disable trigger `8ad67b17`, list the other triggers, and tell Michael `62993fe` ships with server `main`.
- User, housekeeping: review the supervisor brief; mark the mirror review sheets (`data/e2e/`); stop the launch-issues stacks when idle; remove merged worktrees; the coordinate audit and `scripts/censusFirestore.ts` are optional.
- Agent, release plan: land `docs/release-pin` (Michael's answer is recorded there) and pin `RELEASE_CANDIDATE.md`'s server row to `122136d`.
- Agent, upstream landing: push `develop` on consent, then build the `main` merges (the server's conflicts in `WaterAnalyticsService.ts`; take the release side) per the landing doc.
- Agent, Gilligan behaviour: Q10 findings 6, 8, 10 and 7, K21, U7, citation markers, follow-ups (reset brief, "Gilligan behaviour").
- Agent, release: rc2, re-ingest and checksums, production-mode run, `RELEASE_CANDIDATE.md`, then L5-L8 (reset brief, "Release").
- Agent, release demo: walkthrough corrections, browser checks, CER `main` comparison, demo script (reset brief, "Release demo").
- Agent, suggested: Q11 and A6 server branches; mirror testing (reset brief sections of those names).

## Unfixed defects

| Where | Defect | Severity |
|---|---|---|
| server `WaterAnalyticsController.exportCsv` | Any logged-in user exports any pod's readings as CSV (finding 11, Q11); reproduced on CER's own code; fixed on `8463545`, which does not ship (Michael, 2026-09-29). | high |
| server user routes, `findPeriodWaterData` | Unauthenticated `/users/all`, `/users/:id`, `/test-db` (reproduced on CER's code) and the period-query membership hole are fixed on pushed branches and the release branch, not deployed. | high |
| cer-demo answers and PDF | A moved pod's answer, PDF title and summary claim the full period (finding 6, Q10). | high |
| cer-demo merged history | A fresh-water survivor is judged on a salt-water predecessor's conductivity (finding 10, Q10). | high |
| tools-on answers, `src/devices/plausibility.ts`, report | Silent pods missing from "online" (C1), pH 2.07 plausible (D1), no reading age in the PDF, empty 1-day series: fixed on `cloud/q9-*`, not landed. | high |
| `release/rc1`, `test/e2e-rc` | Pair dashboard `9e18555` (reader notes only) with a cer-demo before `5922109` that sends none; rc2 and the mirror must move. | high |
| Cloud Build trigger `8ad67b17` (`cer-ui`) | Builds and deploys on every push to the dashboard's infected `main`; still enabled. | high |
| server `GilliganService.askQuestionGemini` | Calls the retired `gemini-pro`; production Gilligan fails every question and is no rollback (D9). | high |
| `src/prompt/promptBuilder.ts:112` | Earlier answers' citation markers reach the model unchanged; in turns 9-12, 13 of 33 citations point at the wrong excerpt; the gate misses it. | medium |
| cer-demo referrals | "My pod is broken" is declined instead of referred to sales@cleanearthrovers.com (finding 8); may be a catalogue-off artifact. | medium |
| server `UserService.login` | An invited user with no password gets 500; fixed in the release `122136d`, not deployed. | medium |
| server `assignOrganization` | A non-superadmin with an empty organization sees every pod (10/10 on the landing mirror); no production user has one; fixed on `8463545`, which does not ship. | medium |
| tools-on answers | Withheld-history note dropped, water-type note misparaphrased, high dissolved oxygen not flagged (Q8); a pod silent 30 hours reported active "in the last 24 hours". | medium |
| answers (`glm-5p3-flash`) | Refusal wording varies between runs; cross-document answers score 0.83. | medium |
| R4 judge, ungrounded dimension | Weak agreement with reference grades (kappa 0.23); ungrounded rates are indicative only. | medium |
| `eval/fixtures-wave1/` | 84/90 turns have explanatory sources outside the ◆G9 slice. | medium |
| `src/report/buildReportInput.ts:548` | A report with no usable readings shows the model-facing site note as "Tool failed". | low |
| `src/tools/getPodThresholds.ts` | Rejected (unset or inverted) limits have no reader note. | low |
| eval gates | Catalogue-id markers such as `【fault-first】` count as invalid citations. | low |
| server `src/schemas/waterData.schema.ts` | Legacy unauthenticated `/water-data`, `/device`, `/duration/*` fail on real rows; remove or authenticate after launch. | low |
| server `findPeriodWaterData` | Slices an organization's labels to 10 for the `in` query. | low |
| server charts (CER's own code) | Chart timestamps run 7 hours past their labels; unverified in a browser. | low |
| `src/prompt/promptBuilder.ts` `buildMessages` | CONTEXT is a second system message, which `minimax-m3` drops; probe any new model. | low |
| tools-off answers (`gpt-oss-120b`) | Can loop on malformed citation markers. | low |
| `../user-dashboard` `src/app/gilligan/page.js` | `useSearchParams` outside Suspense deopts the page to client rendering. | low |
| `/tmp/eval-fixtures-*` | 131 directories leaked before the hygiene fix remain. | low |

## Active traps

- Upstream history carries malware (tips are clean; it runs on `next dev`, `next build`, `npm test`): never check out `main`, `develop` or an old commit; scan with `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or switch.
- Quote curl's proxy bypass as `--noproxy '*'`; bare `*` expands to file names, and `README.md`, `CLAUDE.md` and `AGENTS.md` resolve as internet hosts.
- `~/release/rc2-mirror.env.sh` sets the production `FIRESTORE_PROJECT_ID`; override it with `demo-cer-mirror` when reusing it. Background processes here stop after 30 minutes unless given a longer limit.
- `.env` sets `SENSOR_TOOL` and `REPORT_TOOL` true, which means live production reads: captures and judge runs set both false.
- Application default credentials exist here: the mirror uses project `demo-cer-mirror`, but the launch-issues emulator :8180 uses the production id, so start it and everything that talks to it only with `emulator-original/guard.env`.
- The launch-issues stacks listen on every interface, so the Current server's open user routes are reachable from the LAN while it runs.
- The mirror's `e2e-rc/.env` has no `CATALOGUE_PROMPT` line (defaults false); set it true for behaviour checks, as the release does.
- `PREDECESSOR_PERIOD_HANDOFF` stays off in production until the patched server takes all cer-api traffic.
- Every `cer-gilligan` guard fails open when unset: set 20 messages, 5 reports and 1,000,000 tokens explicitly.
- Production reads go through the user; the auto-mode classifier refuses them from agents and sometimes blocks commits and pushes.
- Never run the server's integration suites (they hit the real `qa-db`); run server unit suites with `FIRESTORE_EMULATOR_HOST=127.0.0.1:1`; the server `.env` cannot be copied.
- Services read `.env` at boot only; fresh worktrees lack `node_modules`, `.env` and `data/` (`run-local`); `EnterWorktree` cuts from `origin/main`, so reset onto `dev`.
- Run Jest suites singly with `--runInBand`; never kill 8000; coordinate ports before starting a stack.
- R4 judge runs pass `--judge-model=accounts/fireworks/models/deepseek-v4p1-flash` and `--run=<id>`; GLM needs `LLM_REASONING_EFFORT=low`.
- Re-ingesting with a different tesseract build moves 12 chunk ids; the main checkout's `data/corpus/` is the Sep 21 corpus until rc2 re-ingests.
- The device token is superadmin with no `exp` claim; nothing is deployed.

## Where things live

- Release: [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md), [`migration/GILLIGAN_RESET_2026-09-28.md`](migration/GILLIGAN_RESET_2026-09-28.md), [`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md), [`migration/GILLIGAN_MANUAL_TEST_GUIDE.md`](migration/GILLIGAN_MANUAL_TEST_GUIDE.md), [`migration/MIRROR_RUNBOOK.md`](migration/MIRROR_RUNBOOK.md), [`migration/LAUNCH_ISSUES_CHECKLIST.md`](migration/LAUNCH_ISSUES_CHECKLIST.md), [`migration/GILLIGAN_E2E_RESULTS_2026-09-27.md`](migration/GILLIGAN_E2E_RESULTS_2026-09-27.md), [`migration/E2E_CHECKLIST.md`](migration/E2E_CHECKLIST.md)
- Security and environment: [`migration/SECURITY_FINDINGS.md`](migration/SECURITY_FINDINGS.md), [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md), [`migration/GILLIGAN_FIRESTORE_FRAMEWORK.md`](migration/GILLIGAN_FIRESTORE_FRAMEWORK.md)
- Behavior: [`SPECS.md`](SPECS.md); architecture: [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md)
- Decisions: [`timeline.md`](timeline.md)
- Evaluation: [`EVAL_REBUILD.md`](EVAL_REBUILD.md), [`../eval/reviews/phase3-2026-09-23/R4_REPORT.md`](../eval/reviews/phase3-2026-09-23/R4_REPORT.md)
- Conventions: [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md); people: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md)
