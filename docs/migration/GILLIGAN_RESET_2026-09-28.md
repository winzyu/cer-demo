# Gilligan chat reset, 2026-09-28

The release coordinator's roundup of every reachable chat on freeze day, and what each chat after the reset inherits.
Tasks, owners and dates stay in [`GILLIGAN_RELEASE_PLAN.md`](GILLIGAN_RELEASE_PLAN.md); where this brief and the plan disagree, the plan wins.
Commit IDs are as reported on 2026-09-28; check them against the repositories before acting.

## Chats after the reset

The user asked for the first four; the coordinator suggested the last two.

1. **Release (release candidate and deploy assist; L4-L9).** Cut rc2 once `dev` is final, run the production mode, write `RELEASE_CANDIDATE.md`, then guide L5-L8 from the deployment runbook.
2. **Gilligan behaviour (cer-demo code).** How answers use catalogue entries and refer people to CER: finding 8, K21, U7, findings 6, 7 and 10, and the history citation-marker defect. It takes over the fix round's Q10 plan below.
3. **Release plan (coordinator).** Refresh the plan, land branches, keep the status file and the manual guide current, declare `dev` final for rc2, and move open "should" tasks after launch.
4. **Release demo.** The Michael and supervisor demo: launch-issue evidence, the supervisor brief, a demo script, the demo stack and key.
5. **Server security fixes (suggested; gated on Michael).** Q11 and A6 on new server branches, ready if he agrees.
6. **Mirror testing (suggested).** The `task/q9-land` rerun, K21 and its fixtures, the unjudged REVIEW rows, and groups B, D, E, H and I.

## Release plan (coordinator)

- Build `task/q9-land` in a worktree from `dev`: merge `origin/cloud/q9-c1-d1` `ad7eec9`, which contains `cloud/q9-logic` `bc097e1`.
  Resolve `src/tools/listPods.ts` by keeping Q9's single pod-status rule and `dev`'s reader notes, and resolve `docs/migration/E2E_CHECKLIST.md`.
  Run checks and push; land only after the mirror's C1 and D1 rerun passes.
- Land the Q10 branch and U7 when they are reported.
- Refresh the plan: U1-U6 and P5 are done, E7 is done, Q9-Q11 are not landed, and production fixes outside Gilligan wait for Michael (`timeline.md`, 2026-09-28).
- Rewrite guide K12, which still expects refusals; the standing caveat (K20) replaced them.
- Deployment runbook: §3.1's release rows predate the candidate; add `PREDECESSOR_PERIOD_HANDOFF=false` and `DEFAULT_TOP_K=20` to §4.1; §2.1 item 6 (an organization policy on unauthenticated invocation) has no fallback.
- `SECURITY_FINDINGS.md`: §5 item 1 says the sibling routes check organization, which §7 contradicts; §8's leaked fields are id, name, userName, email and devices, not role or organization.
- Do not land `docs/firestore-testing-plan` (`60befd4`); the mirror and L2 docs supersede it.

## Gilligan behaviour

The fix round planned Q10 but wrote nothing; its findings, from code reading:

- **Finding 6 (moved pod claims the full period).** `src/tools/querySensorData.ts` reports the full window as `time_range_resolved`, and `window_actually_searched.complete` reflects only the fetch start, not the current site's start.
  `src/report/buildReportInput.ts:340` takes the PDF title and Summary dates from it.
  The Data Quality row mixes values (1,728) and rows (432).
  The reader note already exists in `src/tools/currentSite.ts`, so part of the finding is the reader-notes pairing that also affected finding 7.
- **Finding 10 (salt-water predecessor judged on fresh-water limits).** `src/devices/mergeChains.ts` `resolveChain` admits same-organization predecessors with no water-type check.
  Lakeside Testbed carries `mergedInto`, so `/devices` hides it; it joined only through `PREDECESSOR_PERIOD_HANDOFF=true`, which is off at launch, so production can hit it only through a visible predecessor.
  Proposed: a cer-demo guard now, a server check in `findInheritedLabels` before the hand-off is ever enabled, and a `SPECS.md` §19 note.
