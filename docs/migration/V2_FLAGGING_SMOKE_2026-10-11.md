# v2 flagging smoke check, 2026-10-11

Branch `task/sot-v2-flagging` at `bf79c1a`, run locally on port 8020 at about 07:57-08:10 UTC with the user's approval of read-only production pod reads.
Settings as the release (`glm-5p3-flash`, reasoning low, `CATALOGUE_PROMPT=true`, `local-vector`, query rewrite on, `WATER_TYPE=freshwater`, 16 tool rounds) except `REPORT_TOOL=false`, `QUERY_QUOTA=false`, `AUDIT_LOG=false`, and the temperature left at the model default.
The caller token was the deployment's device token (superadmin), so every pod the token sees was in scope.
Spend: 468,579 prompt tokens (223,232 cached) and 2,865 completion tokens over 8 questions, about $0.07 at list price; no writes.

## Results

| # | Question | Pass condition (backlog §1d) | Result |
|---|---|---|---|
| 1 | "How is the water at Balboa this week?" | Stuck dissolved-oxygen zeros called a likely sensor or data issue, not low oxygen | Not testable as worded: dissolved oxygen this week averaged 13.7 mg/L with no zeros. Conductivity zeros (all 304) and stuck turbidity were called sensor problems. |
| 1c | "How has the dissolved oxygen at Balboa Yacht Basin Buoy looked over the last 30 days?" (added) | As 1 | Pass: verdict "likely data issue", `sensor_quality` "likely failed sensor"; the answer says the low run "is more likely an instrument problem than a real oxygen crash". |
| 2 | "Is the pH OK right now at Algalita?" | Right-now verdict judged on the last three readings | Pass, weakly: in range at 7.00 against 6-10; the lookback path (`metricVerdict.ts`) ran, but the newest reading alone already decides it. |
| 3 | "Do I need to fix or recalibrate anything at Marina Park?" | Conductivity offset stated once as a likely threshold, fouling or calibration issue, no maintenance push | Pass: stated once as "a threshold-fit question, not automatically a sensor fault"; inspection is advised only for pH (283 of 331 readings implausible, up to 13.8) and stuck turbidity, both likely data issues. |
| 4-5 | "What's the turbidity at PCH Public Dock?", then "And its dissolved oxygen?" | Turbidity caveat once | Pass: the caveat appears in 4 only. |
| 6 | "Any sensor problems at Algalita this month?" | Scattered failures not flagged; a board fault named if present | Pass: the all-channel failure (three or more in a row) is named as a likely board or data issue; scattered implausible readings are counted as excluded, not flagged. |

## Observations

- 1b, "How has the dissolved oxygen at Balboa looked over the last 30 days?", got a pod clarification: the model called `query_sensor_data` without `device`, while question 1 called `list_pods` first and resolved "Balboa"; model variance, not part of this change.
- Question 6 answered from `list_pods` notes alone, which carry the QC summary but no window, so "this month" was not applied.
- Balboa pH: two 3-in-a-row runs below the operator minimum of 4 on Oct 5-6 are reported as out of range (low), and one 2.92 reading was excluded as implausible.
- PCH Public Dock has been silent since 2026-10-07 03:39 UTC; its last dissolved oxygen, 1.68 mg/L, is reported as a persistent low run that began as turbidity became a data issue, so the answer's "priority" wording may overstate a dying sensor.
- Dissolved-oxygen zeros outside a flat line of 6 still count in daily means (Balboa Sept 11-15 means of 2.3-4.1 mg/L "with many readings at 0").

## Answers

### q1: "How is the water at Balboa this week?"

Tools: list_pods, query_sensor_data.

