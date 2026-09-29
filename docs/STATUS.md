# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-28 by the release coordinator as the baseline for a second full reset of every chat, after a roundup of all reachable sessions; `dev` at the commit that carries this file.

## Start here

- **Gilligan release, September 30.**
  Tasks, owners and dates are in [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md) (IDs such as Q10, E7, L5); where this file and the plan disagree, the plan wins.
  The plan's rows are partly stale (U1-U6 and P5 are done; Q9, Q10 and Q11 are not landed); refreshing it is the release-plan chat's first job.
  The user deploys.
- **Where we are (freeze day, Sep 28).**
  `dev` is not final: Q9 (`task/q9-land`), Q10 and Q11 are not written or landed, U7 is not written, and rc2 has not been cut.
  Nothing is deployed, and every deploy still waits on Michael's one-time setup.
  Critical path: Michael's setup, then cer-gilligan no-traffic deploy (L5), then staged server and dashboard plus the supervisor demo (L6, L7, Sep 29), then smoke and traffic (L8, L9, Sep 30).
  With L5 not done on Sep 28, Sep 29 has no slack left.
- **Production fixes outside Gilligan (user rule, 2026-09-28).**
  Server and dashboard defects that are not Gilligan code (CSV export, user routes, period query, invited login, empty organization) are shown to Michael on fabricated data first.
  They ship at launch only with his go-ahead; otherwise they wait until after launch.
  The staged server (L6) is built before the demo, so his answer is needed before L6; without it the release candidate builds a Gilligan-only server commit.
- **Coordination rules.**
  One coordinator is the only writer of `dev`, this file, the plan and the manual guide.
  Every other chat works on its own branch and worktree and reports commit IDs to the coordinator, who reviews the actual diff and lands it.
  Upstream pushes are new branches only, each with the user's consent in chat.
  On 2026-09-28 the launch-issues chat landed its own docs on `dev` at the user's request (`d2ad8b8`, `c8b3ff1`); that was a one-off.

## Chats after this reset

The user asked for four; the coordinator suggests three more.
Each prompt should name the open-work entry below that it inherits.

