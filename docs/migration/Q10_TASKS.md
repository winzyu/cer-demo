# Q10 Gilligan behaviour: decisions and task list

Owner: the Gilligan behaviour chat. Started 2026-09-28 from `GILLIGAN_RESET_2026-09-28.md`, "Gilligan behaviour".

## User decisions, 2026-09-28

1. Finding 10 is a launch must.
2. Water-type rule: `resolveChain` withholds a predecessor, with a note, when both pods have a registered water type (`operatingEnvironment`) and they differ; a predecessor with no registered type is kept with a note that its water type could not be confirmed.
3. Production chain `Old Woman Creek 2026` absorbs two pods registered `salt-water` on a fresh-water lake; they are withheld too, and restored if Michael confirms the registry is stale.
4. Moved pods: the answer, the PDF title and the Summary show the current site's first and last reading, with the existing earlier-location note from `currentSite.ts`.
5. Data Quality counts readings (rows) for both used and left-out figures.
6. Catalogue: `CATALOGUE_PROMPT=true` on the mirror Gilligan (`e2e-rc/.env`, set 2026-09-28; takes effect at its next start); catalogue behaviour tests below.
7. Faulty sensor data stays generic: keep the pH 3-12 plausibility band from D1 and soften the user note to "may be sensor faults and were left out"; anything smarter waits until after launch.
8. Thresholds note: "`<Parameter>` was not checked against a limit: its `<minimum|maximum>` is not set." and "`<Parameter>` was not checked against its limits: the minimum is above the maximum."
9. Source-of-truth v2 §3 fallback ranges are used when a pod's registry limit is unset or inverted; this reverses the supervisor's 2026-09-13 veto and must be recorded in `timeline.md` and shown to the supervisor.
10. U7 wording and placement as drafted in the release plan.
11. History citation markers are stripped from earlier answers before they reach the model.

## Tasks

| # | Task | Owner | Waits on | Status |
|---|---|---|---|---|
| T1 | Finding 10 guard in `src/devices/mergeChains.ts` with tests; `SPECS.md` §19 note | Codex in `fix/q10-history`, Claude reviews | - | ready |
| T2 | Strip earlier answers' citation markers in `src/prompt/promptBuilder.ts`, with a test | Codex in `fix/q10-history`, Claude reviews | - | ready |
| T3 | Rejected-limit note (decision 8) and the no-readings message at `buildReportInput.ts:548` | cloud `cloud/q10-followups` | - | ready |
| T4 | Server `findInheritedLabels` water-type check, written as a proposal | Claude, to the server security chat | T1 | todo |
| T5 | Finding 6 dates and Data Quality units; softened sensor-fault note; "sensor rails", `lastReadingAt` comment, PDF reading age, `Math.min` spread | Codex in `fix/q10-gilligan`, Claude reviews | `task/q9-land` | blocked |
| T6 | Prompt lines at `systemPrompt.ts:97` and `:220` about earlier markers | with T5 | `task/q9-land` (touches `systemPrompt.ts`) | blocked |
| T7 | v2 §3 fallback ranges (decision 9) and unit tests F1-F6 | Codex, Claude reviews | T3, T5, fallback questions | blocked |
| T8 | U7 caveat in the dashboard from `task/gilligan-ux` `817a7c2` | Claude | - | todo |
| T9 | Catalogue tests C1-C6, findings 7 and 8 rechecks, K21 on the mirror | Claude with the mirror chat | mirror chat, spend approval (~$0.21) | todo |
| T10 | Approved description of Clean Earth Rovers for "what does CER do" | Michael supplies the text; Claude wires it | Michael | waiting |
| T11 | Confirm whether `CWA 2025 testbed` and `CWA Old` were ever in salt water | Michael | - | waiting |

## Catalogue tests (T9)

Run on the mirror with `CATALOGUE_PROMPT=true`, as the pod's customer, one question per fresh chat.

| # | Pod | Question | Pass |
|---|---|---|---|
| C1 | Harbor Pier Buoy | "My pod seems broken, who should I contact?" | Names sales@cleanearthrovers.com (finding 8); no invented contact |
| C2 | a pod with a reading gap | "My readings stopped coming in, what should I do?" | `check-power-connection` advice and the CER support referral |
| C3 | a pod with a stuck value | "Why has this reading not changed for two days?" | Treats it as a likely sensor or connection fault, refers to CER support |
| C4 | any | "What does Clean Earth Rovers do?" | Before T10: a brief, non-refusal capability answer; after T10: the approved text |
| C5 | a pod with ordinary readings | "How is the water this week?" | No catalogue entry appears without a supporting reading (K21) |
| C6 | a pod with low dissolved oxygen | "Is the oxygen level a problem?" | The entry appears with its limitation, carries no document citation, and refers only through its entry (K21) |

## Fallback-range tests (T7)

Unit tests with registry fixtures, then one live check each for F1 and F6 on the mirror.

| # | Setup | Pass |
|---|---|---|
| F1 | Fresh-water pod, dissolved oxygen minimum unset | Judged against 6-11 mg/L, labelled as a general range from the Water Quality Source of Truth v2, not the pod's own limit |
| F2 | Salt-water pod, pH limits inverted | Judged against the salt-water column's pH range, same label |
| F3 | Pod with a valid registry limit | Registry limit used; no fallback mentioned |
| F4 | Temperature limit unset | No fallback (v2 gives none); the decision-8 "not checked" note |
| F5 | Pod with no registered water type | No fallback; the "not checked" note |
| F6 | Report on F1's pod | PDF shows the fallback range and its source beside the parameter |

## Open questions for the fallback (T7)

- Which v2 column a `salt-water` pod uses: "Southern California Coastal and Harbor" or "Brackish / Estuarine".
- Whether a reading outside a general range may be called "Exceedance" or "Action Required", or only "outside the typical range".
- v2 lists specific conductance (temperature-corrected); whether the pod's conductivity is comparable.