> Here's how the **Balboa Yacht Basin Buoy** (Newport Beach, CA) looked this week (Oct 5–11, 304 readings; last reported 31 minutes ago):
>
> **Working sensors — all within configured thresholds:**
> - **Dissolved oxygen:** 13.7 mg/L average — in range (limit 3–27)
> - **ORP:** 307 mV average — in range (limit 100–400)
> - **Temperature:** 71.3 °F average — in range (limit 50–95)
> - **pH:** 7.76 average — but flagged **out of range (low)** briefly: two runs on Oct 5–6 dipped below the minimum of 4, ending by Oct 6. It has not been out since, and one implausible reading (2.92) was excluded as a probe fault.
>
> **Sensor problems this week:**
> - **Conductivity:** no usable readings — all 304 readings this week read 0 µS/cm, which no natural water does, so they were excluded as probe faults. This has been ongoing since Sept 22.
> - **Turbidity:** no usable readings — every reading was stuck at 0, flagged as a likely failed sensor. (Turbidity is a relative clarity index, not a calibrated measurement, so even a good reading would only show relative cloudiness.)
>
> **Bottom line:** the sensors that are working show water consistent with the pod's configured alert limits this week, but the conductivity and turbidity sensors appear to have failed, and the pH sensor had a brief low excursion. Since a sensor problem can look like a water-quality change, it's worth inspecting the sensors for fouling or damage and contacting Clean Earth Rovers support (sales@cleanearthrovers.com) about the failed conductivity and turbidity sensors. Note these limits are alert points, not health standards — a reading inside them isn't necessarily healthy for aquatic life.

### q1b: "How has the dissolved oxygen at Balboa looked over the last 30 days?"

Tools: query_sensor_data.

> There are a few pods on this account, and I want to make sure I read the right one. Did you mean **Balboa Yacht Basin Buoy**? The other pods are: Old Woman Creek 2026, Marina Park, Algalita Pod, and PCH Public Dock Buoy.

### q1c: "How has the dissolved oxygen at Balboa Yacht Basin Buoy looked over the last 30 days?"

Tools: query_sensor_data.

> Here's how dissolved oxygen at Balboa Yacht Basin Buoy (Newport Beach, CA) has looked over the last 30 days — with an important caveat up front: the system flagged this sensor as a **likely failed sensor**, so treat these numbers with caution.
>
> **The data (daily means, mg/L):**
> - **Sept 11–15:** Low and erratic, daily means ~2.3–4.1 mg/L, with many readings at 0.
> - **Sept 16–21:** A gap in the record — the longest gap in the window was about 124 hours (5 gaps over 3 hours total).
> - **Sept 22–25:** Volatile — daily means swung from ~1.5 to ~10.8 mg/L, with readings ranging from 0 up to 15.4.
> - **Sept 26 onward:** Readings settled into a much steadier pattern, daily means ~14–14.6 mg/L through early October, easing slightly to ~13–13.5 mg/L by Oct 9–11. The most recent reading came in 33 minutes ago.
>
> **Why to be cautious:**
> - 28 readings were excluded as "stuck" (identical values repeated for a long stretch), plus 1 faulted reading and 68 suspect readings. The system's verdict is "likely data issue" — this pattern most likely reflects a sensor or data problem rather than the water itself, and the sensor should be inspected.
> - 851 readings from an earlier location (June 14 – Aug 12) were excluded, so this summary covers only the current site.
> - The verdict also noted an out-of-range low run starting Sept 11, but given the sensor-quality flag, that's more likely an instrument problem than a real oxygen crash.
>
> **Suggested next step:** Inspect the sensor for fouling or damage and check that the pod is sitting properly in the water, so an instrument problem can be ruled out. Clean the sensors only if you can do so safely and within your site's safety rules; if the battery is low or a sensor looks damaged, contact Clean Earth Rovers support (sales@cleanearthrovers.com). Note that cleaning resets fouling, so compare readings before and after.

### q2: "Is the pH OK right now at Algalita?"

Tools: query_sensor_data, query_sensor_data.

> Yes — the latest pH at Algalita Pod is **7.00** (6.9965), read at 2026-10-11 07:38 UTC (about 21 minutes ago). Its verdict is **in range** against the pod's configured thresholds of 6–10.
>
> One note: 775 readings from an earlier location (June 13 – Aug 6, 2026) were excluded from the record, since the pod was moved — so current-site history only goes back to August.

### q3: "Do I need to fix or recalibrate anything at Marina Park?"

Tools: query_sensor_data, get_pod_thresholds, query_sensor_data.

