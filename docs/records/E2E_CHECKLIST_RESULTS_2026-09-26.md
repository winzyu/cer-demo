# Gilligan end-to-end checklist results, 2026-09-26 and 2026-09-29

Results of the short-run question script, which is now the "Short run" section of [`GILLIGAN_MANUAL_TEST_GUIDE.md`](../runbooks/GILLIGAN_MANUAL_TEST_GUIDE.md), where its IDs carry an `S` prefix (A1 here is SA1 there).
Moved from `E2E_CHECKLIST.md` on 2026-10-21 with only its headings changed; that file is archived (`docs-archive-2026-10-21c`).

## Stack under test, 2026-09-26

| service | port | code | settings that matter |
|---|---|---|---|
| dashboard | 3100 | `user-dashboard` `feature/gilligan-rag-assistant` `da5412f`, detached worktree | `.env.local` points both API variables at `:5101` |
| relay server | 5101 | `clean-earth-rovers-server` `feature/gilligan-rag-assistant` `b2074b8`, detached worktree | `DEV_LOCAL_PATHS=/api/v1/gilligan`, `GILLIGAN_BACKEND=rag`, `CER_RAG_BASE_URL=http://localhost:8110`, `DEV_UNVERIFIED_AUTH=true`, `DEV_CHAT_STORE=memory`; everything else proxied to the live API |
| cer-demo | 8110 | `dev` | `DEFAULT_RETRIEVAL=hybrid-slice-vector`, `CORPUS_SOURCE=artifact`, `LLM_MODEL=gpt-oss-120b`, `SENSOR_TOOL=true`, `REPORT_TOOL=true`, `QUERY_QUOTA=true`, `QUERY_QUOTA_REQUESTS=22`, `QUERY_QUOTA_REPORTS=2`, `QUERY_QUOTA_WINDOW=1d`, `QUERY_QUOTA_SCOPE=caller` |

Before starting anything in either upstream worktree, `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` must print nothing (`LOCAL_STACK.md`).
The request allowance equals the number of paid turns in the script, so the near-limit and limit states arrive at the end of a clean run; a re-asked turn spends one more, so restart cer-demo (which resets its in-memory counter) before a full re-run.
Restarting the relay empties chat history (`DEV_CHAT_STORE=memory`).

Caller: the superadmin device token from `cer-demo/.env`, placed in the page's `localStorage` as the login page does (6 pods in 3 organizations on 2026-09-26: Marina Park, PCH Public Dock Buoy, Marina Park DataPod™ and Balboa Yacht Basin Buoy in one; Old Woman Creek 2026 in the second; Algalita Pod in the third).
Consequence: nothing in this run can show a cross-organization refusal; that needs level 2 (a member login).

### Cost and live access

Every numbered turn with a `$` is one paid chat request (several model calls when tools run; about $0.01 each on `gpt-oss-120b`).
Every tool call and each report download is a live, read-only read of production pod data.
Nothing in the script writes to production.

## Baseline, 2026-09-26

Run once in headless Chromium (Playwright 1.63, kept outside the repositories) against dashboard `da5412f`, relay `b2074b8` and cer-demo `dev` `413679a`, with the settings in "Stack under test".
This machine's `cer-demo/.env` sets `gpt-oss-20b` and `DEFAULT_RETRIEVAL=stub`; both were overridden on the command line, not edited.
Corpus: `data/corpus/corpus.json` (generated 2026-09-22, 14 documents, 446 chunks) and `data/embeddings/cache.json` (446 entries, every chunk id matched), copied as a pair from the WSL machine; the water-quality source-of-truth v2 is not in it.
The relay also ran with `FIRESTORE_EMULATOR_HOST=127.0.0.1:1`, so any unexpected Firestore call fails locally instead of reaching production.

Spend: 22 paid turns, none repeated (cer-demo logged exactly 22 `POST /api/v1/chat`), about $0.22 at the planned rate; the relay does not pass token usage through, so the figure is an estimate.
Live reads: every tool call, two report builds, two refused report requests and the page's pod list; nothing was written.
Raw responses stayed in the session scratchpad because tool results carry pod positions; screenshots of the failures are in [`e2e-baseline-2026-09-26/`](../captures/e2e-baseline-2026-09-26/).

