# Coordinator - handoff

Current as of 2026-10-28 at `dev` (`git log -1 origin/dev`; the commit that adds this version); first written 2026-10-15.
A fresh coordinator session reads `docs/STATUS.md`, then this file, then follows "Next step".

## What this is

The coordinator chat lands other chats' branches on `dev` and alone writes `dev`, STATUS, the timeline and the plan; it works from the `dev` worktree (`.claude/worktrees/dev`).
The goal now is the next release: the data-skepticism fix, report omission and the flagging rework, all on `dev`, deployed together after verification.
Other chats report commit IDs by cross-session message (`ListAgents`, `SendMessage`); the coordinator reviews, lands, and tells each owner to merge `dev` back.

## Standing decisions

- The next release ships the data-skepticism fix, report omission and the flagging rework together (user, 2026-10-15 and 2026-10-26; timeline); "learn the normalcies" (item 33) and the alert-email change (backlog §1e) come after it.
- Michael answered the flagging questions on 2026-10-23; his next message carries stakeholder item 36 and the item 26 follow-up.
- Outside-data tools are post-release work, joining the release only if finished and tested in time (user, 2026-10-15).
- `WATER_TYPE` stays `freshwater` (user, 2026-10-15; timeline).
- Land branches on `dev` by squash-merge, one commit per landing; never rewrite pushed history; after each landing the source chat merges `origin/dev` back before its next commit (user, 2026-10-20). If a squash conflicts, check `dev`'s file equals the branch's previous commit before taking the branch's side.
- The user does not review docs landings; the coordinator reviews and lands them (user, 2026-10-21).
- `fix/window-note` is a hotfix cut from the deployed `ddd6292`; never merge `dev` into it (user, 2026-10-21).
- The Mirror runbook is verified at its next real use (report omission or flagging), not by a separate run (user, 2026-10-21).
- Local corpus and cache are rc2's 457-chunk artifacts, pinned in `release/artifacts.sha256` (user, 2026-10-21; timeline).

## State

| Item | State |
|---|---|
| Docs overhaul | done 2026-10-21: `docs/migration/` gone, steps 1-7 landed (last `07025d5`); record and resume point `plans/DOCS_OVERHAUL_HANDOFF.md`; no chat owns it now |
| Branch propagation | done 2026-10-21: `origin/dev` `feec091` merged into `task/tide-tool` `ef044ee`, `docs/firestore-testing-plan` `ed3c06a`, `task/swell-rule` `05ae58e`, `reflection` `fad217a`, `task/flagging-share-window` `dd2d650` (now `41a31e3`); `fix/window-note` skipped |
| Corpus pin | `release/artifacts.sha256` holds rc2's hashes (`981c76e`); rc2 record `records/RELEASE_CANDIDATE.md` (`099f21f`); `LocalVectorAdapter` refuses a cache that differs from the corpus (`79c0f5a`, effective at next deploy) |
| Upstream incident | resolved 2026-10-20 (timeline); CER's GitHub blocks branch deletion and force-push, so push upstream only PR branches (`CLAUDE.md`) |
| Flagging rework | landed `75bbb33` 2026-10-28 (squash through `c7f377a`); servicing rule and the landing checklist included; the flagging chat merges `dev` back, then the branch is done |
| Slop audit `cloud/slop-audit` `44b0329` | cloud session "AI slop and vibe coding evaluation" (can receive messages, cannot reply); H1, M3, M5 fixed, not reviewed; held findings in `docs/records/2026-10-23-slop-audit-pilot.md` on that branch |
| Outside-data tools `task/tide-tool` `ef044ee` | contains `dev`; waiting on the user's station choice and paid replay; handoff `docs/plans/OUTSIDE_DATA_TOOLS_HANDOFF.md` on that branch |
| Report-omission server PR | not started: server branch `task/gilligan-report-omit` `ddcddc5`, patch not applied; the browser check (runbook §6.3) never ran |
| Mirror stack | Gilligan :8010 stopped by the user; emulator :8080, cer-api :5101 and dashboard :3100 still up since 2026-10-15 (fabricated data); stop with `kill -- -2396408 -2382158 -2378693 -2379082` (process groups; recheck with `ps -o pid,pgid,etime,args -p <pid>` first), then delete the settings file `/tmp/claude-1000/-home-winsy-code-work-clean-earth-rovers-repo-cer-demo/01b61cb2-b806-4480-812e-0a64be32db55/scratchpad/omit/env.sh` (secrets, never print) |
| Reflection course | `reflection` `fad217a` contains `dev`; course paths checked by its chat (cer-demo-fc) |

## Waiting on the user