> Here's what the Marina Park data (last 7 days, last reading 31 minutes ago) suggests needs attention:
>
> **Likely sensor problems — worth inspecting:**
>
> 1. **pH — likely data issue.** 283 of 331 readings were physically implausible (up to ~13.8) and were excluded as probe faults. The remaining readings have been above the configured 4–10 limit since Oct 4, and the pattern most likely reflects a sensor or data issue rather than the water. The pH sensor should be inspected, cleaned, and recalibrated.
>
> 2. **Turbidity — likely failed sensor.** All 331 readings in the window were stuck at one value (a run going back to Aug 14), which is the sensor's default for a bad reading. Contact Clean Earth Rovers support to have the sensor replaced (sales@cleanearthrovers.com).
>
> **Threshold flags (not necessarily a fix):**
>
> 3. **Conductivity** is persistently below its configured minimum (latest 30,520 µS/cm vs. a 40,000–75,000 µS/cm limit) — this is a threshold-fit question, not automatically a sensor fault.
> 4. **Dissolved oxygen** ran above its 10 mg/L maximum in 8 runs between Oct 4 and Oct 10, but is currently 6.02 mg/L and no longer out of range.
> 5. Temperature and ORP are in range.
>
> **Suggested next step:** inspect the sensors for fouling or damage and check the pod is sitting properly in the water, so instrument problems can be ruled out — clean only if you can do so safely and within your site's rules. Note that cleaning resets fouling, so compare readings before and after. If the turbidity sensor looks damaged, contact Clean Earth Rovers support.
>
> One caveat: 115 readings from an earlier location (July 9–Aug 4) were excluded, so the history shown may start later than the site's first reading.

### q4: "What's the turbidity at PCH Public Dock?"

Tools: get_turbidity_info, query_sensor_data.

> I can't give you a current turbidity reading for PCH Public Dock — there isn't a usable one right now.
>
> - The pod (PCH Public Dock Buoy, Newport Beach CA) last reported on **2026-10-07 at 03:39 UTC, about 5 days ago**, so it's currently stale.
> - The most recent turbidity readings (21 of them, from 2026-10-06 18:03 to 2026-10-07 03:39) were flagged as a **likely data issue** — the pattern most likely reflects a sensor or data problem rather than the water, and they were excluded from the statistic. No reading exists after that.
>
> One caveat: turbidity here is a relative, uncalibrated index (not NTU), described only by clarity bands — Clear, Moderate, or Turbid — so even a good reading shows relative cloudiness, not an exact measurement.
>
> Since the readings look like a sensor/data issue and the pod has gone quiet, it's worth contacting Clean Earth Rovers support (sales@cleanearthrovers.com) about the sensor, and inspecting the pod for fouling or damage if you can do so safely.

### q5: "And its dissolved oxygen?"

Tools: query_sensor_data.

> The latest dissolved oxygen reading at PCH Public Dock Buoy is **1.68 mg/L**, observed on **2026-10-07 at 03:39 UTC** — the pod's last reading, so it's now 5 days old and the pod is stale.
>
> That reading is **out of range (low)** against the pod's configured threshold of 4–10 mg/L. It first went low on 2026-10-06 at 18:39 UTC, and the condition was persistent and still ongoing when the pod last reported.
>
> Sustained low dissolved oxygen should be treated as a priority — check the sensor at the same time (clean it and confirm its reading changes when the water around it moves), and follow your site protocol for notifying others. If the reading still looks wrong, contact Clean Earth Rovers support (sales@cleanearthrovers.com) to repair or replace the sensor.

### q6: "Any sensor problems at Algalita this month?"

Tools: list_pods.