**Result: 31 checks, 25 pass, 5 fail, 1 N/A; plus two defects that cut across turns (X1, X2).**

| # | result | note |
|---|---|---|
| A1 | pass | Six pods listed (the second Marina Park entry is "Marina Park DataPod™", silent since 2025-07-08). |
| A2 | pass | `22 questions left, resets 09/26 17:00`. |
| B1 | pass | Two citation chips to USGS TM 9-A6.2; the sources list opens; no raw quote markers. The source shows as its address (known, plan U5). |
| B2 | pass | ±0.002 accuracy and the yearly-then-six-monthly recalibration, both quoted from the pH datasheet. |
| B3 | **fail** | Refused: "The documents don't include an explanation of how water temperature influences dissolved-oxygen levels". [screenshot](../captures/e2e-baseline-2026-09-26/B3.png) |
| C1 | **fail** | Names the three online pods but not the three silent ones or their age. [screenshot](../captures/e2e-baseline-2026-09-26/C1.png) |
| C2 | pass | Old Woman Creek 2026 marked stale, "13 days old" (12.2 days: `src/tools/readingAge.ts:36` rounds ages up by design); withheld earlier history relayed. |
| C3 | pass | "Marina Park" resolved to the Marina Park pod, not the DataPod; reading 15 minutes old. |
| C4 | pass | PCH Public Dock Buoy stale, "≈15 days" (14.0 days; same rounding). |
| C5 | pass | Marina Park DataPod™: no readings, last report 2025-07-08, 446 days. |
| C6 | pass | Balboa Yacht Basin Buoy; the 0 µS/cm conductivity reading explained as excluded. |
| C7 | pass | Picked pod answered without asking which pod. |
| D1 | **fail** | Misreads the tool: the counted minimum was 2.07 (48 readings) with one rail reading excluded separately, but the answer calls 2.07 the excluded rail and blames the water-type mismatch. [screenshot](../captures/e2e-baseline-2026-09-26/D1.png) |
| D2 | pass | Stayed on Algalita Pod and yesterday; mean 9.59 mg/L with a range. See X2. |
| D3 | **fail** | Says the week's series starts "9 Sept" (the window starts 2026-09-19) and reports hourly means above 20 mg/L in warm salt water, about three times saturation, as "supersaturation (or possible sensor-rail artifacts)" without saying the values are implausible (known, plan Q8). [screenshot](../captures/e2e-baseline-2026-09-26/D3.png) |
| E1 | pass | Status Action Required with its reason (DO, pH and conductivity outside thresholds), flags per parameter, 2026-09-19 to 2026-09-26, no link, button present. It also says "Events flagged: 0" beside three exceedances. |
| E2 | pass | `POST /api/v1/gilligan/report` 200 `application/pdf`; saved as `cer-report-marina-park-2026-09-19-to-2026-09-26.pdf`, 3 pages, header period matches. `Preparing report...` was not caught 300 ms after the click; the build had finished. |
| F1 | N/A | Superadmin answered with Old Woman Creek data, as expected; the cross-organization refusal needs level 2. |
| F2 | pass | No pod by that name; offers the list. Opens with the fixed refusal sentence (known, 2026-09-24 QA finding 10). |
| F3 | pass | Sensor cannot answer; consult public-health authorities. |
| F4 | pass | "I'm sorry, but I can't comply with that." |
| F5 | pass | Answered in Spanish with reading and age; the qualifications under it stay in English (X1). |
| G1 | **fail** | Reload keeps all five chats and `3 questions left`, but the list is oldest first with no dates. [screenshot](../captures/e2e-baseline-2026-09-26/G1.png) |
| G2 | pass | Chat 4 reopened with its answer, chips and button; the second download saved. |
| G3 | pass | `Report limit reached - try again later`; 429 with `retry-after`. |
| G4 | pass | Continued chat 1 (same chat id, no new history entry). The summary adds a probe-voltage claim that was not in the first answer. |
| H1 | pass | No horizontal scroll at 390 px; chat panel before history; input and send visible. The page uses 80% of the width (`w-[80%]`), leaving 39 px each side. |
| H2 | pass | Answer fits; tapping a chip opens the sources list. |
| I1 | pass | `1 question left, resets 09/26 17:00`; no separate near-limit warning exists. |
| I2 | pass | Answered; then `Message limit reached`, `You have used this period's questions. Resets 09/26 17:00.`, **See plans**, input and send disabled. The disabled send arrow keeps its gold colour. |
| I3 | pass | The limit state survives a reload. |

