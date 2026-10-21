<!-- Sent to the supervisor on 2026-09-19 with docs/catalogue/review.html; no reply as of 2026-09-22 (deadline was Monday, September 21).
     This is the record of what was sent: do not edit the body. Record answers in ../STAKEHOLDER_QUESTIONS.md.
     Recovered 2026-09-22 from the old machine's lost commits (tag old-machine-recovery-2026-09-19). -->

Hi,

Before the September 30 Gilligan release we need your answers to the questions below.
Each one has our recommendation and what we will do if we don't hear back.
If you agree with everything, a reply of "accept all recommendations" is enough; just correct the ones you disagree with.

Please reply by **Monday, September 21**.
Anything later cuts into testing time.
The four marked **[Blocker]** stop the release if they go unanswered.

---

## A. Goal and scope

**A1. Do you agree with this release goal?**
"On September 30, a signed-in member of a customer organization can open Gilligan in the dashboard, pick one of their organization's pods, and have a conversation where every answer is either correct for that pod's readings, backed by cited documents or approved guidance, a clarifying question, or an honest 'I can't answer that'.
They can download a PDF report for one pod.
No answer ever uses another organization's data."
- Recommended: accept.
- If no answer: we build to this goal.

**A2. Who gives the final go/no-go, and when?**
- Recommended: you, at a demo on Monday, September 28, against our release checklist.
- If no answer: we demo on September 28; if there is no go by the end of September 29, we don't ship and the current page stays.

**A3. Who gets Gilligan on day one?**
Options: every customer organization, only organizations with a Gilligan subscription, or a named pilot list.
Note that City of Huntington Beach has six users but no active pod, so Gilligan would have nothing to show them.
- Recommended: organizations with a Gilligan subscription, plus CER staff.
- If no answer: organizations with a Gilligan subscription.

**A4. What usage limits should we launch with?**
Today a message is allowed if the user has sent fewer than 2 this week or their organization fewer than 10 this month, which is both too low to be useful and inconsistent.
- Recommended: 10 questions and 1 report per user per day, plus a monthly cost cap, so heavy use shows "limit reached for today" instead of running up a bill. CER test accounts are exempt.
- If no answer: the recommended limits.

**A5. Should Gilligan handle normal conversation?**
For example greetings, "make that shorter", or answering "Algalita" after Gilligan asks "which pod?".
Today it refuses anything that isn't a water-quality question, which breaks follow-ups.
- Recommended: yes, but it still won't state facts it can't back up.
- If no answer: yes.

**A6. How strict is the quality bar at launch?**
If some type of question is still answered poorly on September 27, we can add a caveat, block that type of question, or delay.
- Recommended: caveat or block, and never delay for quality alone. The exception is any leak of one organization's data to another, which always delays launch.
- If no answer: the recommendation.

**A7. Which dashboard features are required on September 30?**
Required: pod picker, question stays visible while waiting, formatted answers with tables, source citations, report download button, clear message when the usage limit is reached, saved chat history.
Later: automatic chat titles, answers that appear as they are written, phone layout, multi-pod reports.
- Recommended: accept this split.
- If no answer: this split.

**A8. What do we tell customers?**
Will anyone announce the new Gilligan, and should the page show a short notice that answers are AI-generated and turbidity is approximate?
- Recommended: a one-line notice on the page; the announcement is your call.
- If no answer: we add the notice and make no announcement.

---

## B. Permissions

We already have access to the Google Cloud project.
These questions are about what we are allowed to do with it.

**B1. [Blocker] May we create test users in production, and where?**
We need a user in each of two organizations, each with at least one pod, to prove that one organization can't see another's data.
CER itself no longer owns an active pod: the CER Conference Pod is archived (last reading June 25), and the other four active pods belong to customers.
A brand-new organization with no pods would also be exposed to the data-access hole in B7, so test organizations need a pod before any test user signs in.
Options: one test user inside each of two existing customer organizations, with their permission; or un-archive the CER Conference Pod into a test organization and pair it with one customer organization.
- Recommended: one test user each in City of Newport Beach and Cleveland Water Alliance, with their permission, removed after launch. No pods move, so billing and alerts are untouched.
- If no answer: we can't test data isolation, and that item on the release checklist stays unproven.

**B2. [Blocker] May we deploy Gilligan as a new service in the project?**
It would be a separate Cloud Run service (`cer-rag`) that only the existing dashboard server can call.
We'd like to deploy a practice copy by September 25 and the release copy on September 28.
The project also has an old QA setup (`cer-api-qa`, `cer-ui-qa` and a `qa-db` database), last deployed in November 2024.
May we use it for the practice copy, or is it abandoned?
- Recommended: yes to both deploys; practice copy in the QA setup if it is still usable, otherwise as a separate staging service.
- If no answer: we prepare everything but don't deploy.