> Yes — the Algalita Pod's data this month shows several likely sensor problems (the pod itself is online, last reporting 21 minutes ago):
>
> - **Turbidity sensor likely failed**: readings were stuck at one value for a long stretch (24+ identical readings in a row, or at 0 for a day or more). Those readings were excluded from the statistics, and the sensor should be inspected.
> - **All sensors failed simultaneously** on three or more consecutive readings — most likely a sensor or data issue such as the board not responding, rather than the water. Those readings were also excluded.
> - **Implausible readings excluded**: 1 dissolved-oxygen reading beyond oxygen's solubility limit, 29 pH readings outside the plausible band (3–12), and 1 conductivity reading at or below 0 µS/cm (no natural water reads 0). These may be sensor faults and were left out of the reported values.
>
> Also note: 775 readings from an earlier location (June 13 – Aug 6) were excluded, so the history shown may start later than the site's first reading.
>
> Given the stuck turbidity sensor and the board-level failure, I'd suggest inspecting the sensors for fouling or damage and checking that the pod is sitting properly in the water; if the turbidity sensor stays stuck at one value, contact Clean Earth Rovers support (sales@cleanearthrovers.com) to have it replaced.

## Rerun on `dev` after the spike change, 2026-10-12

Question 1c was asked again on `dev` at `e92a0c0`, which includes `612adaa` (a spike must also exceed the minimum detectable change), at about 20:54 UTC with the same settings and the user's approval of a read-only production read.
Spend: 84,430 prompt tokens (53,248 cached) and 534 completion tokens, about $0.01.
Recorded on `dev` by the v2 flagging chat with the user's explicit permission; the user tells the coordinator, who owns `dev`.

| Dissolved oxygen, Balboa, last 30 days | `bf79c1a` (2026-10-11) | `e92a0c0` (2026-10-12) |
|---|---|---|
| Verdict | likely data issue | likely data issue |
| Sensor quality | likely failed sensor | likely failed sensor |
| Stuck / faulted / suspect readings excluded or counted | 28 / 1 / 68 | 28 / 1 / 68 |
| Data-issue runs | 7 (96 readings) | 7 (96 readings) |
| Out-of-range low runs | 15 | 10 |

Pass: the spike change does not alter this pod's verdict or suspect count, and the answer still treats the September lows as a sensor or data issue.
The drop from 15 to 10 low runs most likely comes from the window moving a day later (it now starts 2026-09-12, not 2026-09-11), not from the spike change, since the suspect count is unchanged.

### 1c rerun: "How has the dissolved oxygen at Balboa Yacht Basin Buoy looked over the last 30 days?"

Tools: query_sensor_data, query_sensor_data.

> Over the last 30 days (Sep 12 – Oct 12, 2026), dissolved oxygen at Balboa Yacht Basin Buoy has been erratic, and the system flags a likely data issue rather than a clean picture of the water.
>
> **What the data shows:**
> - **Sep 12–15:** Low and unstable, daily means around 2.3–4.2 mg/L, with readings dipping to 0.
> - **Sep 16–21:** A gap in the record — the longest data gap in the window was about 124 hours (5 gaps over 3 hours total).
> - **Sep 22–25:** Highly variable, with daily means swinging from ~1.5 to ~10.8 mg/L.
> - **Sep 26 onward:** Much steadier and higher — daily means held around 14–14.6 mg/L through early October, easing slightly to ~13–13.8 mg/L by Oct 9–12.
>
> **Important caveats:**
> - The device flagged a **likely failed sensor**: 28 readings were stuck at one value for a long stretch and were excluded, plus 1 device-flagged faulted reading and 68 suspect readings. The note says this pattern most likely reflects a sensor or data issue, and the sensor should be inspected.
> - The verdict is "likely data issue," so the low stretches in mid-to-late September should not be taken at face value as water conditions.
> - The pod last reported 11 minutes ago, so it's currently online.
>
> Given the failed-sensor flag, I'd suggest inspecting the sensors for fouling or damage and checking that the pod is sitting properly in the water, so an instrument problem can be ruled out. Clean the sensors only if you can do so safely and within your site's safety rules; if a sewage, bloom or chemical release is suspected, avoid touching the water. If the battery is low or a sensor looks damaged, contact Clean Earth Rovers support (sales@cleanearthrovers.com). Cleaning resets fouling, so compare readings before and after.
>
> Data covered in this reply: Balboa Yacht Basin Buoy, 2026-09-12 20:54 to 2026-10-12 20:54 UTC (1014 readings).
