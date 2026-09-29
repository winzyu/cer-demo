# Q9 C1/D1 result: pod-status rule and excluded implausible readings

Branch `cloud/q9-c1-d1`, cut from `origin/cloud/q9-logic` at `bc097e1`.
This was a cloud session: no live device reads, no eval runs, no `SENSOR_TOOL` or `REPORT_TOOL`, and no secrets.
`docs/migration/E2E_CHECKLIST.md` was missing on this branch, so it was copied from `origin/dev` at `73770d2` and then edited.

## Changed files

| File | Change |
| --- | --- |
| `src/prompt/systemPrompt.ts` | The "stale pod" and "null last_reported" bullets are replaced by one rule, "Pod status in list_pods". The `excluded_implausible` bullet now says "probe fault" instead of "sensor rail". A new bullet explains how to read the excluded-value fields. |
| `src/tools/listPods.ts` | The note now only defines `reporting`, `silent` and `unconfirmed`. It no longer says to confirm with `query_sensor_data` or that silent pods must be listed. The docstring points to the prompt rule. |
| `src/tools/querySensorData.ts` | Adds `excludedImplausibleDetail`. Each metric with excluded readings gets `excluded_implausible_values`, `excluded_implausible_not_listed`, `excluded_implausible_min` and `excluded_implausible_max`. The note is reworded. |
| `test/unit/listPods.test.ts` | The note assertions now expect status definitions. New test: the note no longer mentions `query_sensor_data` or "stopped reporting". |
| `test/unit/prompt.test.ts` | Adds a C1 rule test, including a check that the `query_sensor_data` check is stated once. Adds a D1 field-reading test. |
| `test/unit/querySensorData.test.ts` | New describe block with three cases: excluded pH values and the counted minimum, the cap of ten, and no extra fields when all readings are plausible. |
| `docs/SPECS.md` | Adds two lines: the pod-status rule, and the excluded-value fields. |
| `docs/migration/E2E_CHECKLIST.md` | The D1 expected result now requires readings below pH 3 to be reported as excluded probe faults, kept apart from the counted minimum. |

## C1: one rule

The conflict came from two places:
- The prompt said "never call a stale pod online".
- The prompt and the `list_pods` note both said not to tell a user a pod had stopped reporting without a `query_sensor_data` check. The note's version covered every pod, so it also covered stale ones.

The rule now exists once, in the system prompt:
- Only `reporting` pods are called online.
- Every `silent` pod is listed as silent, with its `last_reported_age`.
- The `query_sensor_data` check applies only to an `unconfirmed` pod, meaning one whose `last_reported` is null.

The tool note defines the statuses and gives no instructions.

## D1: tool-result shape

The example is a pH `min` over a day with three unflagged readings: 2.5, 13.99 and 2.07, oldest first.

Before:

```json
{
  "unit": "unitless",
  "value": 7.03,
  "n_samples": 44,
  "excluded_faulted": 0,
  "excluded_implausible": 3,
  "note": "... Excluded as physically impossible despite no probe fault flag: 3 pH reading(s) outside the pH range natural water can reach (pH 3-12; probe failure, not a measurement). These are sensor rails, not measurements, and are not counted in any statistic above."
}
```

After:

```json
{
  "unit": "unitless",
  "value": 7.03,
  "n_samples": 44,
  "excluded_faulted": 0,
  "excluded_implausible": 3,
  "excluded_implausible_min": 2.07,
  "excluded_implausible_max": 13.99,
  "excluded_implausible_values": [
    { "at": "2026-08-11T...Z", "value": 2.5 },
    { "at": "2026-08-11T...Z", "value": 13.99 },
    { "at": "2026-08-11T...Z", "value": 2.07 }
  ],
  "note": "... Excluded as physically impossible despite no probe fault flag: 3 pH reading(s) outside the pH range natural water can reach (pH 3-12; probe failure, not a measurement). These are probe faults, not measurements. Each metric's \"value\" and \"n_samples\" count only the remaining readings; the excluded ones are in \"excluded_implausible_values\", with their range in \"excluded_implausible_min\" and \"excluded_implausible_max\"."
}
```

The `value` of 7.03 and the elided timestamps are illustrative. The field set and the note text are what the tests pin.

How the new fields behave:
- `excluded_implausible_values` lists the newest ten excluded readings, oldest first.
- When more than ten are excluded, `excluded_implausible_not_listed` gives the count of the rest.
- `excluded_implausible_min` and `excluded_implausible_max` cover every excluded reading, not only the listed ten.
- When nothing is excluded, none of these fields appear.
- With `metric: "all"`, the same fields appear inside each entry of `metrics`.
- The reason text comes from `implausibilityReason`, so it fits both cases: readings at the end of the scale, and readings outside the range natural water can reach.

System prompt: one new bullet explains that `value` and `n_samples` count only the remaining readings. It says to report excluded values as probe faults, never as the minimum, the maximum or a real reading.

## Checks run

| Check | Result |
| --- | --- |
| `npx jest test/unit/listPods.test.ts --runInBand` | 16 passed |
| `npx jest test/unit/prompt.test.ts --runInBand` | 57 passed |
| `npx jest test/unit/querySensorData.test.ts --runInBand` | 66 passed |
| `npm run typecheck` | clean |
| `npm run lint` | clean after wrapping one line longer than 100 characters in `querySensorData.ts` |

Not run: `npm test`, any other suite, the server, and live reads.

A search of `test/`, `src/` and the eval fixtures for the removed wording found no other dependent test. The removed phrases were "sensor rails", "NOT that the pod is silent" and "stopped reporting on the strength".

## Open questions

1. **Report wording.** `src/report/buildReportInput.ts` still says "sensor rails reported without a fault flag" in the report's Calibration notes. That file was outside this task, and the wording is now wrong for pH readings outside natural water.
2. **Prompt change.** `TOOL_BLOCK` changed. It is part of the tools-on system prompt, so the cached prefix changes, and any tools-on eval capture made before this commit is not comparable. The tools-off prompt is unchanged.
3. **Cost of the new fields.** Up to ten `{at, value}` entries per metric is about 400 tokens per metric in the worst case. With `metric: "all"` on a pod where every probe rails, that could reach about 2,400 tokens. Lower the cap if this matters.
4. **Checklist copy.** `E2E_CHECKLIST.md` now exists on this branch as a copy of `origin/dev` plus the D1 edit. Merging this branch toward `dev` gives a one-row change only while `dev`'s copy has not moved.
5. **Pods beyond the probe cap.** For `not_checked` pods beyond the 20-pod probe cap, `last_reported` is the string `"not_checked"`. The prompt rule does not cover them, so the model's handling of that status is untested.
6. **Live behaviour not verified.** Neither C1 nor D1 has been checked against a live model run. The E2E checklist rows C1 and D1 are that check, and they need `SENSOR_TOOL`, live reads and paid model calls.
