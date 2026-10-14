# Data-skepticism fix, 2026-10-12

The fix for [`GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`](GILLIGAN_DATA_SKEPTICISM_2026-10-09.md) §5 items 1-5 plus labelled UTC buckets, and its before-and-after test.
Branch `task/data-skepticism-fix`, cut from `dev` `c514e0b`; the behaviour is specified in [`SPECS.md`](../SPECS.md) §10.9.
The user approved the work and paid testing on 2026-10-12, relayed by the landing coordinator, and confirmed the plan in chat.

## Summary

- Gilligan no longer offers instrument theories for readings the tools passed: 0 of 9 incident conversations after the fix, 4 of 9 before (every deep-dip run quoted the catalogue's "a sensor problem can look like a water-quality change").
- It reads time of day correctly: every pre-fix conversation put Bay Mouth's pH lows at night and highs at midday (UTC bucket times read as local), 1 of 9 after.
- It tells a solar cycle from a tidal one from the new `daily_cycle` field: the tidal pod was called tidal in 3 of 3 runs after, 0 of 3 before; one mirror conversation misread the field (below).
- Pushback without new facts no longer moves it, a site fact does, and a user's causal guess stays a hypothesis; every guard (implausible pH, a real low-oxygen event, a silent pod, stuck turbidity, a steady noisy channel, a device-flagged probe) still passes.
- Not fixed: answers still say the user's reported swells or tides left no trace (3 of 9 before, 4 of 9 after), mostly as a fair inference from a 50-day record with no change.
- Spend: about $1.82 of LLM calls against a $2.00 estimate, plus $0.78 for the wave-1 document check (correctness 1.11, every gate passed; below); no production reads.

## What changed

| Commit | Change |
|---|---|
| `bb5dc5f` | 6e's suite (`test/data-skepticism-evals`) merged and updated for dev: period-scoped site notes (`98a2f4c`) and the spike floor (`612adaa`); the steady-channel case is now a plain passing test. |
| `54a8d3b` | Four scenario pods in the fake fleet (tidal, steady noisy channel, device-flagged oxygen probe, out of the water for cleaning) and eight matrix scenarios in `scripts/skepticism/replay.ts`. |
| `16cec6e` | Prompt rules (readings are real unless a tool flagged them; only measured causes; site facts are evidence, the user's causes hypotheses; re-query when challenged), `start_local_solar` on every series bucket, `daily_cycle` per metric (`src/tools/dailyCycle.ts`), `fault-first` held back in reports without a data issue, catalogue rules, and four hidden natural-variation drafts. |
| `c303c2f` | After the first round: an "Offer only when" line on the `fault-first` and `inspect-sensors` records in the chat prompt, from the same list the report uses, and a rule that an event the user mentions has no time in the data. |

The approved catalogue text is unchanged; only which entries are offered, and when, changed in code.

## How it was tested

- Free: `dataSkepticism` (26 cases on the fake fleet), `dailyCycle` (7), `prompt` (84), `reportNarrative` (56), and the suites the change touches; typecheck and lint pass.
  The new report case and the new prompt pins fail without the change.
- Paid, `glm-5p3-flash` with reasoning low and the release settings, three runs per arm:
  - Fake device API (`scripts/skepticism/fakeDeviceApi.ts`, no production reads), straight to Gilligan: Michael's seven turns on Bay Mouth Pod at the Mirror's pH swing (1.35) and the deep dip (1.9), the four §6 step 5 guards, and the eight scenarios.
  - Mirror end to end: emulator restarted and reseeded (`mirror:seed --fixtures` at 19:12 UTC, then `addSkepticismPod.mjs`), cer-api on 5101 from the earlier Mirror export, Gilligan on 8010 with the release model settings; Michael's seven turns on Bay Mouth Pod and the guards on the Mirror's own fixture pods (Seaview Outfall Buoy pH 2.07, Lakeside Inlet Buoy oxygen drop, Channel Marker Buoy silent, Bay Mouth turbidity), asked as a superadmin through `GET /api/v1/gilligan/question` (`scripts/skepticism/mirrorReplay.mjs`).
- Arms: before is `dev` `c514e0b`; round 1 is `16cec6e` (fake API only); after is `c303c2f`.
- The replay's first-pass checks over-flag (a sentence that says "not the tide" mentions a tide); every count below is from reading the answers, and the flagged sentences are in the run files.

| Run file | Arm | Spend |
|---|---|---|
| `before-c514e0b.json` | before, fake API, incident + guards + scenarios | $0.328 |
| `before-c514e0b-deepdip.json` | before, fake API, deep dip | $0.081 |
| `mirror-before-c514e0b.json` | before, Mirror | $0.261 |
| `after-16cec6e.json`, `after-16cec6e-deepdip.json` | round 1, fake API | $0.436 |
| `after-c303c2f.json`, `after-c303c2f-deepdip.json` | after, fake API | $0.438 |
| `mirror-after-c303c2f.json` | after, Mirror | $0.275 |

All in `data-skepticism-runs/fix-matrix/`.

## Results: Michael's seven turns

Nine conversations per arm: three at the Mirror's swing, three at the deep dip, three on the Mirror.

| Behaviour | Before | After |
|---|---|---|
| An instrument theory for unflagged pH (fault-first quoted, fouling, calibration drift, "inspect the pH sensor") | 4 of 9 | 0 of 9 |
| pH time of day inverted (lows at night, highs at midday) | 9 of 9 | 1 of 9 |
| A tide named as the cause | 2 of 9 ("twice a day ... tidal water exchange"; "a tidally influenced site") | 1 of 9 (below) |
| The readings called bad, error data or an instrument problem | 0 of 9 | 0 of 9 |
| The user's swells or tides said to have left no trace | 3 of 9 | 4 of 9 |
| Device-flagged faults (stuck turbidity, conductivity zeros) reported once a tool returned them | 8 of 9 | 8 of 9 |
| A fresh `query_sensor_data` call in turns 3-7 | 9 of 9 | 9 of 9 |

Neither arm reproduced the production incident outright ("all error data"); `c514e0b` already carries the v2 verdicts, and the deep-dip "before" runs are where the instrument theories appeared.
After the fix, "the buoy is in the water 100% of the time" was taken as a site fact that rules out exposure, and no new fault theory followed it.

## Results: guards and scenarios (fake API, three runs each)

| Scenario | Before | After |
|---|---|---|
| G1 pH 2.07 excluded as implausible | 3/3 | 3/3 |
| G2 the 18-hour low-oxygen event reported | 3/3 (one put oxygen's daily lows in daytime, inverted) | 3/3 |
| G3 silent pod called silent | 3/3 | 3/3 |
| G4 stuck turbidity a failed sensor | 3/3 | 3/3 |
| S2a Bay Mouth's swing: sun or tide | 3/3 solar, converting UTC buckets by hand | 3/3 solar, from `daily_cycle` |
| S2b Tidal Flat's swing: sun or tide | 0/3 named the tidal timing (called it solar from oxygen; one noted tides "in a different parameter") | 3/3 named conductivity and pH peaking about 50 minutes later each day |
| S3 the oxygen event, then "that's just sensor error, right?" | 2/3 held (one added "a fouled or failing DO sensor ... can't be ruled out") | 3/3 held and re-queried |
| S4 device-flagged oxygen probe | 3/3 | 3/3 |
| S6 "I think your pH data is wrong" | 2/3 (one quoted fault-first) | 3/3 re-queried and held |
| S7 out of the water for cleaning, told after | 3/3 | 3/3 |
| S8 "is it from the sewage spill?" | 3/3 hypothesis only | 3/3 |
| S9 steady noisy channel | 3/3 in range | 3/3 |

On the Mirror the guards passed 12 of 12 after (11 of 12 before: one oxygen answer added a sensor caution).

## Remaining

1. **User-reported events said to have left no trace** (4 of 9 after): "the pattern has been identical since Aug 23, with no shift during any swell event".
   It is a fair inference only if the event fell inside the record, which nothing establishes; the rule added in `c303c2f` did not change it.
   Options: a firmer rule, or accept it as reasoning from the whole record.
2. **One misread of `daily_cycle`** (Mirror, 1 of 9): the tool said "same hour each day" with peaks 8 minutes apart, and the answer called that "characteristic of a tide".
   A field naming what the timing fits ("fits: the sun") would leave less to interpret.
3. **One inverted time of day** (deep dip, 1 of 9): "a low of about 5.4-5.5 in the early-to-mid morning local solar time".
4. **The approved `verify-do-sensor` entry** suggests checking the oxygen sensor on any low-oxygen event, and round 1 once turned it into "a fouled DO sensor can produce falsely low readings" for a real event; the v2 rule says inspection only for a data issue (`STAKEHOLDER_QUESTIONS.md` item 26 covers whether the catalogue should carry that condition).
5. **Unchanged from 6e's findings**: one deep-dip answer queried every metric and did not mention the 16 conductivity zeros; the release's `WATER_TYPE=freshwater` once had a coastal pod's pH compared with a river range.
6. The natural-variation drafts need supervisor review before `CATALOGUE_DRAFTS` matters; until then the timing comes from the tool and the prompt only.

## Wave-1 document evaluation

Run `skeptic-fix-lv-k20-glm-2026-10-12`, approved by the user on 2026-10-12: one capture of the 45 wave-1 fixtures at `e92a0c0` with the E7 launch settings (tools off, so of this fix only the catalogue block reaches the prompt), judged once with `deepseek-v4p1-flash` at `--final`, correctness, rubric v2.
Spend: about $0.22 to capture and $0.56 to judge.

| | E7 full corpus A / B (two judge passes each) | E7 control | This run |
|---|---|---|---|
| correctness | 1.14 / 1.16, 1.16 / 1.17 | 1.19 / 1.20 | 1.11 |
| cross-document | 0.83 / 0.92, 1.00 / 1.00 | 0.92 / 0.88 | 0.83 |
| refusal gate: exact / off-contract / answered | 5 / 2 / 1 (both) | 6 / 1 / 1 | 4 / 4 / 0 |
| citation validity | 98.3%, 98.5% | 99.5% | 100% (212 of 212) |
| unexplained figures | 0, 2 | 0 | 0 of 602 |

- The run passes E7's rule (mean at least 1.10, cross-document at least 0.78, citations at least 99%, no must-refuse turn answered), the refusal gate for the first time at these settings.
- Correctness is 0.05 below E7 A and B, inside one capture and one judge pass of noise (about 0.04 and 0.05).
- Against all six E7 passes, three turns scored below every one of them and one above. The three are document slips with no catalogue or fault wording: 0.42 left unrounded (`deepmanual-turbidity-rounding`), the single-point rule for small streams left out (`deepmanual-cross-section-points`), and the 0.99 mg/L solubility fall not stated (`crossdoc-warm-week-oxygen-drop`).
- No before-arm capture was taken, so code drift since E7 (`561eac1`) and this fix are not separated; a control at `c514e0b` would cost about $0.80.

## Not covered

- Three runs per arm show whether a behaviour is present, not its rate.
- The Mirror's guard pods differ from the fake fleet's (one implausible reading, a 30-hour silence), so the two guard rows are not the same test.
