# Gilligan wrote off real readings as sensor faults (Michael, 2026-10-09)

Record of a production conversation, its root causes, the fix shipped so far and the plan for the rest.
Written 2026-10-11.

## 1. The conversation

Michael sent the user a two-minute screen recording and one line: "when you ask it a question, it seems to analyze the entire dataset from the buoy, not necessarily a single window unless specified which doesnt rear" (cut off as received).
Asked on 2026-10-11 whether he meant the "Searched from 1970" note (§4), he answered: "No if you ask it for a summary or overview, it doesn't specify what window the summary or overview is in."
That is a separate gap, fixed by a server-written coverage line and a prompt rule ([`SPECS.md`](../SPECS.md) §10.8); §4's note was wrong regardless and its fix stands.
The chat was read once from production Firestore, read-only: `chats/jg0HyEPyFZbw4FVB3s29`, 7 turns, 2026-10-09 21:35-21:52 UTC.

| Turn | Michael | Gilligan |
|---|---|---|
| 1 | What is going on with the pH from this buoy? Massive south swells and high tides from El Niño. | Balboa Yacht Basin Buoy (the pod then selected): pH cycles daily between about 9.5 and 3-4; more likely a sensor problem, possibly exposure at low tide. Defensible: pH 3-4 in a harbor is implausible. |
| 2 | Same question about all the data, Los Alamitos Bay, now on Algalita Pod. | Temperature, conductivity, pH and dissolved oxygen swing "on the tide clock, not the solar clock"; the pod is "very likely" exposed at low tide; "not a water-quality event". |
| 3 | Sounds like you are saying it is all error data. | "Pretty much, yes": the four channels are "almost certainly not real water changes"; "no reliable signal". |
| 4 | The buoy is in the water 100% of the time. | Drops exposure, proposes brownout, clock drift or a temperature-sensor fault instead; still "an instrument problem". |
| 5 | You are throwing the baby out with the bath water. | Concedes tides move readings; still doubts the magnitude; suggests comparing against a tide table it cannot reach. |
| 6 | The pod sits an inch or two under the surface at the harbor mouth in 100°F+ weather. | Accepts the swings as likely real; still calls them "tide-locked". |
| 7 | You can't just start telling people the data is bad. | Walks back every fault call except the device-flagged ones (turbidity stuck at 0, 16 excluded readings). |

Turns 3-7 made no tool calls: every change of position re-worded turn 2's data.

## 2. What the data shows

Turn 2's tool call was `query_sensor_data` with `last 7 days`, all metrics, series, on `dev:351077454569099`.
It used 316 readings (16 excluded) from 2026-10-02 21:29:30 to 2026-10-09 21:07:35 UTC; the 775 readings from the earlier location (June 13 - August 6) were excluded.
So the analysis window was right; see §4 for why it looked otherwise.

The three-hour means show a solar cycle, not a tidal one.
Temperature bottoms out at 05:00-08:00 PDT (about 67-68°F) and peaks at 14:00-17:00 PDT (85-90°F) at the same clock hours every day; a tidal pattern would drift about 50 minutes later each day.
pH and conductivity move opposite to temperature: pH about 7.3-7.4 at dawn and 5.9-6.2 in the afternoon, conductivity about 67,000-70,000 µS/cm at dawn and 52,000-58,000 in the afternoon.
pH near 6 is low for seawater and falls when photosynthesis would raise it, so a temperature-compensation artifact is possible; "worth a calibration check" would have been fair, "the data is bad" was not.
No tool provides tide data; "tides" entered the answer from Michael's question.

## 3. Root causes

