# Outside-data tools (tides, swell, GPS, weather) - handoff

Current as of 2026-10-15 at `task/tide-tool` `a2f7a33` (this file is the next commit).
A fresh session reads this file, then `docs/SPECS.md` §10.10 and `docs/migration/POST_LAUNCH_BACKLOG.md` §7, then follows "Next step".

## What this is

Giving Gilligan outside data as tools, so it can check causes it now may only call "consistent with" (`SPECS.md` §10.9).
Michael asked for it and named the order: NOAA tides first, then analysis of the pod's GPS-tagged location, then NOAA weather if it is free (backlog §7).
Work lives on branch `task/tide-tool` in worktree `.claude/worktrees/tide-tool`, cut from `dev` `f7cc66c`; nothing is merged into `dev`.
The first tool, `get_tides`, is built and unit-tested; it has had no model run yet.

## Standing decisions

- Post-next-release work (user, 2026-10-15): it joins the next release only if it is finished and tested in time; the coordinator decides the landing with the user.
- `get_tides` reads NOAA CO-OPS directly, not CER's `/water/tides` route (coordinator, 2026-10-15; reasons in `SPECS.md` §10.10).
- Everything is behind `TIDE_TOOL` (default off) and needs `SENSOR_TOOL`; with it off, the prompt is byte-for-byte unchanged (`test/unit/getTides.test.ts`, last describe block).
- Gilligan may say the tide drives a metric, or does not, only from the tool's comparison verdict; swell, waves and weather stay unmeasured until a tool measures them.
- The user approved steps 1-4 of the tide plan (branch, read, build, prompt) on 2026-10-15; step 5, the paid replay, needs a fresh approval with its cost.

## State

| Item | State |
|---|---|
| NOAA client `src/tides/noaaTides.ts` (stations, nearest station, high/low predictions, NOAA's error text) | done `a2f7a33`, checked live against NOAA 2026-10-15 |
| Tide comparison `src/tides/tideComparison.ts` (peak lag behind high tide, circular scatter, 5-day minimum) | done `a2f7a33` |
| Tool `src/tools/getTides.ts`, registry entry, `TIDE_TOOL` and `NOAA_TIDES_*` config | done `a2f7a33` |
| Prompt `toolBlock(tides)` in `src/prompt/systemPrompt.ts` | done `a2f7a33` |
| Docs: `SPECS.md` §10.10, `.env.example`, README config table, backlog §7 status | done `a2f7a33` |
| A tidal pod with real coordinates in `scripts/skepticism/fakeDeviceApi.ts`, and replay scenarios for it | next (free) |
| Paid replay with `TIDE_TOOL=true` | planned, needs approval (about $0.30-0.45) |
| Swell source (NOAA NDBC wave buoys, Scripps CDIP) | research next (free) |
| GPS location analysis; NOAA weather (api.weather.gov) | not started |

## Waiting on the user

- **Station choice**: "Nearest isn't always best. 'Los Patos (highway bridge)' sounds like a channel or wetland site, where tides run later than on the open coast. The tool names the station so Gilligan can say so, but preferring NOAA's main reference stations might be better." Options: (a) keep the nearest station within 50 km; (b) prefer a reference station (`type` "R") within 50 km and fall back to the nearest. Recommended: (b), possibly confirmed with Michael.
- **Paid replay (step 5)**: not yet asked; present a numbered plan with the exact cost first.
- **Swell tool**: not yet asked; research the source for free first, then propose a plan.

## Next step

1. In `scripts/skepticism/fakeDeviceApi.ts`, add a coastal pod whose readings carry real coordinates near a NOAA station (Bay Mouth's are 33.6, -118.1146 in `test/unit/getTides.test.ts`), with a pH or temperature cycle that follows real predicted tides for the replay dates, beside the existing solar Bay Mouth pod.
2. Add replay scenarios to `scripts/skepticism/replay.ts`: "does the tide drive this pH cycle?" on the solar pod (expect "keeps to the time of day") and on the tidal pod (expect "follows the tide"), plus a freshwater pod (expect "no tides"); run only `test/unit/getTides.test.ts`, `prompt.test.ts` and `dailyCycle.test.ts`, plus typecheck and lint.
3. Give the user a numbered plan for the paid replay (fake device API, live NOAA, `SENSOR_TOOL=true REPORT_TOOL=true TIDE_TOOL=true`, the 2026-10-12 settings from `DATA_SKEPTICISM_FIX_2026-10-12.md`, three runs, about $0.30-0.45) and wait for approval.
4. Research swell for free: NDBC realtime files (wave height, swell height, period, direction; how many days back), CDIP for Southern California, distance from each pod to its nearest buoy; write the findings into backlog §7 and propose a `get_swell` plan.
5. Commit and push `task/tide-tool` after each verified unit; report commit IDs to the coordinator chat.

Resume with: `Read docs/migration/OUTSIDE_DATA_TOOLS_HANDOFF.md on branch task/tide-tool in worktree .claude/worktrees/tide-tool, then continue the outside-data tools work.`

## Facts, with their sources

- CER's tide route reads `data?.stationList` (server `src/utils/tideStations.ts:48`, branch `local`), while NOAA's metadata API answers `{ count, units, stations }` (`curl -s "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions" | head -c 200`).
- NOAA answers HTTP 400 "Great Lakes stations don't have Predictions data." for `9087057`, the registry `noaaTidesId` on two pods (`BACKEND_FIELDS.md` §4; rerun the datagetter call in `src/tides/noaaTides.ts` `highsAndLows`).
- 3,502 tide-prediction stations (same `stations.json`, field `count`, 2026-10-15).
- Bay Mouth's coordinates give "TWC0427 Los Patos (highway bridge)" at 14.3 km (`new NoaaTides().nearestStation(33.6, -118.1146)` via `npx ts-node --transpile-only -e`).
- Tests: `npx jest --runInBand test/unit/getTides.test.ts` 17/17, `prompt.test.ts` 84/84, `dailyCycle.test.ts` 7/7 at `a2f7a33`; `npm run typecheck` and `npm run lint` clean.
- The coverage line counts only `query_sensor_data` calls (`src/tools/dataCoverage.ts:14`), so an answer from `get_tides` alone gets no "Data covered" line.

## Do not touch

- `dev`, `docs/STATUS.md`, `docs/timeline.md` and the plan: the coordinator's; report needed edits to it.
- `task/flagging-share-window` and its worktree (another chat); the flagging rework also edits `systemPrompt.ts`, so expect a merge there at landing.
- The upstream repositories beyond read-only reads on branch `local`; never `main` or `develop`.
- Live production reads (the device API is production): announce them and hand the user a `!` command; NOAA's public API needs no approval.
- Paid model runs without the user's approval of a numbered plan with its cost; never `npm test` or the full suite.
