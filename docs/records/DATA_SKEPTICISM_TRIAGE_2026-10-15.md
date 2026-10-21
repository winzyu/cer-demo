# Data-skepticism triage against the flagging rework, 2026-10-15

Which open data-skepticism items the unlanded flagging rework already covers.
Inputs: the "Remaining" list in [`DATA_SKEPTICISM_FIX_2026-10-12.md`](DATA_SKEPTICISM_FIX_2026-10-12.md), stakeholder questions 24-27 on `dev` (and 27-29 on the flagging branch), and `task/flagging-share-window` at `c5d90df` (`94b1c4b` plus one overview-only commit).
Read-only: no runs, no model calls, no device API reads.
Line numbers are `dev` `9c635f9` unless marked "branch".

## Bottom line

The rework covers none of the six Remaining items outright.
It was built for a different complaint (flag counting and fault wording), and it leaves the dev fix's cause, site-fact, re-query, `daily_cycle` and solar-time rules byte-identical.
It partly overlaps stakeholder questions 25 and 27, and none of 24 or 26.
Two of its changes deliberately reverse parts of the dev fix's guard set and need an explicit decision at landing (see "Contradictions").

## Triage table

| Item | Verdict | What decides it | Still to do |
|---|---|---|---|
| R1. User-reported events said to have left no trace | Open | The cause and event rules are unchanged: `src/prompt/systemPrompt.ts:257-267` on dev, `:280-290` on the branch. | The firmer rule and retest the fix doc proposes, or accept it as inference from the whole record. |
| R2. One misread of `daily_cycle` | Open | `src/tools/dailyCycle.ts:29,96-100` and `systemPrompt.ts:207-211` are untouched by the branch. | A "fits: the sun / a tide" field, if wanted. The branch's new "lead with what the water did: its daily patterns" (branch `:277-279`) leans on this field more, not less. |
| R3. One inverted time of day | Open, and the surface grows | `start_local_solar` covers only series buckets (`systemPrompt.ts:204-206`, same on the branch). The branch adds UTC-only times in `out_of_range.flagged[].from/to`, `unusual_stretches[]` and `unusual_listed[].at` (branch `src/tools/metricVerdict.ts`, `iso()` at `:21`), with no local-solar companion. | Add local times to the new fields or extend the prompt rule to them. The rework's own replay saw one answer mix clock and solar times, and a UTC-day defect in `src/tools/timeRange.ts` (handoff "Unrelated defects"). |
| R4. `verify-do-sensor` invites a sensor theory for a real low-oxygen event | Open | The entry (`src/catalogue/catalogue.json:506-525`, approved, "When dissolved oxygen is low, check the sensor") and `low-oxygen-priority`'s limitation (`:721`) are not in `DATA_ISSUE_ONLY_ENTRIES` (`src/catalogue/select.ts:38`); the branch does not touch `src/catalogue/`. The branch's tighter inspection rule (branch `systemPrompt.ts:264-269`) applies to the model's own suggestions, while the catalogue rules let it offer an entry whose evidence is present (`src/catalogue/promptBlock.ts:16-23`). | A supervisor decision. Question 26 names only `inspect-sensors`, so `verify-do-sensor` is not actually asked anywhere yet; add it to 26 or to `DATA_ISSUE_ONLY_ENTRIES`. |
| R5a. A deep-dip answer omitted the 16 conductivity zeros | Open | Conductivity 0 is still a rail on both (`src/devices/plausibility.ts`, "at or below the conductivity floor"); scattered rails still make no `data_issue`, and the "mention the count when it is a large share" rule (`systemPrompt.ts:194-200`) is unchanged. | Decide whether excluded readings must be named in any multi-metric answer; free prompt change plus a retest. |
| R5b. `WATER_TYPE=freshwater` compared a coastal pod with a river range | Open, outside the rework | The branch reads the pod's own `operatingEnvironment` only for the pH rate-of-change class (`querySensorData.ts`, `mapWaterType`); the global default is still `config.waterType` (`src/config/index.ts:531`) for reports of unregistered pods (`src/report/buildReportInput.ts:204-207`). | The deploy-time `WATER_TYPE` decision; not a flagging question. |
| R6. Natural-variation drafts await supervisor review | Open | The branch does not touch `src/catalogue/` or `CATALOGUE_DRAFTS`. | Supervisor review; tied to question 26. |
| Q24. Conductivity corrected to 25 °C? | Open | The branch changes no conductivity fallback; its 2%-of-reading cushion (decision 5) is independent of temperature correction. | The operator's answer. |
| Q25. Which field marks a non-responding board, and how many in a row? | Partly covered | The branch keeps the provisional count: `DATA_ISSUE_RUN = 3` (`src/devices/readingQc.ts:75`, branch `:107`), now counting device faults only. Its real-month check found whole-board read failures (three in a row make a data issue for every sensor), but in the replay they surfaced only as "left out because no parameter was usable", never as a board fault (handoff, "Replay on the reshaped month"). | The operator's answer on the field and count; then decide whether whole-board failures should reach the model as `board_fault`. |
| Q26. Upwelling note and the `inspect-sensors` condition in the catalogue? | Open | Both stay in code on the branch: `UPWELLING_NOTE` (`src/report/referenceRanges.ts:309-310`) and `DATA_ISSUE_ONLY_ENTRIES` (`select.ts:38`). Branch decision 8 (data issues only from device faults) makes those entries trigger less often, which narrows but does not answer the question. | The supervisor's answer; extend it to `verify-do-sensor` (R4). |
| Q27. Who fixes ill-fitting thresholds; should alert emails follow the flag rule? | Partly covered | The branch replaces 3-in-a-row with the 5%-of-24-hours share rule and records the supervisor's 2026-10-12 decision that emails stay out of scope for now (branch `docs/STAKEHOLDER_QUESTIONS.md` item 27). | Who corrects thresholds, and whether emails should eventually match. Dev's wording of 27 ("3 consecutive readings") goes stale when the branch lands; take the branch's text. |
| Q28-29 (branch only) | Not data-skepticism items | They gate the rework's pH plausibility change and its "a calibration check would confirm" wording. | Listed because R-items and these share prompt lines (below). |