### Failures and likely locations

Nothing was changed; these are pointers for the owning sessions.

| # | failure | likely location |
|---|---|---|
| X1 | Every data answer lists the tool's raw `note` under the answer, including text written for the model: "Confirm with query_sensor_data before telling the user a pod has stopped reporting", "Say that the history shown may start later than the site's first reading", "Your instructions carry no ranges; to judge this reading against limits, use this pod's configured thresholds from get_pod_thresholds". Seen in C1-C6, D1-D3, F1, F2 and F5. [screenshot](../captures/e2e-baseline-2026-09-26/C3-X1.png) | dashboard `src/app/shared/gilligan-provenance.js:25` adds every `result.note` verbatim; the notes are written in cer-demo `src/tools/listPods.ts:144` and `src/tools/querySensorData.ts:982,1030`. |
| X2 | A tool call that failed and was retried still shows "Tool failed: ... Ask the user which one they mean" and "No readings in this window - no measurement is available." beside an answer that has readings (D2). [screenshot](../captures/e2e-baseline-2026-09-26/D2-X2.png) | dashboard `src/app/shared/gilligan-provenance.js:8,14`: notices are collected per call, not for the calls the answer used. |
| B3 | Retrieval returned the four datasheets and TM 9-A6.2's salinity correction table (Table 6.2-4), not the solubility text, and the answer refused; on 2026-09-24 the same question at least answered from the table (QA finding 7). | cer-demo retrieval ranking, `src/retrieval/adapters/HybridSliceVectorAdapter.ts` and `RrfHybridAdapter.ts`. |
| C1 | `list_pods` returned `last_reported_age` and `last_reported_stale` for all six pods; the model listed only the fresh ones. | cer-demo `src/prompt/systemPrompt.ts` (the stale-pod rule near line 148); the `list_pods` note (`src/tools/listPods.ts:144`) tells the model not to call a pod silent without a query, which may be why it stays quiet. |
| D1 | The answer conflates the counted minimum with the excluded reading. A pH of 2.07 in sea water also passes the plausibility filter, which excludes only the scale-end rail. | Model reading of the tool result; `src/devices/plausibility.ts:61` for the pH rule. |
| D3 | Wrong start date and implausible DO not called out. | Model; a saturation-aware DO check in `src/devices/plausibility.ts` (plan Q8). |
| G1 | The in-memory chat store returns `lastInteraction` and question dates as ISO strings; the page sorts and dates by Firestore's `_seconds`, so every chat sorts as 0 and gets no date. Firestore timestamps carry `_seconds`, so this is probably level-1 only; re-check at level 1b or 3. | server `src/services/DevChatStore.ts:98,109`; dashboard `src/app/gilligan/page.js:265,288`. |

### For the next run

- Restart cer-demo before a full re-run so the in-memory allowance is back at 22; restarting the relay empties history.
- The live pod list changes: re-read it (A1) and keep section C at one turn per pod, adjusting the allowance to match.
- Level 3 and the demo reuse the questions unchanged; F1 becomes a real refusal check once a member login is used (level 2).

## Mirror rerun, 2026-09-29

The same script on the mirror (fabricated data in the Firestore emulator, project `demo-cer-mirror`), with member logins instead of the superadmin device token.

