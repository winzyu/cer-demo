# Gilligan release goal, task hierarchy and timeline

Draft, 2026-09-18, for the user's review; nothing here is approved until the user accepts §1.
It narrows the roadmap in [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md) §4 into outcomes that can be checked against what the chatbot actually says.
Existing packets keep their IDs (R1, W5, W6, W9, W11, D01-D16) so each task links back to its detailed specification.
Questions whose answers change a task are in [`SUPERVISOR_QUESTIONS_FINAL.md`](SUPERVISOR_QUESTIONS_FINAL.md), cited here as "SQ A1" and so on.

## 1. Final goal (for review)

On September 30, 2026, a signed-in member of a customer organization can open Gilligan in the CER dashboard, choose one of their organization's pods, and hold a conversation in which every answer is one of the following:

1. **A data answer** that is correct against that pod's readings for the stated time window.
2. **An education answer** grounded in cited corpus documents or supervisor-approved guidance.
3. **A clarifying question** when the request is ambiguous, after which the conversation continues with the answer to it.
4. **An honest limitation**: what Gilligan cannot answer or measure, and why.
5. **A single-pod PDF report** that downloads immediately.

No answer ever uses another organization's data, and every answer respects the usage limits.
The service runs in CER's GCP project, and hiding the page is a tested rollback.

Explicitly not part of the goal: streaming, phone layout, multi-pod reports, quantitative turbidity, automatic chat titles, daily and tidal pattern detection, and broad general water-quality education.

## 2. Outcomes

Each outcome is a property of the chatbot's output, with a check that proves it.
Numbers marked "proposed" are ours to confirm at review.

| ID | Outcome | Proven when |
|---|---|---|
| O1 | Data answers are correct and scoped | On a predeclared set of 20 sensor questions (proposed) across two test organizations, every answer names the pod and window, every number matches the device API for that window, no reading is invented, missing data is called missing, and turbidity is given only as a clarity band or relative value. |
| O2 | Education answers are grounded | Phase 3 recapture passes Tier 1; correctness reaches 1.30/2 and ungrounded claims at most 2%, or each question class that misses is caveated or refused (D3, SQ A6); no unapproved guidance entry ever appears. |
| O3 | Conversation holds together | All 12 W11 cases plus the Algalita case (O3.1) pass on the direct, relay and browser paths. |
| O4 | Reports work end to end | From the dashboard, a 30-day report for a test pod downloads as a PDF in the supervisor's template structure; threshold crossings match the data; causes and actions come only from approved entries; the data scope, including withheld merged history, is stated; pods without usable thresholds read "Not assessed". |
| O5 | No cross-organization access | With two test organizations, zero of a predeclared set of cross-organization attempts succeed (by pod name, by label, through merged history, through a report); unauthenticated calls to the service are rejected. |
| O6 | The dashboard page is usable | Each required feature in SQ A7 is demonstrated in a browser; Gemini-era chats are not shown; the usage-limit message appears when the limit is reached. |
| O7 | It runs in production | The service is deployed in CER's project and healthy, the corpus is seeded, usage limits are enforced from Firestore, the runbook is handed over, hiding the page has been rehearsed, and one pod per test organization passes a production smoke test on September 30. |

O5 is the only outcome that blocks release on its own (SQ A6); the others fall back to caveats, refusals or cut features.

## 3. Release checklist (the September 28 demo)

1. O3: the Algalita conversation and the 12 W11 cases, live in the dashboard.
2. O1: five sensor questions on each test organization's pod, checked against the device API.
3. O4: one report downloaded and opened.
4. O5: the cross-organization attempts, each refused.
5. O2: the Phase 3 result and the list of caveated or refused classes.
6. O6: the required features, one by one.
7. O7: the staging service, the runbook and the rollback rehearsal.

## 4. Task hierarchy

Owners: **U** the user, **C** Claude in this repository, **S** the supervisor, **M** the backend owner (Michael).
Upstream code is written by the user in the WSL sandbox (decision D1); Claude writes this service and the specifications.
Paid runs and live reads need approval each time.

### O0 Foundation (enables everything)

| ID | Task | Owner | Needs | Window | Done when |
|---|---|---|---|---|---|
| O0.1 | Send `SUPERVISOR_QUESTIONS_FINAL.md` | U | review of this plan | Sep 18 | sent |
| O0.2 | Record answers in `STAKEHOLDER_QUESTIONS.md` and `timeline.md`, then adjust this plan | C | O0.1 answers | Sep 21 | every SQ item has an answer or its default |
| O0.3 | Commit the current doc changes | C, U approves | `git-plan` | Sep 18 | working tree clean |
| O0.4 | Pick one sandbox and one running stack; bring its cer-demo copy up to this repository's HEAD | U | none | Sep 19 | ports 3000, 5001 and 8000 all serve from one documented set of checkouts |
| O0.5 | Local routing: Gilligan through the relay, pod and device pages through the live API with the user's token (W9, D10) | U, C specifies | O0.4 | Sep 19-22 | the dashboard shows real pods and Gilligan answers in the same session |
| O0.6 | Create the test organizations and users | U | SQ B1 | Sep 21-22 | two organizations, one pod and one user each, credentials stored outside the repository |