1. **No "normal variation" guidance.** The live catalogue (`CATALOGUE_PROMPT: "true"` in `release/cer-gilligan.env.yaml`) holds pollution events and fault checks only; its rules allow causes "ONLY from the entries below", so a pattern that fits no event can only be a fault.
2. **`fault-first` stated as a finding.** It applies when "a reading crossed a configured threshold" (pH crossed this pod's minimum of 6); its limitation says "this is a caution, not a finding", which the answer ignored.
3. **Grounding checks quotes, not inferences.** Every claim carried a real quote ("shallow pods may be exposed ... at extreme low tides"); nothing checks the step from "this can happen" to "this is happening to your pod". The rule against inferring pod facts lists units, models, sensor types and thresholds, not deployment or cause.
4. **User statements count as evidence.** The catalogue rules accept evidence "in what the user told you", so "high tides" became established, and each later statement flipped the answer; nothing separates a user's site facts from a user's causal guesses, and nothing asks for a fresh tool call when challenged.
5. **No evaluation covers it.** 1 of 49 wave-1 fixtures and 0 of 6 E7 fixtures involve the sensor tool; the gates measure citations and refusals, not whether a diagnosis follows from the data.

Adding tide data alone would not generalise: daily cycles, water movement, weather, season, deployment, biology and human activity all move these six readings.
The general fix is how Gilligan reasons; data and tools come second.

## 4. Fixed: the searched-window note

Not what Michael's message referred to (§1), but a real defect found while tracing it.

Under the answer the dashboard printed "Search is incomplete. Searched from 1970-01-01T00:00:00.000Z. Only current-site readings inside the requested range are covered; see the site note."
`window_actually_searched` reported the snapshot's fetch span, which reaches the epoch to establish the current site, and marked a full week incomplete because the first reading landed 22 minutes after the window opened.
Commit `4fb59bf` (`fix/window-note`, from the deployed `ddd6292`) and its cherry-pick `469e972` on `dev` clip the reported window to the request and mark it incomplete only when the location filter dropped readings inside the request; the rule is in [`SPECS.md`](../SPECS.md) §19.

Verification, 2026-10-10/11:

- A unit test shaped on this answer failed on `ddd6292` with the production output and passes with the fix; the 11 suites that use the tool pass (280 tests) on `dev`, and typecheck passes.
- A live read-only run of the tool (no model) on Algalita Pod, `last 7 days`, gave the same 319 readings on both commits; `ddd6292` reported a 1970 start and `complete: false`, the fix reported 2026-10-04 06:08 to 2026-10-11 06:08 and `complete: true`.
- The live dashboard's `provenanceNotices` (cer-ui `fc13d16`) printed the 1970 notice for the old result and nothing for the new one; the earlier-location user note is unaffected.

Not deployed: production stays on `ddd6292` until the user builds and routes a new cer-gilligan image.

## 5. Remaining work

Items 1-5 and labelled UTC buckets were built and tested on 2026-10-12: [`DATA_SKEPTICISM_FIX_2026-10-12.md`](DATA_SKEPTICISM_FIX_2026-10-12.md), [`SPECS.md`](../SPECS.md) §10.9.

`task/sot-v2-flagging` (worktree `sot-v2-flagging`, active on 2026-10-11 with uncommitted edits) already moves judging into the tools: a QC-checked verdict per metric, maintenance only for a "likely data issue", "board_fault" or failed sensor, and the turbidity caveat once per conversation.
Build on that branch once it lands; do not edit its files in parallel.
It merges cleanly with `469e972`.

Not covered by it, proposed for this workstream:

1. Prompt: treat readings as real by default; call one faulty only when the device flagged it or it is physically implausible; otherwise "unusual, worth checking" while still reporting it.
2. Prompt: never attribute a pattern to something no tool measured (tides, weather, rain, depth); say what it would be consistent with and that the data is not available, or ask about the site.
3. Prompt and catalogue rules: a user's statement about the site (depth, position, always submerged) is evidence; a user's causal explanation is a hypothesis; when challenged, query again and change position only for new data or new site facts, saying which.
4. Catalogue: draft natural-variation entries (daily cycle, tidal exchange, heat wave, shallow deployment); drafts stay hidden in production (`CATALOGUE_DRAFTS=false`) until the supervisor approves them.
5. Tool, optional: the hour of each day's peak per metric, so a fixed-hour (solar) cycle is distinguishable from a drifting (tidal) one without outside data.
6. Later: tide (NOAA CO-OPS) and weather feeds for coastal pods.

Check against the flagging branch's "persistent" rule, which tells the model a metric outside its limit for most of the window "more likely reflects a threshold that does not fit the site, sensor fouling or calibration than a change in the water": a daily afternoon pH dip below 6 must not become this conversation again.

## 6. Test plan (mirror)

The user will supply the mirror details; the stacks were lost in the 2026-10-04 WSL rebuild.
Seed and fixtures live in the server's `mirror/release-rc1` (`8594338`, cut from `local`, `scripts/mirror/README.md`); the bot is `scripts/e2e/gilliganE2E.mjs`; the runbook is [`MIRROR_RUNBOOK.md`](../runbooks/MIRROR_RUNBOOK.md), with paths that predate the move to `~/code/work/`.

1. Add a fixture pod shaped on §2 (salt-water, hourly or half-hourly, solar-locked temperature 67-90°F, pH and conductivity inverse to it, pH below a configured minimum of 6 each afternoon, turbidity stuck at 0, an earlier location ending before the last 7 days) on a new server branch from `mirror/release-rc1`.
2. Reproduce on the deployed code: replay Michael's seven questions (about $0.15).
3. Apply the changes; run only the affected suites (`querySensorData`, `prompt`, `catalogue`).
4. Re-run the seven turns three times (about $0.45).
   Pass: no cause from an unmeasured source, no "data is bad" or "not real" for unflagged readings, the turbidity and device-flagged faults still reported, no fault theory swapped in under pushback, and a fresh tool call when challenged.
5. Over-correction guards on existing fixtures, three times each (about $0.36): pH 2.07 still treated as implausible, the 18-hour oxygen event still reported, the silent pod still silent, stuck turbidity still a failed sensor.
6. Add the scenario as a bot group so it can be re-run.
7. Optional: wave-1 document evals to check refusals did not move (about $1).

Budget: about $1, or $2 with step 7, approved by the user before the first paid question; port 3000 is held by `cer-ui-l8-local` until the user says to stop it.