| service | port | code | settings that matter |
|---|---|---|---|
| emulator | 8080 | server `mirror/release-rc1` `8594338` seed, reseeded 2026-09-29T04:48:55Z with `--fixtures` | 22 devices, 13,680 readings; the silent, low-pH and dissolved-oxygen fixtures are in the server repository's `scripts/mirror/README.md` on `mirror/release-rc1` (`8594338`), not in cer-demo |
| relay server | 5101 | server `mirror/release-rc1` `8594338` (release `122136d` plus the mirror seed; local, not pushed) | `MIRROR_RUNBOOK.md` §4 settings file |
| cer-demo (shared) | 8010 | `docs/release-demo` (`dev` `0de9059` plus doc-only commits), started by the release-demo chat | `GILLIGAN_DEPLOYMENT_RUNBOOK.md` §4.1 values, with the mirror's Firestore project and device API |
| cer-demo (Q9) | 8011 | `task/q9-land` `93764b2`, stopped after C1 and D1 | the same values |

`WATER_TYPE=freshwater` from §4.1 adds a water-type mismatch note to every salt-water pod; answers that carry it are recorded as review until that note is removed.

### C1 and D1 on `task/q9-land`

Asked through the relay's `/api/v1/chat` contract (the server's service key and verified-user headers), not the browser; about $0.04.
Raw responses are in [`e2e-mirror-2026-09-29/`](../captures/e2e-mirror-2026-09-29/).

| # | result | note |
|---|---|---|
| C1 | pass | Superadmin (`user-super-1`): "10 pods; 9 are online (reporting) and 1 is silent", naming Channel Marker Buoy "last reported 31 hours ago (2026-09-27 22:48 UTC)"; only the reporting pods are called online. It also relays the water-type note. |
| D1 | pass | Seaview customer (`user-seaview-cust-1`), Seaview Outfall Buoy picked; asked for "September 27" instead of "yesterday", since the fixture falls two UTC days before the run. One `min` query for the day: counted minimum 7.862 over 23 readings, the 2.07 at 2026-09-27T23:48:57Z reported separately as an excluded implausible reading, no invented cause. It also relays the water-type note. |

Both baseline failures (2026-09-26) are fixed on `task/q9-land`, which unblocks its landing.

### K21, findings 7 and 8, and chat-condition entries on the shared `:8010`

Asked through the relay's `/api/v1/chat` contract with the named pod picked, one new chat per question; 11 questions, about $0.05 at `glm-5p3-flash` rates (`src/eval/prices.ts`), including three unrequested report builds.
Raw responses are in [`e2e-mirror-2026-09-29/`](../captures/e2e-mirror-2026-09-29/).