### O1 Data answers are correct and scoped

| ID | Task | Owner | Needs | Window | Done when |
|---|---|---|---|---|---|
| O1.1 | Relay sends the selected pod as `device` | U | W5 | Sep 19-20 | a question with a pod selected reaches cer-demo with `device` set |
| O1.2 | Write the 20 sensor questions and their expected values | C | O0.6, SQ B9 live reads | Sep 22 | question file with the device API values they should match |
| O1.3 | Zero-turbidity handling: diagnose (D11), then say "possibly missing" for runs of exact zeros | C | SQ E5 | Sep 22-24 | a pod window with zeros is answered as possibly missing, not clear water |
| O1.4 | State limits the data cannot support: no daily or tidal pattern detection, relative turbidity, configured thresholds wording | C | SQ C5, E2 | Sep 23 | each limitation appears in the answers that need it |
| O1.5 | Run O1.2 on both test organizations and fix what fails | C | O1.1-O1.4, R1 | Sep 25-27 | O1 check passes |

### O2 Education answers are grounded

| ID | Task | Owner | Needs | Window | Done when |
|---|---|---|---|---|---|
| O2.1 | Phase 1d fixture review; update `_EXIT_CRITERIA.md` to 45/90 and 3 precedence fixtures | U | none | Sep 19-21 | fixtures frozen |
| O2.2 | Refusal contract: refuse only the unsupported part, allow clarification and small talk | C | SQ A5 | Sep 21-22 | prompt, rubrics and tests agree; W11 B07 and B11 pass directly |
| O2.3 | Catalogue intake: apply approved entries, referrals and fallback policy (D13, D14) | C | SQ C1-C4 | Sep 22-24 | `catalogue.json` version bumped, review page regenerated, unapproved entries hidden |
| O2.4 | Phase 3 recapture with the release prompt (decide first whether it runs with `CATALOGUE_PROMPT` on; if so, the eval runners' grounding prompt changes with it) | C | O2.1, O2.2, approved spend | Sep 23-24 | judged run recorded in `EVAL_REBUILD.md` |
| O2.5 | Fix, caveat or refuse each class that misses | C | O2.4 | Sep 24-27 | every class passes, carries a caveat, or is refused, and the list is written down |

### O3 Conversation holds together

| ID | Task | Owner | Needs | Window | Done when |
|---|---|---|---|---|---|
| O3.1 | Add the Algalita case to W11: "Summarize last week's turbidity" → "Which pod?" → "Algalita" → summary for Algalita Pod | C | none | Sep 19 | case B13 in `BASIC_CONVERSATION_PACKET.md` |
| O3.2 | Relay maps saved chat history into cer-demo's `history` field (W9, D03) | U | none | Sep 19-20 | the Algalita case keeps its context through the relay |
| O3.3 | W11 run preparation (D04) | C | none | Sep 21 | run plan with a dollar cap |
| O3.4 | W11 on the direct path (D07) | C | O2.2, O3.3, approved spend | Sep 22 | 13/13 or failures assigned |
| O3.5 | W11 through the relay and browser | C, U | O3.2, O0.5 | Sep 25 | 13/13 on all paths |

### O4 Reports work end to end

| ID | Task | Owner | Needs | Window | Done when |
|---|---|---|---|---|---|
| O4.1 | R1: return the report PDF in the response, nothing on disk | C | none | Sep 18-22 | contract test downloads the bytes |
| O4.2 | Relay report route and page download button (W5, W6) | U | O4.1 | Sep 23-24 | a report downloads from the dashboard |
| O4.3 | Apply the operator's threshold answers; pods without usable thresholds stay "Not assessed" | C | SQ D1, D2 | Sep 22-24 | reports match the confirmed limits |
| O4.4 | Disclose data scope, including withheld merged history | C | SQ D3, D4 | Sep 23-24 | the PDF states which pod labels and dates it covers and what it withheld |
| O4.5 | Check a report against the supervisor's template and the raw data | C | O4.1-O4.4 | Sep 25 | O4 check passes |

### O5 No cross-organization access

| ID | Task | Owner | Needs | Window | Done when |
|---|---|---|---|---|---|
| O5.1 | R1 identity check: verify the Google-signed ID token (D7) and pass the verified user | C | none | Sep 18-22 | unauthenticated and wrong-audience calls get 401 in tests |
| O5.2 | Merged-history policy in the sensor tool and reports | C | SQ D3 | Sep 22-23 | cross-organization predecessors are withheld and disclosed, per the answer |
| O5.3 | `/water/period` organization check and zero-device fix upstream | U or M | SQ B7 | Sep 22-25 | in the server pull request or merged by Michael |
| O5.4 | Predeclare and run the cross-organization attempts (D12 subset) | C, U | O0.6, O5.1, O5.2 | Sep 24-26 | zero succeed |

### O6 The dashboard page is usable

| ID | Task | Owner | Needs | Window | Done when |
|---|---|---|---|---|---|
| O6.1 | Page baseline and component inventory (D02, D06) | C | none | Sep 19-20 | before-state and component map written |
| O6.2 | Page specification (D09) | C | O6.1, SQ A7 | Sep 21-22 | spec covers every required feature and state |
| O6.3 | Keep the question visible while waiting, with a loading state | U | O6.2 | Sep 22-23 | the question shows immediately |
| O6.4 | Pod picker limited to the caller's pods | U | O6.2, O1.1 | Sep 22-23 | switching pods changes which pod answers use |
| O6.5 | Tables, citations and the AI notice (`remark-gfm`, citation chips, SQ A8) | U | O6.2, R1 citations | Sep 23-24 | a table and a citation render correctly |
| O6.6 | Usage-limit message, Gemini-era chats hidden, question box encoding (item 13) | U | R1 status endpoint | Sep 23-24 | each observed in the browser |

### O7 It runs in production

| ID | Task | Owner | Needs | Window | Done when |
|---|---|---|---|---|---|
| O7.1 | R1 remainder: history mapping, Firestore usage store, status endpoint, concurrency limiter, `audit` field | C | none | Sep 18-22 | contract tests green, the demo still works |
| O7.2 | Relay specification (D08) | C | O7.1 | Sep 22-23 | request, response, error and rollback mapping specified |
| O7.3 | Fireworks key, stored in Secret Manager; spending slice set for a budget in the tens of dollars per month | S or U | SQ B5 | Sep 22 | key available to the service account; daily cap configured |
| O7.4 | Staging deploy and corpus seed | U, C | SQ B2-B4, O7.1 | Sep 25 | staging service answers a question from the dashboard's staging path |
| O7.5 | Upstream pull requests: relay, page, security fix | U | SQ B6, O4.2, O6.3-O6.6, O5.3 | Sep 25 | pull requests open with the verification evidence attached |
| O7.6 | Runbook: deploy, seed, secrets, limits, costs, rollback | C | O7.4 | Sep 25-27 | handed to the owner named in SQ B10 |
| O7.7 | Demo, merge, production deploy, rollback rehearsal | U, S, M | everything above | Sep 28-29 | go decision; production answers behind the switch |
| O7.8 | Release smoke on one pod per test organization | U, C | O7.7 | Sep 30 | release |

## 5. Timeline

| Day | Critical path | Parallel |
|---|---|---|
| Fri Sep 18 | O0.1 send questions; O0.3 commit; R1 starts (O4.1, O5.1, O7.1) | O0.4 choose the stack |
| Sat Sep 19 - Sun Sep 20 | R1 continues; O3.2 and O1.1 relay history and pod | O2.1 fixture review; O3.1; O6.1; O0.5 |
| Mon Sep 21 | Supervisor answers due; O0.2 record them | O0.6 test users; O2.2; O3.3; O6.2 |
| Tue Sep 22 | R1 contract tests green; O3.4 W11 direct | O1.2; O2.3; O4.3; O5.2; O7.3 |
| Wed Sep 23 | O4.2 relay report route; O2.4 Phase 3 recapture | O6.3-O6.6; O1.4; O4.4; O7.2 |
| Thu Sep 24 | Catalogue approval deadline; O2.5 starts | O5.4 isolation tests; O1.3 |
| Fri Sep 25 | O7.4 staging deploy; O7.5 pull requests open | O3.5; O4.5; O7.6 |
| Sat Sep 26 - Sun Sep 27 | Buffer: fix, caveat or refuse; full checklist dry run | O1.5; O2.5 |
| Mon Sep 28 | O7.7 demo and go/no-go; merge and production deploy | corpus seeded in production |
| Tue Sep 29 | Production verification behind the switch; fixes only | rollback rehearsal |
| Wed Sep 30 | O7.8 smoke and release | monitoring |

Critical path: R1 → relay contract (O4.2, O7.2) → staging (O7.4) → pull requests (O7.5) → demo (O7.7).
Anything that slips past September 25 on that path eats the only buffer, the weekend of September 26-27.

## 6. Risks and decisions for the user now

1. **The user owns most of the upstream work** (O0.4-O0.6, O1.1, O3.2, O4.2, O6.3-O6.6, O5.3, O7.5) plus the fixture review.
   This is the tightest bottleneck; allowing Claude to write the sandbox upstream code under review would change decision D1 and relieve it.
2. **No test users means no proof of O5**, which is the one hard release gate (SQ B1).
3. **No Fireworks key or deploy permission by September 25** means no staging rehearsal (SQ B2, B5).
   The budget is tens of dollars per month at most; Fireworks documents no free tier, and without a payment method the account is reportedly limited to 10 requests per minute, so the limits in R1 must be tighter than `GILLIGAN_TARGET_ARCHITECTURE.md` §2c and Phase 3 token counts should re-size them.
4. **A late catalogue approval** means launching with threshold crossings only; the plan still ships.
5. **Turbidity vendor documents** stay out of the searchable corpus for the release, because re-ingesting voids the frozen retrieval labels; decide after the release (C8, D16).
6. **Cut first if time runs short:** O6.5 citations styling beyond basic rendering, O1.3 beyond the "possibly missing" wording, O4.4 beyond a one-line scope statement.
   Never cut O5.
