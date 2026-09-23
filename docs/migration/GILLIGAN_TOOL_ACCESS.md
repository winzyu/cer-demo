# Gilligan tool access and refusal quality

Why the assistant refused three consecutive questions in a real session, what was wrong, and what changed.
Written 2026-09-21, after R3; verified live 2026-09-22.
Decision: [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md) D10.
Behaviour: [`../SPECS.md`](../SPECS.md) §10.2 and §10.3a.

## The session that prompted this

Three turns, three refusals, all of them `REFUSAL_SENTENCE` plus one clause.

| turn | answer |
|---|---|
| "hello" | the refusal sentence, then "Your message does not contain a question about the sensor data or the provided documents." |
| "can you tell me what my past 2 weeks of turbidity look like" | the refusal sentence, then "I don't have the past two weeks of turbidity data." |
| "do you have data on any of my pods?" | the refusal sentence, then "I have no sensor data for your pods." |

These are three different defects that happen to share one output.
The second and third are false: the system holds two weeks of turbidity for several pods, and the account has pods.
The third is the worst of them, because it is a confident negative asserted about a fleet the model had never looked at.

## Cause 1: the model had no tools at all

`SENSOR_TOOL` and `REPORT_TOOL` both default to `false` and were `false` in the running `.env`.
That flag moves three things together, by design: the `TOOL_BLOCK` half of the system prompt, the `tools` array on the request, and the tool registry (`src/tools/index.ts`).
With it off, the model is handed retrieved corpus excerpts and nothing else — so a question about an actual reading has nothing to call, no context that could contain the answer, and the scope rule sends it straight to the refusal sentence.

The default is correct and should stay: the eval harness requires `SENSOR_TOOL=false` on both server and runner, because the tool block changes the prompt bytes a capture is made against.
What was missing was any statement of the value the *product* runs with.
R3 verified the whole relay end to end with the flag off ([`GILLIGAN_R3_PORT.md`](GILLIGAN_R3_PORT.md)), which is why a stack that had been exercised through dashboard, server and cer-demo still could not answer a pod question.

Recorded as D10: Gilligan runs with `SENSOR_TOOL=true`, and `REPORT_TOOL` stays off until R1 returns report bytes instead of the sidecar-guarded disk path.
R1's report half landed on 2026-09-22 and D10 was revised the same day: the release runs `REPORT_TOOL=true` too.

## Cause 2: no route to a pod name

Turning `SENSOR_TOOL` on fixes the turbidity question but not the pod question.
The fleet is scoped to the caller's organization by the device API, so it is a property of *who is asking*, not of the deployment.
That means it cannot be in the system prompt, which has to stay byte-identical across requests for the Fireworks prefix cache to hold, and it is not in CONTEXT, which carries corpus text.

Before this change, the model's only route to a pod name was to call `query_sensor_data` with no `device` and read the names out of the error `resolveDevice` returns when more than one device is visible:

> This deployment can see 5 devices, so "device" is required. Ask the user which one they mean. Available devices: ...

That works by accident, costs a round, and presents to the model as a failure — so the likely outcome for "do you have data on any of my pods?" was exactly the refusal that was observed.

**Added `list_pods`** (`src/tools/listPods.ts`), registered under `SENSOR_TOOL` alongside the other three.
It takes no arguments and returns the deduped registry rows under the same names `device` accepts, each with its water type and a best-effort `last_reported`.
It shares the `QuerySensorData` instance and therefore the per-token `/devices` TTL cache, so listing pods and then reading one costs a single `/devices` round trip.

`last_reported` is deliberately hedged in both the result and the prompt.
It comes from `/water/last`, which drops readings whose latitude is absent or zero, so a pod reporting water chemistry without a GPS fix is indistinguishable there from one that has stopped.
A null means "not confirmed recently" and never "silent"; the question "has this pod stopped reporting" is a `query_sensor_data` call.
Freshness probing is capped at 20 pods because each probe is its own production read; the listing itself is never truncated, since a partial fleet is a wrong answer while a missing freshness column is a stated omission.

The routing rule is written as a prohibition — never answer "I have no data for your pods" without having called `list_pods` — because the observed failure was a confident negative rather than a missing call.

## Cause 3: the prompt refused things that asked nothing

The scope rule fired on any message that was not a groundable question, and "hello" is not a groundable question.
Neither is "what can you do", which is the other thing a user types first.

The prompt now carves out greetings, thanks and capability questions: they ask for nothing, so there is nothing to ground and nothing to refuse, and the assistant answers in a sentence or two and invites a question.
The carve-out is named narrowly so it cannot be read as licence to answer a substantive question unsupported, and `test/unit/prompt.test.ts` asserts the three rules that bound it — no prior knowledge, no world knowledge, no fabricated readings — still stand beside it.