1. **Release (release candidate and deploy assist; L4-L9).** Cut rc2 once `dev` is final; production-mode run; `RELEASE_CANDIDATE.md`; then guide L5-L8 from the runbook.
2. **Gilligan behaviour (cer-demo code).** How answers use catalogue entries and refer people to CER: finding 8 (referral), K21 (entries only with evidence), the U7 caveat, findings 6, 7 and 10, the history citation-marker defect; takes over the fix round's Q10 plan and its decisions.
3. **Release plan (coordinator).** Refresh the plan, land branches, keep this file and the guide current, declare `dev` final for rc2, move open "should" tasks after launch.
4. **Release demo.** The Michael and supervisor demo: launch-issues evidence (A items on CER's own code), the supervisor brief, a demo script, the demo stack and key.
5. *Suggested:* **Server security fixes (Q11 and A6), gated on Michael.** Written on new server branches so they are ready if he says yes.
6. *Suggested:* **Mirror testing.** Build-and-rerun for `task/q9-land` (C1, D1), K21 and the pH 2.07 and 18-hour event fixtures, the 23 unjudged REVIEW rows, groups B, D, E, H and I.
7. *Suggested:* **Eval wrap-up.** Finish the k=30 capture 2 on `task/long-conversations`, revert `2587add`, land the branch.

## Last session

- Coordinator (2026-09-28):
  - Landed `task/e7-corpus` `df7d845` (`7271828`), `task/per-turn-labels` `30d3beb` (`4c318ea`; both label sets regenerate byte-identical), `hygiene/stale-claims-2026-09-28` `d02d567` (`b72ad54`) and `docs/gcp-test-env` `36416ae` (`b021eb3`, finding 11 and M11).
  - Typecheck, lint and the touched suites pass singly after each merge.
  - Added guide K21 (catalogue entries only with evidence, tools on) and marked E7 landed in the plan.
  - Deleted the launch-issues chat's unused production-export script `firestore-copy.sh` at the user's request.
- Launch-issues chat (2026-09-28): rehearsal stacks on fabricated data (Current = CER's own code `693fc96`/`5dff5fd`; Release = `122136d`/`9e18555`); A1, A2, A3, A5, A6 and U1-U4 run on both, $0 (results below).
- A Codex run of mirror groups B, D, E, H and I (`codex-bdehi-2026-09-28`, about $0.34): 9 pass, D6 (finding 11) and D4 (empty organization) fail, 23 REVIEW rows unjudged.
- Eval (2026-09-28): long-conversation test fails its pre-set rule only through the cross-document slot; a citation-marker defect found; k=30 capture 1 not adopted.
- User decisions (2026-09-28, `timeline.md`): production fixes outside Gilligan wait for Michael; launch-issue rehearsal on fabricated data; the mirror stack branches pushed so `MIRROR_RUNBOOK.md` works elsewhere; the fabricated data copied into CER-DEV database `cer-demo-fixtures` (about $0.02).

## Open work

Each item names the chat that owns it after the reset.

- **Release plan (coordinator).**
  - Build `task/q9-land` in a worktree from `dev`: merge `origin/cloud/q9-c1-d1` `ad7eec9` (contains `cloud/q9-logic` `bc097e1`), resolve the conflicts in `src/tools/listPods.ts` (keep Q9's single pod-status rule and `dev`'s reader notes) and `docs/migration/E2E_CHECKLIST.md`, run checks, push; land only after the mirror's C1 and D1 rerun passes.
  - Land when reported: the Q10 branch, U7, `task/long-conversations` (only once `2587add` is reverted), `test/launch-issues` results.
  - Refresh the plan (U1-U6, P5 done; Q9-Q11 state; E7 done; the user's production-fix rule).
  - Rewrite guide K12, which still expects refusals; the standing caveat (K20) replaced them.
  - Fix runbook §3.1 (release rows predate the candidate), add `PREDECESSOR_PERIOD_HANDOFF=false` and `DEFAULT_TOP_K=20` to §4.1, add §2.1 item 5 (service-key secret) to the Michael list, and give §2.1 item 6 (organization policy on unauthenticated invocation) a fallback.
  - `SECURITY_FINDINGS.md` §5 item 1 says the sibling routes check organization, which §7 contradicts; A2's leaked fields are id, name, userName, email and devices (not role or organization).
  - Tell the release candidate when `dev` is final; on Sep 28 move open "should" tasks after launch.
  - Do not land `docs/firestore-testing-plan` (`60befd4`); keep it as history.
- **Gilligan behaviour (new chat; takes over the fix round).**
  The fix round planned but wrote nothing; its plan, by finding:
  - 6: `src/tools/querySensorData.ts` reports the full window as `time_range_resolved`; `src/report/buildReportInput.ts:340` takes the PDF title and Summary dates from it; the Data Quality row mixes values (1,728) and rows (432).
  - 10: `src/devices/mergeChains.ts` `resolveChain` admits same-organization predecessors with no water-type check. With the handoff off at launch, only a visible predecessor can hit it. Proposed: a cer-demo guard now, a server check in `findInheritedLabels` before the handoff is ever enabled, a `SPECS.md` §19 note.
  - 8: no approved catalogue entry covers "my pod seems broken"; `check-power-connection` (which carries the sales@cleanearthrovers.com referral) is limited to missing, delayed or stuck readings. Proposed: widen only its conditions as version `2026-09-27.1`, with user and supervisor approval. First recheck with `CATALOGUE_PROMPT=true`: the 2026-09-27 mirror run had no such line in `.claude/worktrees/e2e-rc/.env`, so it ran without the catalogue.
  - 7: `dev` emits a "Location not recorded" note; recheck on a stack at `5922109` or later.
  - Also: K21 (tools-on catalogue entries), U7's final wording, the history citation-marker defect (below).
  - Follow-ups: `buildReportInput.ts:548` (site note as error); `getPodThresholds.ts` (no reader note for rejected limits); Q9 leftovers after `task/q9-land` lands (`buildReportInput.ts:289` "sensor rails", `src/report/types.ts` `lastReadingAt` comment, PDF age clock, `excluded_implausible_min/max` spread).
  - Planned branch `fix/q10-gilligan` from `dev` after `task/q9-land` lands (they touch `querySensorData`, `buildReportInput` and `renderPdf`); ports 8011 and 5102 proposed; about $0.21 of paid checks.
- **Server security fixes (suggested chat; gated on Michael).**
  - Q11 (finding 11): factor `findPeriodWaterData`'s membership logic into one helper for the CSV export too; `findDeviceWaterDataExportCSV` also crashes on an unknown label. `local` lacks `findInheritedLabels`, so cut from `task/gilligan-cwa-old` `9751f8f` (user decision).
  - A6 (empty organization sees every pod, `assignOrganization`): not written.
- **Release (restart; L4-L9).**
  - Local, unpushed unless noted: server `release/gilligan-2026-09-30` `122136d` (worktree `server-release`; local `d12ad6d` plus `9751f8f`, `f9607bd`, `9ef59b7`, `0003170`, `b443e41`, `f7dec3c`; no Q11); server `mirror/release-rc1` `d1821bd`; dashboard `release/gilligan-2026-09-30` `9e18555` (pushed 2026-09-28; `817a7c2` is one commit ahead); cer-demo `release/rc1` `5367164` (stale).
  - rc2: final `dev`, dashboard `817a7c2` plus U7, the server release plus Q11 if Michael agrees, or a Gilligan-only server commit if not.
  - The main checkout's `data/corpus/corpus.json` is still the Sep 21 corpus and `release/artifacts.sha256` matches it; rc2 must run `npm run ingest` from the existing OCR cache, rebuild the embedding cache for 457 chunks (a small paid call; confirm the cost), and regenerate the checksums.
  - Proposed ports 8081, 5102, 8011 and 3001 (8011 is in use by the eval chat); the "delta test" means the paid rc2 rows (G1, G3, and B1, C1, F2 rechecks), capped at $0.15.
  - Supervisor brief `docs/migration/SUPERVISOR_BRIEF.html` is still uncommitted in worktree `supervisor-brief` (`docs/supervisor-brief` `73770d2`), awaiting the user's review.
  - Deploy assist found `§4.1` matches `src/config/index.ts`; it proposed staging L5-L7 on the memory store with `max-instances=1` if Firestore is still pending, and requiring the Firestore store before L9.
- **Dashboard (fold into Release or Gilligan behaviour).**
  `task/gilligan-ux` `817a7c2` in `~/code/clean-earth-rovers/worktrees/dashboard-ux`; `origin/task/gilligan-ux` is at `5356415`, and `b014e94` through `817a7c2` (U3, U1, P5, X1/X2, U5, U6, pod-named notes) are unpushed.
  U7 not started; proposed placement: small muted text directly above the "Sources (n)" toggle in `src/app/components/gilligan-answer.js` (about line 286), shown only when `usedCitations(text, citations)` is non-empty, with a case in `test/provenance.test.mjs`.
  Server `task/gilligan-citation-title` `b443e41` has no remote branch.
- **Release demo (new chat).**
  - Launch-issues evidence, `.claude/worktrees/launch-issues` (`test/launch-issues` `a56c8ef`, merged): the checklist's new results are uncommitted there because the auto-mode classifier blocked that chat's commit; the user commits them, then the coordinator lands them.
  - Results on CER's own code (Current) vs Release: A1 CSV export 200 with 165 rows of other organizations' pods on both (Q11 not written); A2 no-token `/users/all`, `/users/:id`, `/test-db` 200 on Current, 401/401/404 on Release; A3 period query 200 on Current, 400 on Release; A5 invited login 500 with a raw validation dump on Current, 401 "Finish setting up your account..." on Release; A6 the orphan sees all 5 pods on both, period data 200 on Current, 400 on Release, CSV 200 on both; U1-U4 pass on both at API level.
  - Walkthrough corrections: A3 drop `/water/last` (CER already scopes it); A5 the page likely shows "Login failed: " plus the dump; A2 leaked fields as above. Browser checks still needed: A5's page message, the orphan's pod count on `/home`, U3 rendering.
  - Before the demo, compare the A1 and A3 functions on CER's `main` with `git show` (read only); production's exact commit is unknown.
  - Supervisor brief review; demo script; demo stack and key (release candidate proposes the staged stack with `cer-gilligan-fireworks-api-key`, falling back to local rc2 with the development key).
- **Mirror testing (suggested chat).**
  - Stack: server `mirror/e2e-p3` `1ef21a7` and cer-demo `test/e2e-rc` `77cd4c9` (both pushed 2026-09-28), dashboard `dashboard-e2e` at `9e18555`; setup in [`migration/MIRROR_RUNBOOK.md`](migration/MIRROR_RUNBOOK.md).
  - Next: C1 and D1 on `task/q9-land` (about $0.04) once fixtures exist for a silent pod and a pH 2.07 reading; K21 a/b/c plus finding 8 recheck and chat-condition entries (about $0.20; K21b needs an 18-hour freshwater dissolved-oxygen fixture); groups B, D, E, H, I and finding 7 (about $0.51), all with `CATALOGUE_PROMPT=true` and `CATALOGUE_DRAFTS=false`; judge the Codex run's 23 REVIEW rows (`.claude/worktrees/gcp-test-env/data/e2e/codex-bdehi-2026-09-28/`); the bot has no H or I scenarios.
  - Recommendation: `0003170`'s `FIRESTORE_PROJECT_ID` supersedes `1ef21a7`'s `MIRROR_PROJECT_ID`; move the mirror to `mirror/release-rc1` or its rc2 successor. Phase 2 not before launch.
  - About $2.56 plus $0.34 (Codex) of the $10 mirror budget spent.
- **Eval wrap-up (suggested chat, or the release-plan chat).**
  `task/long-conversations` (`.claude/worktrees/long-conversations`): pushed to `e6e3674`; local `2587add` re-applies `DEFAULT_TOP_K=30` for a running capture and must be reverted before landing.
  When capture `k30-b-lv-glm-2026-09-28` finishes: revert `2587add`, stop the 8011 server, run `gate:check` and one `--final` judge pass, apply the `e6e3674` rule (`EVAL_REBUILD.md`, "local-vector k=30: results"), record, push, report.
  R4 spend about $1.46 this round; about $5.60 of $8.07 left after capture 2.
- **Stop:** every chat that answered the 2026-09-28 roundup (`gilligan fix round planning`, `cer-demo-9a`, `cer-demo-7d`, `cer-demo-8f`, `cer-demo-af`, `cer-demo-c2`, `gilligan release reconciliation`, `cer-demo-23`, `cer-demo-92`, `e2e session documentation review`), after `cer-demo-d6` finishes its capture steps; `cer-demo-25` (busy) and `cer-demo-c1` did not accept messages.
  Cloud sessions `Docs link and reference audit` (told to branch `cloud/docs-link-audit`) and `Gilligan release consistency audit` have not reported.

## User decisions and actions

- **Michael (blocks every deploy).**
  "Act as" is restored.
  Still open: create `cer-gilligan-runtime`; the Fireworks secret and its grant; the service-key secret readable by the runtime and compute accounts (runbook §2.1 item 5); the dedicated `gilligan` Firestore database and grants; a TTL policy on `gilligan_usage.expireAt`, never `updatedAt`; whether an organization policy forbids unauthenticated invocation of `cer-gilligan` (§2.1 item 6); disable the `cer-ui` trigger `8ad67b17`.
  Also: rotate `DEVICE_API_TOKEN`, which a chat printed into its local transcript on 2026-09-28.
  Deploy assist asked the user to approve five read-only live `gcloud` checks of this setup (run by the user with `!`).
- **Launch blockers:** findings 6 and 10 (Gilligan, recommended must); 11 and the other A items depend on Michael's go-ahead; 8 should; 9 accept (recommended).
- **Gilligan behaviour decisions (from the fix round):** 10 as a blocker or not; the water-class rule (withhold a predecessor whose registered water type differs, recommended); the moved-pod wording; Data Quality units; widening `check-power-connection`'s conditions; the pH 3-12 band; the thresholds-note wording; Q11's base branch (`9751f8f`, recommended).
- **Go for `task/q9-land`** and for the mirror's pH 2.07 and 18-hour event fixtures ($0 each).
- **Spend approvals:** mirror C1/D1 about $0.04, K21 and catalogue checks about $0.20, groups about $0.51; Gilligan behaviour checks about $0.21; dashboard recheck about $0.05; rc2 delta test up to $0.15; E5 tools-on live smoke; the rc2 embedding cache rebuild.
- **U7:** the wording ("Answers draw on document excerpts and may not cover every step; check the cited sections before acting.", recommended as is) and placement (above the Sources toggle, only when documents are cited).
- **History citation markers:** strip or renumber markers from earlier answers, or change the prompt line (see defects).
- **Pushes (consent):** dashboard `task/gilligan-ux`; server `task/gilligan-citation-title`, `fix/invited-login`, the Q11 branch, and the combined server release commit before L6.
- **Supervisor or Michael, at the demo:** the standing caveat in place of refusals (E4, D3); the pH 3-12 band; the demo date and Fireworks key; the A items (CSV export, user routes, period query, invited login, empty organization) and whether they ship; Firestore access for cer-gilligan.
- **Housekeeping:** commit the launch-issues checklist results; review the supervisor brief; mark the mirror review sheets (`data/e2e/`); stop the launch-issues stacks when not in use (they listen on all interfaces, so A2's open routes are reachable from the LAN); remove merged worktrees.
- **Optional:** the coordinate audit (`scripts/coordinateAudit.ts`); `scripts/censusFirestore.ts` (untracked in `.claude/worktrees/firestore-mirror`, lint errors; commit or drop).

## Working tree

- `dev` is pushed and level with `origin/dev`; `_EXIT_CRITERIA.md`, `eval/grading/phase-1d-wave1-fixture-review.html`, `review-marked-up.html` and the root v2 PDF stay untracked on purpose.
- cer-demo worktrees in use: `launch-issues` (uncommitted checklist results), `long-conversations` (`2587add` local), `gcp-test-env` (bot and Codex run outputs, git-ignored), `e2e-rc` (`test/e2e-rc`, the mirror's Gilligan), `release-candidate` (`release/rc1`, stale), `supervisor-brief` (uncommitted brief), `firestore-mirror` (untracked census script), `e7-corpus` (holds the E7 `corpus.json` and cache), `e2e-dev` (detached `b07f950`, setup only, removable).
  Merged and removable: `answer-quality-q1`, `cwa-old`, `e7-claims`, `e7-fixtures`, `feat+service-release`, `gilligan-runbook`, `gilligan-ux-contract`, `hygiene`, `l2-inputs`, `mirror-parity`, `per-turn-labels`, `q3-q5`, `q9-413`, `stale-claims`, `token-cap`, `upstream-publish`, `wave1-corrections`, and `firestore-plan` (unmerged history, keep the branch).
- Upstream worktrees under `~/code/clean-earth-rovers/worktrees/`: `server-release`, `server-release-mirror`, `server-citation-title`, `server-invited-login`, `server-cwa-old`, `dashboard-ux`, `dashboard-e2e`, `dashboard-release`, and the launch-issues `server-original`, `dashboard-original`, `server-release-demo`, `dashboard-release-demo`, `server-original-seed`; the server's `.worktrees/mirror` is `mirror/e2e-p3` `1ef21a7`.
- Running processes:
  - Mirror: Firestore emulator :8080 (java 2171997, holds the 2026-09-27 evidence), dashboard :3000 (2176422), server :5101 (1403953) and Gilligan :8010 (1403658), the last two started by the deploy-assist chat at the user's request.
  - Launch issues: emulator :8180 (viewer :4180, production project id, `emulator-original/guard.env`), Current :3100 and :5201, Release :3300 and :5301, all on every interface.
  - Eval: cer-demo :8011 with `DEFAULT_TOP_K=30` and a background capture, from `long-conversations`.
- Git-ignored restored inputs: `node_modules/`, `.env`, corpus PDFs, `.ocr_cache/`, `data/corpus/` (Sep 21 corpus in the main checkout), `data/embeddings/cache.json`. Still missing: `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/`, `serviceAccountKey.json`.
- Browsable HTML of the release docs is outside the repo at `~/code/clean-earth-rovers/docs-html` (`build.py` regenerates it).

## Unfixed defects

| where | defect | severity |
|---|---|---|
| server `WaterAnalyticsController.exportCsv` | Any logged-in user can export any pod's readings as CSV (mirror finding 11; plan Q11); reproduced on CER's own code `693fc96` on 2026-09-28, so likely in production. | high |
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
| `src/report/buildReportInput.ts:548` | A report with no usable readings returns the model-facing site note, shown as "Tool failed: … best_lat and best_lon …". | low |
| `src/tools/getPodThresholds.ts` | Rejected (unset or inverted) limits have no reader note. | low |
| server `src/schemas/waterData.schema.ts` | Rejects production-shaped rows, so the legacy unauthenticated `/water-data`, `/device` and `/duration/*` routes fail on real data; after launch, remove or authenticate those routes rather than loosen the schema (`SECURITY_FINDINGS.md` §5 item 2). | low |
| server `findPeriodWaterData` | Slices an organization's labels to 10 for the `in` query (pre-existing; guide M14). | low |
| `src/prompt/promptBuilder.ts` `buildMessages` | CONTEXT is a second system message, which `minimax-m3` drops; probe any new model. | low |
| tools-off answers (`gpt-oss-120b`) | Can loop on malformed citation markers. | low |
| `../user-dashboard` `src/app/gilligan/page.js` | `useSearchParams` outside Suspense deopts the page to client rendering. | low |
| `/tmp/eval-fixtures-*` | 131 directories leaked before the hygiene fix remain. | low |
| cer-demo history (`src/prompt/promptBuilder.ts:112`, `src/prompt/systemPrompt.ts:97` and `:220`) | Citation markers from earlier answers reach the model unchanged while each turn renumbers excerpts from 1, so in turns 9-12 of long chats 13 of 33 quoted citations point at the wrong excerpt; the citation gate misses it. | medium |
| eval gates | Catalogue-id markers such as `【fault-first】` count as invalid citations. | low |
| server charts (CER's own code) | Chart point timestamps run 7 hours past their labels on Current and Release; unverified in a browser. | low |

## Active traps

- **Upstream history carries malware**; branch tips are clean. It runs on `next dev`, `next build` and `npm test`. Never check out `main`, `develop` or an old commit; scan with `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or branch switch.
- **`SENSOR_TOOL` and `REPORT_TOOL`**: on means live production reads; `.env` sets both `true`, so captures and judge runs must set both `false` explicitly.
- `PREDECESSOR_PERIOD_HANDOFF` stays off in production until the patched server takes all cer-api traffic; the mirror sets it `true` because its server is patched.
- Production reads go through the user: the auto-mode classifier refuses them from agents even with chat approval, and it also refused one worktree inspection and one commit today.
- The mirror now runs under a `demo-` project (`demo-cer-mirror`) on `1ef21a7` and `d1821bd`; older stacks used the production project id with the emulator host set. Application default credentials exist on this machine, so a missing emulator host would reach production. The launch-issues emulator :8180 also uses the production id (CER's original server has it built in); start it and every process that talks to it only with `emulator-original/guard.env` loaded.
- The server's integration suites (`test/setup/testDb.ts`) connect to the real `qa-db`: never run them. Its Jest `roots` spans sibling worktrees: run server unit suites with `FIRESTORE_EMULATOR_HOST=127.0.0.1:1`. The server `.env` cannot be copied (deny rule).
- Every `cer-gilligan` guard defaults to off or unlimited (quota, store, window, retrieval); a release environment file missing a variable fails open. Set 20 messages, 5 reports and 1,000,000 tokens explicitly.
- Both servers read `.env` at boot only; a fresh worktree has no `node_modules`, `.env` or `data/` (link per the `run-local` skill). `EnterWorktree` cuts from `origin/main`; reset onto `dev`.
- Run Jest suites singly with `--runInBand`; use port 8010, never kill 8000. The mirror stack holds 8080, 5101, 8010 and 3000; coordinate before starting another stack.
- R4 judge runs must pass `--judge-model=accounts/fireworks/models/deepseek-v4p1-flash`; GLM rejects reasoning off, so use `LLM_REASONING_EFFORT=low`; `gold-context` runs with `QUERY_REWRITE` off; captures and judge runs need `--run=<id>`.
- Re-ingesting with a different tesseract build moves 12 chunk ids and voids labels. Anything in `documents/` is ingested; keep the v2 PDF at the repo root.
- `scores.csv` notes hold unquoted commas: edit rows line by line.
- The device token is superadmin with no `exp` claim.
- The launch-issues stacks (:3100, :3300, :5201, :5301) listen on every interface; the Current server's open user routes are reachable from the LAN while it runs.
- The mirror's `.claude/worktrees/e2e-rc/.env` has no `CATALOGUE_PROMPT` line, so it defaults to false; set it `true` for any behaviour check, as the release does.
- `task/long-conversations` holds a local `DEFAULT_TOP_K=30` commit (`2587add`); never land it while that is at the tip.
- The main checkout's `data/corpus/` is the Sep 21 corpus; the E7 corpus is only in `.claude/worktrees/e7-corpus` until rc2 re-ingests.
- Nothing is deployed; all testing is local.

## Where things live

- **Release**: [`migration/GILLIGAN_RELEASE_PLAN.md`](migration/GILLIGAN_RELEASE_PLAN.md), [`migration/MIRROR_RUNBOOK.md`](migration/MIRROR_RUNBOOK.md), [`migration/LAUNCH_ISSUES_CHECKLIST.md`](migration/LAUNCH_ISSUES_CHECKLIST.md) (with `LAUNCH_ISSUES_WALKTHROUGH.html` and `LAUNCH_ISSUES_EXPLAINED.html`), [`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md), [`migration/GILLIGAN_MANUAL_TEST_GUIDE.md`](migration/GILLIGAN_MANUAL_TEST_GUIDE.md) (checks, demo and smoke paths), [`migration/LIVE_TEST_LIST.md`](migration/LIVE_TEST_LIST.md), [`migration/E2E_CHECKLIST.md`](migration/E2E_CHECKLIST.md), [`migration/GILLIGAN_E2E_RESULTS_2026-09-27.md`](migration/GILLIGAN_E2E_RESULTS_2026-09-27.md), [`migration/GILLIGAN_FIRESTORE_FRAMEWORK.md`](migration/GILLIGAN_FIRESTORE_FRAMEWORK.md), [`migration/MIRROR_PRODUCTION_PARITY.md`](migration/MIRROR_PRODUCTION_PARITY.md), [`migration/MIRROR_RUNBOOK.md`](migration/MIRROR_RUNBOOK.md), [`migration/LAUNCH_ISSUES_CHECKLIST.md`](migration/LAUNCH_ISSUES_CHECKLIST.md).
- **Gilligan**: [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) (decisions D1-D12), [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md).
- **Environment and security**: [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md), [`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md), [`migration/SECURITY_FINDINGS.md`](migration/SECURITY_FINDINGS.md), [`migration/BACKEND_FIELDS.md`](migration/BACKEND_FIELDS.md).
- **Behaviour and decisions**: [`SPECS.md`](SPECS.md), [`timeline.md`](timeline.md), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md).
- **Evaluation**: [`../eval/reviews/phase3-2026-09-23/R4_REPORT.md`](../eval/reviews/phase3-2026-09-23/R4_REPORT.md), [`EVAL_REBUILD.md`](EVAL_REBUILD.md), [`GRADING_GUIDE.md`](GRADING_GUIDE.md).
- **People**: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md), [`ARCHIVED.md`](ARCHIVED.md), house rules in [`../CLAUDE.md`](../CLAUDE.md) and `.claude/skills/`.