## Contradictions and merge risk

- **G1 guard reversed.** Dev's guard "pH 2.07 excluded as implausible" (fix doc, guards table) is the opposite of branch decision 1: pH outside 3-12 is kept, labelled unusual and must never be called a fault (branch `src/devices/readingQc.ts:123`, `plausibility.ts:140`).
  The branch updated the unit test (`test/unit/dataSkepticism.test.ts`, "pH 2.07 is kept and listed as unusual"), but `scripts/skepticism/replay.ts:240-243` still passes G1 only when the answer says "implausible", "excluded", "sensor fault" or "not real", which the branch prompt now forbids.
  After landing, the skepticism replay's G1 check fails by design until it is rewritten.
- **Incident week no longer Normal.** Dev's suite expects the incident pod's week to report Normal with afternoon pH just under 6 treated as a stray reading; the branch expects Watch for pH "at the low edge" on 7 of 7 days (branch `dataSkepticism.test.ts`, supervisor decision 6).
  This is a decided change, not a fault theory, but the 2026-10-12 nine-conversation matrix has not been rerun on the branch, so the dev fix's 4-to-0 and 9-to-1 results are unverified there.
- **Calibration wording loosened.** Dev's rule bans "calibration" as a fault theory (`systemPrompt.ts:255-256`) and its matrix counted "calibration drift" as an instrument theory.
  The branch drops "calibration" from that list and allows "a calibration check would confirm" for unusual readings (branch `:255-276`), pending question 29.
  It also drops dev's "if it surprises you, say it is unusual and worth checking".
- **A fault theory left in both.** The "persistent" verdict line still tells the model to say a long exceedance more likely reflects "sensor fouling or calibration" (dev `:235-238`, branch `:239-242`), beside the rule that forbids offering fouling or drift as a cause of unflagged readings.
- **Same prompt lines.** Both changes sit in one block of `TOOL_BLOCK`, dev `systemPrompt.ts:231-271`; the branch rewrites `:231-256` and inserts above the dev-fix rules at `:257-271`.
  `dev` has no `src/` or `test/` changes since the branch base `60f531c`, so a trial merge (`git merge-tree`) conflicts only in `docs/SPECS.md`, `docs/STATUS.md` and `docs/timeline.md`; any swell (R1) or conductivity-zeros (R5a) prompt change made on `dev` before landing would conflict in this block.
- **SPECS loss on the branch.** Commit `9c57aa9` deleted about 680 lines of `docs/SPECS.md` (from inside §10.7 through the middle of §19), including §10.9 "Reading the data", the dev fix's specification; the branch's file is 1,178 lines against 1,843 on `dev`.
  This looks accidental and is the cause of the SPECS merge conflict; resolve it by keeping `dev`'s sections and applying only the branch's flag-rule edits.

## The "free prompt-rule inventory"

It is not defined anywhere searched: `docs/migration/DATA_SKEPTICISM*.md`, `GILLIGAN_DATA_SKEPTICISM_2026-10-09.md` and `docs/timeline.md` have no such term, and `git log -S` finds it only in the 2026-10-14 coordinator handoff that introduced the phrase.
The likely meaning is a no-cost listing of every prompt and catalogue rule that bears on data skepticism, checked for overlap and contradiction before writing more rules.
If so, the four items under "Contradictions" (the persistent-verdict fault theory, the calibration wording, `verify-do-sensor` against the inspection rule, and G1) are its first entries.
The user should confirm what was meant.
