# Coordinator - handoff (2026-10-15)

Current as of `dev` `f7cc66c` plus this file's commit.
A fresh coordinator session reads `docs/STATUS.md`, then this file, then follows "Next step".
Nothing below is resolved: the user asked for every open item and the session's recap to be carried over.

## What this is

The coordinator chat lands branches on `dev` and alone writes `dev`, STATUS, the timeline and the plan.
This session (2026-10-15) explained the overlapping open items, ran five subagents on report omission and data skepticism, retested a swell-wording rule, recorded the next release and the messages sent to Michael, and built the first outside-data tool, `get_tides`, now its own workstream.

## Recap of the session

- **The overlaps in the open items.** One deploy ships v2 flagging, the data-skepticism fix and report omission together. The data-skepticism "Remaining" items, the flagging rework and stakeholder questions 24-27 all address Michael's one complaint that Gilligan over-reads sensor data. The server `main` merges ship the `exportCsv` and `assignOrganization` fixes. The unguarded user-update routes are fixed nowhere.
- **Report omission.**
  - The `omit` options are parameters on the report tool call, with nothing to do with HTML.
  - "HTML" in `task/report-html-option` names Michael's original preference, which that doc recommends not building now.
  - Michael approved samples S1-S4 (timeline, 2026-10-12 row).
  - The server PR is drafted.
  - A `report_retried` relay patch passes the server unit tests (12/12 and 2/2, typecheck clean) but is not applied, because auto mode blocked the commit in the upstream worktree.
- **Data skepticism.**
  - The triage (`task/skeptic-triage`) finds the flagging rework covers none of the six "Remaining" items. It partly covers questions 25 and 27, and neither 24 nor 26.
  - The rework reverses the G1 replay guard (pH 2.07 is kept as "unusual", where dev excludes it).
  - The "persistent" verdict wording still offers "sensor fouling or calibration" on both branches.
- **The swell story.** On 2026-10-09 Michael asked about pH while mentioning "massive south swells and high tides from El Niño". Gilligan called a real solar pH cycle sensor faults and blamed tides it cannot measure. The fix on `dev` (`16cec6e`, `c303c2f`) removed the fault theories. 4 of 9 conversations still said the swells "left no trace", though Gilligan never knew when they happened. On 2026-10-15 a firmer rule (`task/swell-rule` `fd7f008`) was retested on the fake API for $0.365. It left 2 clear claims and 1 borderline out of 6 conversations, against 2 and 2 before, with no regressions, so it is not landed (`DATA_SKEPTICISM_FIX_2026-10-12.md` on `task/swell-rule`, item 1). The remaining claim is often a fair inference, since "we've had massive swells" suggests they fall inside the seven-week window.
- **Michael.**
  - The user's message carrying stakeholder questions 28-35 is recorded in `STAKEHOLDER_QUESTIONS.md`.
  - Michael also asked for "learning the normalcies" and named NOAA tides, GPS analysis and NOAA weather (`POST_LAUNCH_BACKLOG.md` §7).
- **Outside-data tools.**
  - `get_tides` is built behind `TIDE_TOOL` on `task/tide-tool`; that workstream's own file is `docs/migration/OUTSIDE_DATA_TOOLS_HANDOFF.md` on that branch.
  - CER's tide route has two defects (see "Defects found this session").

## Standing decisions (user, 2026-10-15)

- The next release ships the data-skepticism fix, report omission and the flagging rework together, after Michael answers the rework's questions; `dev` is not deployed alone before then (timeline row).
- Send Michael nothing more until he answers the questions already sent.
- Outside-data tools are post-release work, joining the release only if finished and tested in time.

## Waiting on the user

Quoted as offered; recommendations as given in the session.

1. **`WATER_TYPE` fallback** (resolved 2026-10-15: keep `freshwater`; all five live pods have a registered type, so it changes no live report; timeline): "decide the `WATER_TYPE` fallback before the next release: live uses `freshwater`, now only the report's fallback for pods with no registered type, while most pods are salt-water (keep, or switch to `saltwater`)." No recommendation was given; most registered pods are salt-water.
2. **Swell claim** (resolved 2026-10-15: accepted, `task/swell-rule` dropped): "accept it and close it (my recommendation), or try a tool-side change." Options: (a) accept as reasoning from the whole record; (b) a tool-side change, such as requiring event times, or a swell data tool (outside-data workstream). Recommended: (a).
3. **Other data-skepticism items**: "The inverted time of day (item 3): I'd fix it while landing the flagging rework. The rework adds new UTC-only times to the tool output, which makes that mistake more likely." Also: "The misread daily-cycle timing (2) and the skipped conductivity zeros (5a): these can wait until after the release." Also open from the fix doc: the before-fix wave-1 comparison at `c514e0b` (about $0.80; recommended: drop), and whether to restart and reseed the Mirror or leave it down.
4. **Server, report omission** (2026-10-15: go-ahead, after the Mirror test in `REPORT_OMIT_MIRROR_RUNBOOK.md`; its §10 lists the commands): apply the retry patch, then approve pushing it and opening the report-omit PR, timed with the release:
   - `! git -C /home/winsy/code/work/clean-earth-rovers/worktrees/server-report-omit am /home/winsy/code/work/clean-earth-rovers/handoff/2026-10-15/report-retried.patch`
   - `! gh pr create --repo Clean-Earth-Rovers-Technology/clean-earth-rovers-server --base develop --head task/gilligan-report-omit --title "Relay a report request's omit list to cer-gilligan" --body-file /home/winsy/code/work/clean-earth-rovers/handoff/2026-10-15/report-omit-pr-body.md`
   - The PR needs cer-gilligan deployed first or alongside, since the live one ignores `omit`. The push of the patched branch is a separate command that needs consent.