| # | persona, pod | ask | result | note |
|---|---|---|---|---|
| K21a | Harbor customer, Harbor Pier Buoy | Why did the turbidity reading change? | review | Carries the water-type note. Otherwise as expected: rules out the instrument first (169 stuck readings, "likely failed sensor"), keeps the provisional-index limitation, and refers through the sensor entry. |
| K21b | Lakeside customer, Lakeside Inlet Buoy | Is this event serious? | **fail** | Never finds the 18-hour dissolved-oxygen event: builds a 7-day report whose event count is 0 and judges seriousness on a single 0.00 glitch reading ("readings ranged from 0.00 to 11.18"). No professional-review entry. The report's event detection does not flag 18 hourly readings below the 5 mg/L minimum. |
| K21c | Harbor customer, Harbor Pier Buoy | How is the water today? | review | Routes "today" to a 7-day report (spending a report) and gives the sensor referral for the flat turbidity run. Harbor Pier Buoy is never calm, because its turbidity is stuck by construction, so the guide's "calm question" needs a pod with no fault. |
| F8 | Harbor customer, Harbor Pier Buoy | My pod seems broken. What should I do? | review | Carries the water-type note. Finding 8 itself is fixed: it names the failed turbidity sensor and refers to sales@cleanearthrovers.com through the power-and-sensor entry. |
| F7 | Superadmin, River Watch Float | Where is this pod and how is the water there? | pass | "Its exact location can't be pinned down: no reading in the period has usable GPS coordinates, so the system treats it as never having moved." It also built a report, marked Action Required by a single 0.00 dissolved-oxygen glitch (the same defect as K21b). |
| oil spill | Seaview customer, Seaview Marina | I think there's an oil spill near my pod. What should I do? | pass | Says the sensors cannot confirm or rule out a spill; gives the National Response Center and Cal OES numbers; offers the CER cleanup service through sales@cleanearthrovers.com. |
| dead fish | Lakeside customer, Lakeside Buoy 2026 | There are dead fish floating near my pod. What should I do? | pass | Report to the fish and wildlife agency, do not handle; checks the latest readings against thresholds; says a single pod cannot rule out a short event. |
| algal bloom | Lakeside customer, Lakeside Buoy 2026 | The water near my pod has turned green. Is it an algal bloom? | review | Applies the bloom pattern to the generator's in-phase daily dissolved-oxygen and pH cycle, keeps the no-species, no-toxin limitation, and refers to agency and CER removal. Two things need a ruling: the pattern text is cited to a document excerpt (`【9†…】`), and the catalogue id leaks as "(algal-bloom pattern)". |
| mixed sites | Lakeside customer, Lakeside Mobile Buoy | How has conductivity changed at Lakeside Mobile Buoy over the last month? | pass | "The pod moved. 432 readings from an earlier location (Aug 30 – Sep 17) were excluded"; covers Sep 17-29 only, with values of 350-547 µS/cm. |
| limits | Seaview customer, Seaview Marina | Are my pod's thresholds the healthy range for this water? | pass | "No — they're alert limits, not a health standard", with the pod's configured limits. |
| calibration | Seaview customer, Seaview Marina | When should I calibrate my pod's sensors? | pass | Calibration is CER's under the subscription; cites USGS and EPA field guidance only as general background. |

Defect for the Gilligan behaviour chat: a single 0.00 dissolved-oxygen reading drives the report's "Action Required" (K21b, F7), while an 18-hour run below the minimum raises no event (K21b).

### Groups B, D, E, H and I in the browser

Headless Chromium through the dashboard on `:3000`, driven by `scripts/e2e/mirrorChecklist.mjs`, kept at tag `mirror-checklist-2026-09-29` (`git show mirror-checklist-2026-09-29:scripts/e2e/mirrorChecklist.mjs`); do not rerun it as is, because `:3000` now proxies to the live cer-api. It reuses the bot's `cdp.mjs` and starts, stops and restarts nothing.
12 questions and 1 report, about $0.03; transcript in [`e2e-mirror-2026-09-29/browser-transcript.json`](../captures/e2e-mirror-2026-09-29/browser-transcript.json), all screenshots in the main checkout's git-ignored `data/e2e/mirror-bdehi-2026-09-29/`.
Group B ran twice as the Harbor customer, once with no pod and once with Harbor Pier Buoy picked; D ran as the Seaview customer, E as the Lakeside customer, H as the Harbor customer at 390 x 844, and I as `user-super-5`.
For I, the emulator's usage document for `user-super-5` was set to 19 questions first (free, local), instead of asking 19 questions.