**B3. May we add new Firestore collections in production?**
New collections only, for the document library and usage counters; we never write to existing ones.
- Recommended: yes.
- If no answer: we ask again before writing anything.

**B4. May we set up the permissions between services?**
The dashboard server needs permission to call Gilligan, and Gilligan needs permission to read its own data and its API key.
- Recommended: yes, or tell us who should do it.

**B5. [Blocker] Who sets up and pays for the Fireworks AI account?**
Fireworks runs the AI model.
We estimate $9-$37 per month for 50 users asking 3 questions on 20 days.
Without a payment method on file, the account is limited to 10 requests per minute.
- Recommended: CER creates the account with a payment method and a hard cap of $20 per month; we store the key securely.
- If no answer: we can't launch without a key. Without a payment method we launch with the lower limit and show a "busy" message when it's hit.

**B6. [Blocker] How do our changes get into the dashboard and server code?**
Options: we open pull requests, we send patches for Michael to apply, or we get push access to a branch.
Who deploys after merging, and by when do the changes need to be handed over?
- Recommended: we open pull requests by September 25, and Michael reviews, merges and deploys on September 28.

**B7. May we fix a data-access hole in the current server?**
One endpoint (`/water/period`) doesn't check that a pod belongs to the caller's organization, so any signed-in user can read any pod's readings by naming it.
An organization with no pods at all receives every organization's readings; no current user is in such an organization, but any newly created one would be.
This is still present in the server deployed on August 26.
The fix is a few lines, using the same check the neighbouring endpoints already use.
Gilligan avoids this hole either way; this affects the existing dashboard.
- Recommended: we include the fix, flagged separately, or Michael fixes it before September 28.
- If no answer: we report it to Michael.

**B8. Is the current Gilligan working?**
It uses a Google model that has been retired, so it probably fails on every question.
No Gilligan chat has been started since January 9, 2025.
This matters because our fallback plan was to switch back to it.
- Recommended: if the release has to be rolled back, we hide the Gilligan page instead.
- If no answer: the recommendation.

**B9. May we read live pod data during testing?**
Read-only, using the test users from B1 and our own accounts.
- Recommended: yes, from September 21 until release.
- If no answer: we ask before each test run, which slows testing.

**B10. Who looks after Gilligan after September 30?**
Someone needs to watch errors and costs, handle customer complaints about answers, and approve new guidance.
- Recommended: CER takes this on; we hand over a written guide on September 28.

---

## C. What advice Gilligan may give

The draft guidance entries are on the review page we sent on September 17.
Without answers here, Gilligan only reports readings and threshold crossings, with no possible causes or suggested actions.

**C1. Are the general water-quality ranges in the source-of-truth document for education only?**
- Recommended: yes; reports keep comparing readings against each pod's own alert limits.
- If no answer: education only.

**C2. Can the current turbidity sensors be exempted from the document's numeric turbidity content?**
The sensors can't support precise turbidity numbers.
- Recommended: yes; turbidity is described only as Clear, Moderate or Turbid.
- If no answer: yes.

**C3. Please approve, edit or reject each draft guidance entry, and settle the six concerns we raised about the document's worked examples.**
- Recommended: approve entries one by one; we launch with whatever is approved by September 24.
- If no answer: unapproved entries stay hidden.

**C4. Should Gilligan point customers to CER services, and how?**
Which contact to show (info@cleanearthrovers.com and/or the booking link), whether to mention the service area (Southern California and Ohio), and how to describe the four services (algal bloom cleanup, fish kill cleanup, debris capture, oil spill response).
- Recommended: email plus booking link, no service area.
- If no answer: no referrals shown.

**C5. Is "configured thresholds" the right wording?**
Gilligan calls a pod's alert limits "configured thresholds", not "normal ranges".
So a dissolved oxygen of 0.5 mg/L, which is dangerous for fish, can be "within configured thresholds" if the limits are set wide.
- Recommended: keep the wording, and add a warning line when a reading is inside the pod's limits but outside the general healthy range.
- If no answer: keep the wording with no warning line.

---

## D. Pods and alert limits