1. **Stop the rest of the Mirror?** Asked 2026-10-21: "Stop the rest of the Mirror (3100, 5101, 8080)?" Recommended: yes, unless testing soon; the `kill` line is in "State".
2. **`docs/firestore-testing-plan`**: "Keep or archive `docs/firestore-testing-plan`, now at `docs/plans/GILLIGAN_FIRESTORE_AND_TESTING_PLAN.md` on its branch." Options: (a) land it as a plan, (b) archive it with a tag and an `ARCHIVED.md` row. Recommended: archive, after comparing it with `runbooks/MIRROR_RUNBOOK.md` and the manual test guide (not yet compared).
3. **Tide tool**: station choice (nearest station or NOAA reference station) and approval of the paid replay (about $0.40-0.55).
4. **`dashboard-rc2` fixes**: "`dashboard-rc2` holds uncommitted, unshipped fixes (logout full reload, tide idLabel) on no branch"; `git -C ~/code/work/clean-earth-rovers/worktrees/dashboard-rc2 status --short` shows `header.js` and `datahub-chart/page.js`. Recommended: commit them to a new branch cut from `local` in user-dashboard, with the user's consent for any push.
5. **Server PR** (runbook `docs/runbooks/REPORT_OMIT_MIRROR_RUNBOOK.md` §10), one command at a time: `! git -C /home/winsy/code/work/clean-earth-rovers/worktrees/server-report-omit am /home/winsy/code/work/clean-earth-rovers/handoff/2026-10-15/report-retried.patch`; the push of `task/gilligan-report-omit` (exact command from the coordinator; separate consent; pushed branches are permanent); `! gh pr create --repo Clean-Earth-Rovers-Technology/clean-earth-rovers-server --base develop --head task/gilligan-report-omit --title "Relay a report request's omit list to cer-gilligan" --body-file /home/winsy/code/work/clean-earth-rovers/handoff/2026-10-15/report-omit-pr-body.md`. cer-gilligan must deploy first or alongside: the live one ignores `omit`.
6. **Data-skepticism items** (item 3, the inverted time of day, landed in `75bbb33`): "The misread daily-cycle timing (2) and the skipped conductivity zeros (5a): these can wait until after the release."
7. **Servicing cutoff**: "The rule counts conductivity as collapsed below 50% of its 24-hour median... Setting it to 20% still catches Sep 24 easily and halves that risk." Options: keep 50%, or 20% (`SERVICING_CONDUCTIVITY_SHARE` in `src/devices/readingQc.ts`, re-run `readingQc` and `algalitaFlagging`). Recommended: 20%.
7b. **"Free prompt-rule inventory"**: "Tell me what the 'free prompt-rule inventory' meant." It appears only in coordinator commit `9c635f9`; if it means listing every rule bearing on data skepticism, `records/DATA_SKEPTICISM_TRIAGE_2026-10-15.md` "Contradictions" starts it.
8. **Post-launch order**: "the unguarded user-update routes are a live production security hole in the server, and I'd put them first."
9. **Chats to close**: cer-demo-1a and cer-demo-f8 (duplicate reflection chats; keep cer-demo-fc), `report editing` (idle), and the finished hygiene and propagation (cer-demo-53) chats.
10. **Older**: delete the test user `winsyu475+certest@gmail.com`; `git branch -D task/swell-rule` if the swell rule stays dropped (commits stay on `origin`).

## Waiting on Michael

- Nothing blocking. Next message: stakeholder item 36 and the item 26 follow-up, with the supervisor review of the natural-variation drafts.

## Next step

1. Run `ListAgents` and read any pending cross-session messages; land each reported commit by squash after review (diff, `git diff --check`, a relative-link check over tracked `.md`/`.html`, typecheck, lint and named suites when code changed).
2. Ask the user the "Waiting on the user" items 1-4, one short list.
3. Review and squash-land `cloud/slop-audit` (`44b0329`): run `timeRange`, `generateReport` and the site snapshot suites; the commit carries attribution trailers, which the squash drops.
4. Ask the user to run the report-omission server commands ("Waiting on the user" 5).
5. Verify the combined `dev`: the affected Jest suites, a paid data-skepticism retest (quote the cost first), the manual test guide cases the rework changes, and the Mirror runbook end to end (its first real use).
6. Prepare the release: stage with `release/deploy-cer-gilligan.sh` (deployment runbook §6.1; `IMAGE` and `TAG` required) after `sha256sum -c release/artifacts.sha256` passes; check `release/cer-gilligan.env.yaml` against live revision `00004-r5q`; the user deploys and routes, then `main` moves to the deployed commit.

Resume with: `Read docs/STATUS.md on branch dev, then docs/plans/COORDINATOR_HANDOFF_2026-10-15.md, then continue as cer-demo coordinator from the dev worktree.`

## Facts, with their sources

- Every active branch contains `dev` `feec091`: `git merge-base --is-ancestor feec091 origin/<branch>`; `fix/window-note` does not, on purpose.
- No tracked file under `docs/migration/`: `git ls-files docs/migration` prints nothing; the main checkout keeps the user's three untracked `*_EXPLAINED.html`/`REPORT_EDITING_OPTIONS.html` there.
- Local corpus and cache match the pin: `sha256sum -c release/artifacts.sha256` in the main checkout; 457 chunks (`chunkCount` in `data/embeddings/cache.json`); the pre-rc2 446-chunk pair is backed up in `data/pre-rc2-446/` (ignored).
- Remote branches: `git ls-remote --heads origin` gives `main`, `dev`, `reflection`, `docs/cleanup`, `docs/firestore-testing-plan`, `fix/window-note`, `task/flagging-share-window`, `task/swell-rule`, `task/tide-tool`.
- Mirror ports: `ss -ltnp | grep -E ':(3100|5101|8080|8010) '`.
- Session spend 2026-10-19 to 2026-10-22 (coordinator): $0; no production reads (the docs chat announced one read for its local-stack re-run).

## Do not touch

- Other chats' branches (`task/flagging-share-window`, `task/tide-tool`, `reflection`, `docs/firestore-testing-plan`), except to land them on request; `fix/window-note` never gets `dev` merged in.
- The upstream repositories beyond branch `local`: no merges, every push needs the user's approval of the exact command, and pushed branches are permanent.
- Paid runs and deploys without approval; the device API is production; the Mirror settings file holds secrets.
- The user's untracked files in the main checkout.