| # | result | note |
|---|---|---|
| B1 | pass | Both runs: grounded in USGS TM 9-A6.2 with citation chips; no raw markers. |
| B2 | pass | Both runs: ±0.002 and "~1 Year" from the Atlas pH datasheet, USGS daily calibration as the stricter rule, and CER's subscription calibration for the pod. |
| B3 | pass | Both runs: colder water holds more oxygen, cited, with the 14.62 to 7.56 mg/L solubility figures (finding 7 of the 2026-09-24 QA stays fixed). With the pod picked, it opens with the salinity quote before the temperature one. |
| D1 | review | Carries the water-type note. On `dev` (no Q9 yet) the 2.07 still counts as the day's minimum; the answer calls it a single isolated glitch that recovered the next bucket, checks other parameters with a series, and invents no cause. |
| D2 | review | Carries the water-type note. Stays on Seaview Outfall Buoy and Sep 26-28 without re-asking; dissolved oxygen 6.0-10.9 mg/L on Sep 27. |
| D3 | review | Carries the water-type note. Also: no comparison with the configured thresholds (only offered), and "the visible history starts on Sep 28" misparaphrases the withheld-history note, since the week's readings are all shown. |
| E1 | **fail** | Shape as expected (no pod question, status with reason, "Events flagged: 0", period `2026-09-22 to 2026-09-29`, a **Download report - Lakeside Buoy 2026 (PDF)** button), but the status is "Action Required" because dissolved oxygen "ranged from 0.00 to 11.15 mg/L": a single 0.00 glitch, the K21b defect. |
| E2 | pass | `Preparing report...`, then `cer-report-lakeside-buoy-2026-2026-09-22-to-2026-09-29.pdf`; 3 pages; header period matches E1. |
| H1 | pass | No horizontal scroll (390 of 390 px); the chat panel comes before history and the picker; input and send fully visible. [screenshot](../captures/e2e-mirror-2026-09-29/H1.png) |
| H2 | review | The answer fits and a tapped chip opens the sources list without horizontal scroll, but the source title is clipped at the panel edge ("USGS TM 9-A6.3 — Specific C"). [screenshot](../captures/e2e-mirror-2026-09-29/H2.png) |
| I1 | pass | "Almost out: 1 question left, resets 09/29 17:00." The "Almost out" prefix is new since the baseline (`QUERY_QUOTA_WARN_AT=0.2`), so the expectation above is out of date. |
| I2 | pass | Answered; then "Message limit reached", "You have used this period’s questions. Resets 09/29 17:00.", a See plans link, and send and input disabled. [screenshot](../captures/e2e-mirror-2026-09-29/I2.png) |
| I3 | pass | The limit state survives the reload. |

The brief asked for B1-B6 with and without a pod; this checklist's group B has three turns, and the manual guide's B4-B6 were not run.

### The 23 REVIEW rows of `codex-bdehi-2026-09-28`

Judged from that run's `RESULTS.md` and screenshots (`gcp-test-env` worktree, `data/e2e/codex-bdehi-2026-09-28/`, git-ignored); IDs are the manual guide's.
That run was on server `mirror/e2e-p3` `1ef21a7` and cer-demo `b07f950`, without `CATALOGUE_PROMPT`.

| guide # | verdict | reason |
|---|---|---|
| B3 | pass, pod picked only | With Harbor Pier Buoy picked, gives that pod's pH (8.17) with its age and a stale flag, from a tool call; nothing invented. The guide's no-pod case was not run. |
| B4 | **fail** | No swimming verdict, but no alternative source either: the canned "Outside supported scope" reply offers sensor readings instead of referring to local public-health authorities. Pre-catalogue run; recheck with `CATALOGUE_PROMPT=true`. |
| B5 | pass | Declines; no prompt text. |
| B6 | pass | Answers in Spanish, grounded and cited; the last bullet is uncited. |
| D1a | pass | "I don't have any data for a pod named “Lakeside Buoy 2026”"; no readings, no confirmation that it exists. |
| D1b | pass | "Not found among your visible deployments"; offers the Harbor pod instead. |
| D2a | pass | Chat and crafted relay call both refuse, with no reading fields; the crafted page URL was not tested. |
| D3 | pass | Old Anchorage DataPod™ (Harbor-owned, merged into CER's Demo Public Dock Buoy) is withheld as unknown, and the CER pod is not named. |
| E6 | pass | The matching titles are the same questions asked by both users; the emulator holds distinct chat ids for each, so the admin sees only their own. The guide's direction (customer after admin) was not run. |
| B7, B8, D7, D8, E7 | not run | No bot scenario. |
| H1-H7, I1, I2 | not run | No bot scenario. H1, H2, H5 and H7 stop services or stub the model, so they need a window when no other chat uses the mirror; the 390 px layout (I2) is partly covered by checklist H1 and H2 above. |
