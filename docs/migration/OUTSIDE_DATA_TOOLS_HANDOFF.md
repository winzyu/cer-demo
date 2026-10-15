# Outside-data tools (tides, swell, GPS, weather) - handoff

Current as of 2026-10-15 at `task/tide-tool`, after the replay-fixture commit that updates this file.
A fresh session reads this file, then `docs/SPECS.md` §10.10 and `docs/migration/POST_LAUNCH_BACKLOG.md` §7, then follows "Next step".

## What this is

Giving Gilligan outside data as tools, so it can check causes it now may only call "consistent with" (`SPECS.md` §10.9).
Michael asked for it and named the order: NOAA tides first, then analysis of the pod's GPS-tagged location, then NOAA weather if it is free (backlog §7).
Work lives on branch `task/tide-tool` in worktree `.claude/worktrees/tide-tool`, cut from `dev` `f7cc66c`; nothing is merged into `dev`.
The first tool, `get_tides`, is built, unit-tested and checked on the replay fleet against live NOAA predictions; it has had no model run yet.

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
| Tide comparison `src/tides/tideComparison.ts` (peak lag behind high tide, circular scatter, 5-day minimum) | done `a2f7a33`; fixed after it: a 7-day window read every solar cycle as tidal, so the verdict now weighs lag scatter against clock-hour scatter (`SPECS.md` §10.10) |
| Tool `src/tools/getTides.ts`, registry entry, `TIDE_TOOL` and `NOAA_TIDES_*` config | done `a2f7a33` |
| Prompt `toolBlock(tides)` in `src/prompt/systemPrompt.ts` | done `a2f7a33` |
| Docs: `SPECS.md` §10.10, `.env.example`, README config table, backlog §7 status | done `a2f7a33` |
| Replay fixtures: `fakeDeviceApi.ts --noaa-tides` drives Tidal Flat Pod from NOAA's predictions at its nearest station; Lake Inlet Pod (freshwater) added; `replay.ts --only tides` runs T1-solar (Bay Mouth), T2-tidal (Tidal Flat), T3-freshwater (Lake Inlet) | done; offline cases in `getTides.test.ts` "on the skepticism fleet" |
| Paid replay with `TIDE_TOOL=true` | planned, needs approval (about $0.30-0.45) |
| Swell source (NOAA NDBC wave buoys, Scripps CDIP) | research next (free) |
| GPS location analysis; NOAA weather (api.weather.gov) | not started |

## Waiting on the user

- **Station choice**: "Nearest isn't always best. 'Los Patos (highway bridge)' sounds like a channel or wetland site, where tides run later than on the open coast. The tool names the station so Gilligan can say so, but preferring NOAA's main reference stations might be better." Options: (a) keep the nearest station within 50 km; (b) prefer a reference station (`type` "R") within 50 km and fall back to the nearest. Recommended: (b), possibly confirmed with Michael.
- **Paid replay (step 5)**: not yet asked; present a numbered plan with the exact cost first.
- **Swell tool**: not yet asked; research the source for free first, then propose a plan.

## Next step

1. Ask the user the station-choice question above, and the paid replay below.
2. Give the user a numbered plan for the paid replay (`fakeDeviceApi.ts --noaa-tides`, `replay.ts --only tides` plus the default set to check nothing regressed, live NOAA, `SENSOR_TOOL=true REPORT_TOOL=true TIDE_TOOL=true`, the 2026-10-12 settings from `DATA_SKEPTICISM_FIX_2026-10-12.md`, three runs, about $0.30-0.45) and wait for approval.
3. Research swell for free: NDBC realtime files (wave height, swell height, period, direction; how many days back), CDIP for Southern California, distance from each pod to its nearest buoy; write the findings into backlog §7 and propose a `get_swell` plan.
4. Commit and push `task/tide-tool` after each verified unit; report commit IDs to the coordinator chat.

Resume with: `Read docs/migration/OUTSIDE_DATA_TOOLS_HANDOFF.md on branch task/tide-tool in worktree .claude/worktrees/tide-tool, then continue the outside-data tools work.`

## Facts, with their sources

- CER's tide route reads `data?.stationList` (server `src/utils/tideStations.ts:48`, branch `local`), while NOAA's metadata API answers `{ count, units, stations }` (`curl -s "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions" | head -c 200`).
- NOAA answers HTTP 400 "Great Lakes stations don't have Predictions data." for `9087057`, the registry `noaaTidesId` on two pods (`BACKEND_FIELDS.md` §4; rerun the datagetter call in `src/tides/noaaTides.ts` `highsAndLows`).
- 3,502 tide-prediction stations (same `stations.json`, field `count`, 2026-10-15).
- Bay Mouth's coordinates give "TWC0427 Los Patos (highway bridge)" at 14.3 km (`new NoaaTides().nearestStation(33.6, -118.1146)` via `npx ts-node --transpile-only -e`).
- Tests after the replay-fixture commit: `npx jest --runInBand test/unit/getTides.test.ts test/unit/prompt.test.ts test/unit/dailyCycle.test.ts test/unit/dataSkepticism.test.ts` 138/138; `npm run typecheck` and `npm run lint` clean.
- Replay fleet against live NOAA on 2026-10-15 (`buildFleet` with `tidalFlatTides` from `highsAndLows`, real `GetTides`, metric pH): Bay Mouth "keep to the time of day" at 7 days (lag scatter 1.4 h, clock 0.4 h) and 14 days (2.1, 0.7); Tidal Flat, station 9410599 "Santa Ana River entrance (inside)" at 2.8 km, "follow the tide" at 7 days (0.2, 0.7) and 14 days (0.3, 3.2); Lake Inlet no tides. Before the fix Bay Mouth's 7-day answer was "follow the tide".
- Tidal Flat's 7-day margin is thin (lag 0.2 h against clock 0.7 h, a ratio of 0.29 where 0.5 is the limit): over one week a mixed tide's higher high can hold its clock hour; 14 days separates them clearly.
- Bay Mouth's fleet coordinates (33.7536, -118.1146) give Los Patos at 7.2 km; the 14.3 km figure below is for the test's 33.6.
- The coverage line counts only `query_sensor_data` calls (`src/tools/dataCoverage.ts:14`), so an answer from `get_tides` alone gets no "Data covered" line.

## Do not touch

- `dev`, `docs/STATUS.md`, `docs/timeline.md` and the plan: the coordinator's; report needed edits to it.
- `task/flagging-share-window` and its worktree (another chat); the flagging rework also edits `systemPrompt.ts`, so expect a merge there at landing.
- The upstream repositories beyond read-only reads on branch `local`; never `main` or `develop`.
- Live production reads (the device API is production): announce them and hand the user a `!` command; NOAA's public API needs no approval.
- Paid model runs without the user's approval of a numbered plan with its cost; never `npm test` or the full suite.