5. **"Free prompt-rule inventory"**: "Tell me what the 'free prompt-rule inventory' meant." The phrase appears only in the 2026-10-14 coordinator commit `9c635f9`. If it means listing every rule bearing on data skepticism, the triage doc's "Contradictions" section starts it.
6. **Post-launch order**: "the unguarded user-update routes are a live production security hole in the server, and I'd put them first."
7. **Landing the docs-only branches** (resolved 2026-10-15: both landed on `dev`): `task/report-html-option` (`0311473`) and `task/skeptic-triage` (`9e27764`) are reviewed and wait for the user's go.
8. **Worktree cleanup**: remove `post-launch-land` (merged) and the detached `e2e-dev`, `skeptic-before`, `skeptic-evals-run` and `skeptic-repro`, after checking each is clean and reachable from a branch or tag. `report-html-option`, `skeptic-triage` and `swell-rule` follow once their branches land or are dropped. `swell-rule` holds a copied, ignored `.env` and four linked `data/` caches.
9. **Dates to confirm**: the day the questions went to Michael (recorded as "sent by 2026-10-15"), and that Michael's sample approval was 2026-10-12 (taken from the earlier record).
10. **Still open from before**:
    - delete the old scratchpad secrets (STATUS "Working tree");
    - delete the test user `winsyu475+certest@gmail.com`;
    - decide the main checkout's uncommitted `.claude/settings.json` and `release/start-rc2-emulator.sh` edits.

## Waiting on Michael

- Stakeholder questions 27-35, sent by 2026-10-15.
- The answers gate the flagging rework and therefore the release.
- Item 35, whether report omission should go live early, would change the release plan if he says yes.
- When he answers, add `verify-do-sensor` to question 26 in the next message, together with the supervisor review of the natural-variation drafts.

## Next step

1. Ask the user for the decisions above, starting with 1, 2 and 7; land nothing without a go.
2. When Michael answers, record his answers in `STAKEHOLDER_QUESTIONS.md` and the timeline, and tell the flagging chat.
3. Land `task/flagging-share-window` when its chat asks, after review. While landing:
   - restore the about 680 `SPECS.md` lines its commit `9c57aa9` deleted, keeping dev's §10.7-§19 and applying only the branch's flag-rule edits;
   - rewrite the G1 check in `scripts/skepticism/replay.ts:240-243`;
   - fix the "persistent" verdict's "sensor fouling or calibration" wording;
   - decide item 3;
   - merge STATUS, the timeline and `STAKEHOLDER_QUESTIONS.md` by hand (the branch adds items 28-29).
4. Prepare the release: the server patch and PR (item 4), staging with `release/deploy-cer-gilligan.sh` (runbook §6.1), then `main` to the deployed commit.
5. Refresh STATUS, and this file or its successor, at the next handoff.

Resume with: `Read docs/STATUS.md on branch dev, then docs/migration/COORDINATOR_HANDOFF_2026-10-15.md, then continue as cer-demo coordinator from the dev worktree.`

## Facts, with their sources

- Swell retest: $0.365, 2 clear and 1 borderline of 6 after, 2 and 2 before (`git show task/swell-rule:docs/migration/DATA_SKEPTICISM_FIX_2026-10-12.md`, "Remaining" item 1; run files `after-fd7f008*.json`).
- Report-omit branch merges cleanly into `develop` 5f04064 (`git -C ../clean-earth-rovers-server merge-tree --write-tree origin/develop task/gilligan-report-omit`, exit 0; 3 files, +31/-8).
- Flagging branch SPECS is 1178 lines against 1843 on dev (`git show task/flagging-share-window:docs/SPECS.md | wc -l`).
- Session spend: $0.365, the swell retest only; no production reads.

## Defects found this session

- Server `src/utils/tideStations.ts:48` reads `stationList`, but NOAA answers `stations`. CER's tide markers therefore get no automatic station, and only pods with a hand-set `noaaTidesId` get tides.
- Registry `noaaTidesId` `9087057` is a Great Lakes station with no predictions.
- Server `.eslintrc.js` has no TypeScript parser, so `npm run lint` cannot parse `src/*.ts`.
- `task/flagging-share-window` `9c57aa9` truncated `SPECS.md`.

## Do not touch

- `task/flagging-share-window` (its own chat) and `task/tide-tool` (the outside-data chat), except to land them on request.
- The upstream repositories beyond branch `local`; every push needs the user's approval of the exact command.
- Paid runs and deploys without approval.