The same edit asks a refusal to name the closest thing the system genuinely can do, as a different next step and never as the answer.
That is not new policy: every wave-1 `refusal-*` fixture rubric already requires it ("Offers what the system can genuinely contribute instead ... without presenting it as a substitute") and the prompt text simply never asked for it.

**This is a prompt edit, so it invalidates captures made before it.**
The Phase 3 gold-context baseline captured on 2026-09-14 predates it, so that capture no longer describes the current prompt and Phase 3 must be recaptured after this edit; prompt changes land before a capture, not after ([`../EVAL_REBUILD.md`](../EVAL_REBUILD.md)).
`REFUSAL_SENTENCE` itself is untouched and still pinned character-for-character.

## What changed

| file | change |
|---|---|
| `src/tools/listPods.ts` | new: the `list_pods` tool |
| `src/tools/querySensorData.ts` | `listDevicesForTool()` and `lastReportedForTool()` passthroughs, so `list_pods` reuses the same cache and the same failure text |
| `src/tools/index.ts` | registers `list_pods` under `SENSOR_TOOL`, sharing the `QuerySensorData` instance |
| `src/prompt/systemPrompt.ts` | `TOOL_BLOCK`: the `list_pods` entry, its two routing rules, its `last_reported` caveat. Base prompt: the greeting carve-out and the more useful refusal |
| `test/unit/listPods.test.ts` | new: 11 offline tests over the fleet, the freshness column and the failure paths |
| `test/unit/prompt.test.ts` | 7 new assertions over the carve-out, its bounds, and the new routing rules |

The tool flags stay purely additive to the base prompt, which `test/unit/prompt.test.ts` still checks on all four combinations.

## Verification

Offline, 2026-09-21: `npm run typecheck` and `npm run lint` clean; `listPods` (11) and `prompt` (36) pass, as do the adjacent `querySensorData` (59), `getPodThresholds` (9) and `chatOrchestrator` (27) suites.

Live, 2026-09-22, with `SENSOR_TOOL=true` on `:8010` and the relay on `:5001` pointed at it.
All three questions from the session above were re-asked and all three are now answered.

| turn | tools called | result |
|---|---|---|
| "hello" | none | A one-sentence description of what it covers, and an invitation to ask. No refusal, and no tool call wasted on a greeting. |
| "do you have data on any of my pods?" | `list_pods` | Named all five pods with water type and last-reported date, then asked which one. Previously "I have no sensor data for your pods." |
| "can you tell me what my past 2 weeks of turbidity look like" (pod selected, as the dashboard's picker does) | `get_turbidity_info`, then `query_sensor_data` | 14 days of turbidity as a 30-bucket series: 108 samples, 16 excluded as faulted, all zero, window `complete: true`. Reported the zeros in the Clear band *and* the caveat that zero can equally mean an offline sensor. |

The turbidity answer was checked against the tool result rather than read for plausibility: the sample count, the faulted-exclusion count, the window and the all-zero series all match what `query_sensor_data` returned.
The routing rules were followed exactly — `get_turbidity_info` before characterising the value, `series` for the trend, and `list_pods` before any claim about the fleet.

The same pod question was then asked through the relay at `:5001`, which returned the same answer with `"toolCalls": ["list_pods"]` in its `audit`.
That is the part R3 could not exercise: it confirms the caller's bearer token reaches cer-demo and on to the device API, which only matters once tools are on.

Spend: 4 chat questions, 106,158 Fireworks tokens (`gpt-oss-120b`), and live production device reads against the account's own pods. No writes.

## Defects observed while doing this

Both are pre-existing and neither is caused by this change.

- **A citation marker was attached to a claim that came from a tool result, with a quote that does not support it.** The turbidity answer ends its caveat sentence — whose substance came from `get_turbidity_info` — with `【5†"Turbidity, which can make water appear cloudy or muddy, is caused by the presence of suspended and dissolved matter"}】`. The system prompt already forbids this in as many words ("Do not put a citation marker on a sensor reading or a tool result; those are not CONTEXT excerpts"), so the fix is not another rule: the existing one was ignored, and why is worth knowing before Phase 3 treats citation placement as a graded property.
- **The `"}】` closer leaves a doubled bracket in the rendered text.** `MARKER_PATTERN` (`frontend/js/citations.js:23`, and its copy in the dashboard's `gilligan-citations.js`) accepts `}` as a marker closer, so on `..."}】` it consumes the `}` and leaves the real `】` behind: `collapseCitationQuotes` renders the marker above as `【5】】`. The quote text itself is stripped correctly and does not leak, so this is cosmetic, and it is the same shared pattern as the recorded `}]` defect rather than a new one.