- **Finding 8 (broken-pod referral declined).** No approved catalogue entry covers "my pod seems broken"; `check-power-connection`, which carries the sales@cleanearthrovers.com referral, is limited to missing, delayed or stuck readings.
  Proposed: widen only its conditions, as catalogue version `2026-09-27.1`, with user and supervisor approval.
  Recheck first with `CATALOGUE_PROMPT=true`: the 2026-09-27 mirror run's `.env` had no such line, so it ran without the catalogue.
- **Finding 7 (no-GPS note).** `dev` emits "Location not recorded"; recheck on a stack at `5922109` or later.
- **K21.** Catalogue entries should appear only when a reading supports them, keep their limitation, carry no document citation, and carry referrals only through their entry (manual guide K21).
- **History citation markers.** Earlier answers' markers reach the model unchanged while each turn renumbers excerpts from 1 (`src/prompt/promptBuilder.ts:112`, `src/prompt/systemPrompt.ts:97` and `:220`); fix by stripping or renumbering them, or by changing the prompt line.
- **Follow-ups.** `buildReportInput.ts:548` returns the site note as its error; `getPodThresholds.ts` has no reader note for rejected limits; after `task/q9-land` lands, `buildReportInput.ts:289` still says "sensor rails", the `lastReadingAt` comment in `src/report/types.ts` is stale, the PDF measures reading age from its own clock, and `excluded_implausible_min/max` spreads large arrays into `Math.min`.
- **Decisions waiting on the user.** Finding 10 as a blocker or not; the water-type rule (withholding a predecessor whose registered water type differs is recommended); the moved-pod wording; the Data Quality units; widening `check-power-connection`; the pH 3-12 band; the thresholds-note wording; U7's wording and placement.
- **Plan.** Branch `fix/q10-gilligan` from `dev` after `task/q9-land` lands, because both touch `querySensorData`, `buildReportInput` and `renderPdf`; ports 8011 and 5102; about $0.21 of paid checks.
- **U7 (dashboard).** Proposed placement: small muted text directly above the "Sources (n)" toggle in the dashboard's `src/app/components/gilligan-answer.js` (about line 286), shown only when `usedCitations(text, citations)` is non-empty, with a case in `test/provenance.test.mjs`.

## Server security fixes

- **Q11 (finding 11, CSV export).** Factor `findPeriodWaterData`'s membership logic (organization labels, `findInheritedLabels`, superadmin unrestricted) into one helper that the CSV export also uses; `findDeviceWaterDataExportCSV` also crashes on an unknown label.
  `local` lacks `findInheritedLabels`, so cutting from `task/gilligan-cwa-old` `9751f8f` is recommended (user decision).
- **A6 (empty organization sees every pod).** `assignOrganization` treats an empty organization as unfiltered; not written.

## Release

- Branches, local unless noted:
  - Server `release/gilligan-2026-09-30` `122136d` (worktree `server-release`): `local` `d12ad6d` plus `9751f8f`, `f9607bd`, `9ef59b7`, `0003170`, `b443e41` and `f7dec3c`; no Q11.
  - Server `mirror/release-rc1` `d1821bd`.
  - Dashboard `release/gilligan-2026-09-30` `9e18555` (pushed 2026-09-28); `task/gilligan-ux` `817a7c2` is one commit ahead.
  - cer-demo `release/rc1` `5367164`, stale.
- rc2 is final `dev`, dashboard `817a7c2` plus U7, and the server release plus Q11 if Michael agrees, or a Gilligan-only server commit if not.
- The main checkout's `data/corpus/corpus.json` is still the Sep 21 corpus, and `release/artifacts.sha256` matches it.
  rc2 must run `npm run ingest` from the existing OCR cache, rebuild the embedding cache for 457 chunks (a small paid call; confirm the cost), and regenerate the checksums.
- Proposed ports: 8081, 5102, 8011 and 3001.
  The "delta test" means the paid rc2 rows (G1, G3, and the B1, C1 and F2 rechecks), capped at $0.15.
