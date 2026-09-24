# Conversation quality check, 2026-09-24

A manual smoke check of Gilligan through the full local stack: dashboard `:3000` to relay `:5001` (`local` `d12ad6d`) to cer-demo `:8010` (`dev` `e7a986b`).
Configuration: `.env` as checked in locally, so `SENSOR_TOOL=true`, `REPORT_TOOL=true`, `CATALOGUE_PROMPT` off, `DEFAULT_RETRIEVAL=hybrid-slice-vector`, `CORPUS_SOURCE=artifact`, model `gpt-oss-120b` at temperature 0.
Caller: the configured superadmin device token (5 pods, 3 organizations).
26 turns sent to `GET /api/v1/gilligan/question`; all live device reads were read-only.
Raw responses were kept in the session scratchpad only, since they carry live pod positions.

## Summary

Transport, tool calling and refusals are sound.
Every turn returned 200 in 1 to 11 seconds, with no round cap hit, no server errors and no citation-audit corrections.
Tool selection was right in every data turn: name to label resolution through `list_pods`, sensible `metric`/`time_range`/`aggregation`, `get_pod_thresholds` when judging, `get_turbidity_info` before interpreting turbidity, `generate_report` for report and summary requests, and one read per pod for a comparison.
Refusals fired on the right things (swim or drinking safety, weather, system prompt extraction, an unknown pod) and each named an alternative.

The problems are in answer content, and most trace to what the tools and prompt give the model rather than to the model itself.

## Findings

| # | turn | finding | severity | likely cause |
|---|---|---|---|---|
| 1 | "Which of my pods are online right now?" | Says all five pods "have recent last-reported timestamps, so they are likely online", while two last reported 10 and 12 days earlier. | high | The model is never told today's date: no date in `src/prompt/systemPrompt.ts`, and `list_pods` returns absolute `last_reported` only, with no age or staleness flag. |
| 2 | "What's the current water temperature at Old Woman Creek?" | Presents a reading from 2026-09-14 as the current temperature; the timestamp is shown but not flagged as 10 days stale. | medium | Same as 1. |
| 3 | "Give me a quick summary of everything at Old Woman Creek over the last 30 days" | Report status "Action Required" beside "0 events... No abnormal conditions were reported". The window also silently ends 2026-09-14, the pod's last reading, without saying the pod has been silent since. | high | `generate_report`'s tool result carries `status` and `events_flagged` but no per-parameter flags, so an Exceedance-driven status (`overallStatus` in `src/report/types.ts`) reaches the model unexplained and the model fills the gap. |
| 4 | "Why did the pH at Algalita Pod crash to 3 yesterday?" | Queries `aggregation: "latest"` for yesterday (one reading) and then states "did not record a value near 3". It does suggest a series afterwards. | medium | Aggregation choice; a false-premise check needs `min` or `series`. Prompt guidance gap. |
| 5 | "How is the dissolved oxygen looking at Marina Park this week?" | Reports a weekly DO mean of 15.19 mg/L in salt water and compares it only to the configured maximum; does not say it is about twice saturation and likely a sensor issue. It also drops two instructions from the tool `note`: say that earlier history from another label is withheld, and that the device's water type disagrees with the deployment's configured freshwater. | medium | Tool notes phrased as instructions are not reliably relayed; plausibility filtering only removes readings beyond absolute solubility. |
| 6 | follow-up "And what about the pH there over the same period?" | "Same period" was "this week" (Sep 21 onward) but the model asked for `last week` (rolling 7 days), then called it "the current weekly mean". | low | History carries the answer text, not the prior tool arguments. |
| 7 | "How does water temperature affect dissolved oxygen?" | Answers from a salinity correction-factor table and never states the basic relationship (colder water holds more oxygen). | medium | Retrieval ranked the correction table over solubility material; the model would not use general knowledge by design. |
| 8 | "What's the ORP at Balboa... what does that value suggest?" | A phrase in quotation marks ("represents how strongly electrons are transferred...") is a paraphrase, not the cited text; the tap-water comparison over-reaches. | low | Quote fidelity is not checked by the citation audit, which checks markers only. |
| 9 | every turn | `citations` always holds 7 to 9 entries, including the four probe datasheets, even for a greeting with no claim. It is the retrieved set, not the cited set. | low | By contract; worth confirming the page shows only cited sources. |
| 10 | refusals | Every refusal opens with the same fixed sentence ("I can only answer questions grounded in this sensor's readings..."), including for an unknown pod name, where a plain "no pod by that name" would read better. | low | Refusal template in the system prompt. |
| 11 | "Is that a healthy level for marine life?" | Refuses: the corpus has no marine DO criteria. Correct under grounding, but it is a natural follow-up users will ask. | info | Corpus gap. |

## What worked

- Document questions (DO, pH range, ORP, conductivity) were accurate and quoted their sources.
- Asking "What's the pH right now?" with no pod asked which pod; with the page's pod set (`device=dev:...`) it read that pod directly without `list_pods`.
- Turbidity answers used the provisional band wording and warned that an all-zero series may mean a missing sensor.
- The Spanish question was answered in Spanish with a correct tool call.
- A prompt-injection request for the system prompt was refused.
- A report request produced a `reports` offer with the resolved window and status.

## Not checked

- The report PDF download (`POST /api/v1/gilligan/report`); the call was blocked by the session's permission gate.
- The dashboard page itself in a browser; only its API route was exercised.
- A caller scoped to one organization; the superadmin token sees every pod, so cross-organization refusal was not exercised.

## Suggested follow-ups

1. Put the current UTC time in the system prompt when tools are on, and add an age or staleness field to `list_pods` and `query_sensor_data` results (findings 1, 2, 3).
2. Include per-parameter flags and the reason for the status in `generate_report`'s tool result (finding 3).
3. Prompt guidance: use `min`/`max` or `series` to test a claimed spike or crash; relay tool `note` caveats (findings 4, 5).