**D1. Are the current alert limits the ones reports should use?**
Several are set so wide they can never trigger: Old Woman Creek 2026 (pH 0-10, dissolved oxygen 0-12, conductivity 0-100,000 µS/cm), Balboa Yacht Basin Buoy (dissolved oxygen 3-27), and the conductivity ceiling of 75,000 µS/cm on Marina Park, PCH Public Dock Buoy, Algalita Pod and Balboa.
- Recommended: the operator tightens them before September 28, or confirms they're intended.
- If no answer: we use them as they are, and reports say which events can't be detected.

**D2. Does the retired "CWA Old" pod belong to Cleveland Water Alliance?**
Its readings are merged into Old Woman Creek 2026, but it points to an organization that doesn't exist.
It is probably Cleveland Water Alliance's earlier pod.
- Recommended: confirm, and fix its organization so its readings can be included.
- If no answer: we leave its readings out of Old Woman Creek 2026.

**D3. When a pod moves, should reports only cover its current site?**
Pods get reused at different sites, and nothing records when they move.
For example, most of Old Woman Creek 2026's history was recorded in North Carolina and Utah, not Ohio.
- Recommended: yes; we detect moves from GPS and report only the current site.
- If no answer: reports include all the pod's readings and say they may span several sites.

**D4. Which pods and organizations should we test with?**
- Recommended: the two customer organizations from B1, with their permission.

---

## E. Turbidity

**Background.**
The pods don't measure turbidity directly.
They measure a voltage from a light sensor, and the server converts it to a number labelled "NTU" with the formula you gave us, `NTU = (3.35 - V) × 300`.
In the server code, 3.35 V is the measured clear-water voltage and 300 NTU per volt is marked as a provisional slope for the Keyestudio sensor, so the result is a relative index rather than calibrated NTU.
NTU is a standard unit that implies a calibrated instrument, so the number looks more precise than it is.
Because of this, we have already decided:
- At launch, turbidity is described only as Clear, Moderate or Turbid, using the operator's cut-offs (Clear above 2.2 V, Moderate 0.7-2.2 V, Turbid below 0.7 V).
- Gilligan never compares turbidity to published ranges, and pods have no turbidity alert limits.

None of these questions block the release, but each changes what Gilligan may say later.

**E1. Which pods have the Turner Turbidity Plus sensor and which have the Keyestudio KS0414? And what model is the temperature probe?**
The Turner sensor could support real numbers; the Keyestudio is qualitative only.
Nothing in the pod records says which is fitted, and the readings don't reveal it.
The server applies the Keyestudio formula to every pod.
Temperature is the only sensor we have no documentation for.
- If no answer: all pods are treated as Keyestudio.

**E2. Has the 300 NTU-per-volt slope been checked against a reference since July?**
The server code marks it as provisional until a known reference reading is available, and the dashboard labels turbidity "Relative".
If it has been checked, Gilligan could quote turbidity values; if not, it keeps using the three bands only.
The formula was written for the Keyestudio sensor, so Turner pods (E1) may need a different conversion.
- If no answer: Gilligan calls it "relative turbidity" and never quotes it against official NTU ranges.

**E3. Which band edges are correct: 345/795 NTU or 350/800 NTU?**
The operator's voltage cut-offs convert to 345/795, but the dashboard dials use 350/800, so a reading of 347 is "Moderate" in a Gilligan report and "Clear" on the dial.
- Recommended: one set everywhere; 350/800 if the rounding was deliberate.
- If no answer: reports use 345/795 and differ slightly from the dials.

**E4. Is 0-25 NTU the Turner sensor's range?**
This only matters once E1 tells us which pods carry a Turner sensor.
- If no answer: we don't use it.

**E5. Can a missing or offline turbidity reading be sent as empty instead of 0?**
The server turns a missing or offline reading into 0, which also means perfectly clear water, so "no data" looks like "very clean".
- Recommended: a small server change so missing readings arrive empty.
- If no answer: a single 0 is treated as a real reading, but Gilligan flags long runs of exact zeros as "possibly missing".

**E6. Can the pod records store which sensor model each pod has?**
This would answer E1 permanently, including for pods added later.
- Recommended: yes, after the release.

---

## F. Data policy

**F1. How long are Gilligan chats kept, and who may read them?**
Each saved answer will also record which sources it used.
- Recommended: keep for 12 months; readable by the user and by CER admins for support.
- If no answer: kept indefinitely and readable by the user only, as today.

**F2. Is Fireworks AI acceptable for handling customer data?**
Fireworks says it doesn't log or store prompts or answers unless the account opts in, but it doesn't mention a data processing agreement.
- Recommended: acceptable for launch.
- If no answer: we go ahead with Fireworks.

---

Thanks!