- The supervisor brief `docs/migration/SUPERVISOR_BRIEF.html` is uncommitted in worktree `supervisor-brief` (`docs/supervisor-brief` `73770d2`), awaiting the user's review.
- Deploy assist checked runbook §4.1 against `src/config/index.ts` (they match) and proposed staging L5-L7 on the memory store with `max-instances=1` if Firestore access is still pending, with the Firestore store required before L9.
- Dashboard: `origin/task/gilligan-ux` is at `5356415`; `b014e94` through `817a7c2` (U3, U1, P5, X1/X2, U5, U6, pod-named notes) are unpushed.
  Server `task/gilligan-citation-title` `b443e41` has no remote branch.

## Release demo

- Evidence is in [`LAUNCH_ISSUES_CHECKLIST.md`](LAUNCH_ISSUES_CHECKLIST.md) (landed from `test/launch-issues` `7a2f2fc`; the branch itself is not pushed), with steps in `LAUNCH_ISSUES_WALKTHROUGH.html` and explanations in `LAUNCH_ISSUES_EXPLAINED.html`.
- Results on CER's own code (Current, `693fc96`/`5dff5fd`) against Release (`122136d`/`9e18555`):
  - A1 CSV export: 200 with 165 rows of other organizations' pods on both; Q11 is not written.
  - A2 without a token: `/users/all`, `/users/:id` and `/test-db` return 200 on Current, and 401, 401 and 404 on Release.
  - A3 period query: 200 on Current, 400 on Release.
  - A5 invited login: 500 with a raw validation dump on Current, 401 "Finish setting up your account..." on Release.
  - A6 user with no organization: sees all 5 pods on both; period data 200 on Current and 400 on Release; CSV 200 on both.
  - U1-U4 pass on both at API level.
- The walkthrough cards still need three corrections: A3 should drop `/water/last`, which CER already scopes; A5's page likely shows "Login failed: " plus the dump; A2's leaked fields as above.
- Browser checks still needed: A5's page message, the orphan's pod count on `/home`, U3 rendering.
- Before the demo, compare the A1 and A3 functions on CER's `main` with `git show` (read only); production's exact commit is unknown.
- Also: the supervisor brief review, a demo script, and the demo stack and key (the release candidate proposes the staged stack with `cer-gilligan-fireworks-api-key`, falling back to local rc2 with the development key).

## Mirror testing

- Stack: server `mirror/e2e-p3` `1ef21a7` and cer-demo `test/e2e-rc` `77cd4c9` (both pushed 2026-09-28), dashboard worktree `dashboard-e2e` at `9e18555`; setup in [`MIRROR_RUNBOOK.md`](MIRROR_RUNBOOK.md).
- C1 and D1 on `task/q9-land`, about $0.04, once the seed has a silent pod and a pH 2.07 reading.
- K21 a, b and c, the finding 8 recheck and chat-condition entries (oil spill, dead fish, algal bloom, mixed sites on the moved pod, limits-not-healthy-range, calibration schedule), about $0.20; K21b needs a fixture with an 18-hour freshwater dissolved-oxygen drop.
- Groups B, D, E, H and I and the finding 7 recheck, about $0.51, all with `CATALOGUE_PROMPT=true` and `CATALOGUE_DRAFTS=false`.
- Judge the 23 REVIEW rows of the Codex run `codex-bdehi-2026-09-28` (`.claude/worktrees/gcp-test-env/data/e2e/`); that run's bot has no H or I scenarios, and B1-B6 ran as a Harbor customer with a pod selected.
- Recommendation: `0003170`'s `FIRESTORE_PROJECT_ID` supersedes `1ef21a7`'s `MIRROR_PROJECT_ID`, so the mirror moves to `mirror/release-rc1` or its rc2 successor; phase 2 not before launch.
- Spend: about $2.56, plus $0.34 for the Codex run, of the $10 mirror budget.

## Chats stopped at the reset

Every chat that answered the roundup: `gilligan fix round planning`, `cer-demo-9a`, `cer-demo-7d`, `cer-demo-8f`, `cer-demo-af`, `cer-demo-c2`, `cer-demo-d6`, `gilligan release reconciliation`, `cer-demo-23`, `cer-demo-92` and `e2e session documentation review`.
`cer-demo-25` (busy) and `cer-demo-c1` did not accept messages.
The cloud sessions `Docs link and reference audit` (told to branch `cloud/docs-link-audit`) and `Gilligan release consistency audit` had not reported.
