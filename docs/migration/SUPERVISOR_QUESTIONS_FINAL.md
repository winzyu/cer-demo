# Final questions for the supervisor before the September 30 Gilligan release

Draft, 2026-09-18, for the user's review before sending.
This may be the last round of questions, so every item carries a recommended answer and the default we will follow if it goes unanswered.
A reply of "accept all recommendations" plus corrections to specific items is enough for us to proceed.
The goal these questions serve is defined in [`RELEASE_GOAL_AND_PLAN.md`](RELEASE_GOAL_AND_PLAN.md) §1; section A below asks the supervisor to confirm it.
Items already open in [`../STAKEHOLDER_QUESTIONS.md`](../STAKEHOLDER_QUESTIONS.md) keep their numbers in brackets so answers can be recorded there.
The "Ref" lines are for us and can be deleted before sending.

Answers needed by **Monday, September 21**, except where marked; anything later compresses testing.

---

## A. Release goal, scope and sign-off

**A1. Do you agree with this release goal?**
"On September 30, a signed-in member of a customer organization can open Gilligan in the dashboard, choose one of their organization's pods, and hold a conversation in which every answer is either correct against that pod's readings, grounded in cited documents or approved guidance, a clarifying question, or an honest statement of what Gilligan cannot answer; they can download a single-pod PDF report; and no answer ever uses another organization's data."
Recommended: accept.
Default: we build to this goal.
Ref: `RELEASE_GOAL_AND_PLAN.md` §1.

**A2. Who gives the final go/no-go, and when is the demo?**
Recommended: you, at a demo on Monday, September 28, against the release checklist in `RELEASE_GOAL_AND_PLAN.md` §3.
Default: demo on September 28; if no go by the end of September 29, we ship nothing and keep the current page.

**A3. Who gets Gilligan on day one?**
Options: every member of every customer organization; only organizations with a Gilligan subscription (the dashboard already shows one on the plans page); or a named pilot list.
Recommended: organizations with a Gilligan subscription, plus CER staff.
Default: organizations with a Gilligan subscription.

**A4. Usage limits at launch.**
Upstream currently allows 2 messages per user per week.
Recommended: 10 questions and 1 report per user per day, a token ceiling per organization per month, and a daily spending slice of a monthly budget in the tens of dollars (B5), so heavy use produces "limit reached for today" rather than a bill; CER test accounts exempt, staff not.
Default: the recommended numbers.
Ref: `GILLIGAN_TARGET_ARCHITECTURE.md` §2c.

**A5. Should Gilligan handle ordinary conversation?**
Greetings, "thanks", "make that shorter", and follow-ups such as answering "Algalita" after Gilligan asks "which pod?".
Today it refuses anything that is not a water-quality question, which breaks follow-ups.
Recommended: yes; converse naturally and ask clarifying questions, but still refuse to state facts it cannot ground.
Default: yes.
Ref: `BASIC_CONVERSATION_PACKET.md`.

**A6. How strict is the launch quality bar?**
Where a class of question is still weak on September 27, we can add a caveat, refuse that class, or delay.
Recommended: caveat or refuse; never delay for quality alone, but always delay for any data leak between organizations.
Default: the recommendation (already decided as D3; please confirm the leak exception).

**A7. Which dashboard features are required on September 30?**
Proposed required: pod picker; the question stays visible while waiting; formatted answers including tables; source citations; report download button; a clear message when the usage limit is reached; saved chat history.
Proposed later: automatic chat titles, streaming answers, phone layout, multi-pod reports.
Recommended: accept the split.
Default: the split above.

**A8. What customers are told.**
Does anyone announce the new Gilligan, and should the page show a short notice that answers are AI-generated and that turbidity is indicative only?
Recommended: a one-line notice on the page; announcement is yours.
Default: we add the notice and make no announcement.

---

## B. Permissions and environment

We already have access to the GCP project.
These questions ask what we are allowed to do with it.

**B1. May we create test users and test organizations in production?**
We need at least two organizations with one pod each to prove that one organization cannot see another's data, plus one user in each.
Options: create two test organizations and assign CER-owned pods to them; or create test users inside two existing organizations.
Please name the pods we may use and whether moving a pod into a test organization is acceptable.
Recommended: two test organizations using CER-owned pods (for example the CER Conference Pod and PCH Public Dock Buoy), removed after launch.
Default: none; without this we cannot test data isolation, and the release checklist item for it stays unproven.
Ref: `POD_AUTHORIZATION.md` §9, Q3; [item 5].

**B2. May we deploy a new Cloud Run service for Gilligan in the project?**
Name `cer-rag`, same region as `cer-api`, its own service account, callable only by `cer-api`.
We would like to deploy a staging copy by September 25 to rehearse, then the release copy on September 28.
Recommended: yes to both.
Default: we prepare everything but do not deploy until told.

**B3. May we add Firestore collections in production?**
New collections only, never writing to existing ones: the document corpus (`corpus_chunks` or similar) and usage counters.
Recommended: yes.
Default: we ask again before writing.
Ref: `CORPUS_SEEDING.md`.

**B4. May we grant IAM roles?**
Specifically: `cer-api`'s service account may invoke `cer-rag`; `cer-rag`'s service account may read and write its own Firestore collections and read its secrets.
Recommended: yes, or name who does it.

**B5. Fireworks account and key.**
Who creates the Fireworks account, who pays, and what monthly spending cap should it have?
Is a payment method on file (accounts without one are reported to be limited to 10 requests per minute)?
Our budget is tens of dollars per month at most; the estimate for 50 users asking 3 questions on 20 days is $9-$37 per month.
Fireworks documents no free tier for `gpt-oss-120b`; if CER wants to start without a payment method, please confirm that a 10-requests-per-minute limit is acceptable at launch.
Recommended: CER creates the account with a payment method and a hard cap of $20 per month, enforced by our daily spending slice (about $0.65 per day), and we store the key in Secret Manager.
Default: we cannot deploy without a key; with no payment method we launch with the lower rate limit and tell users when Gilligan is busy.

**B6. How do our upstream changes get into `clean-earth-rovers-server` and `user-dashboard`?**
Options: we open pull requests; we send a patch series that Michael applies; or we are given push access to a branch.
Who deploys the server and dashboard after merging, and by what date must the changes be handed over?
Recommended: we open pull requests by September 25; Michael reviews, merges and deploys on September 28.

**B7. May we fix the data-access hole in `/water/period`?**
The endpoint does not check that a requested pod belongs to the caller's organization, and an organization with no pods receives every organization's readings.
It is a few lines, the same check its sibling endpoints already use.
Recommended: we include the fix in our server pull request, flagged separately, or Michael fixes it before September 28.
Default: we raise it with Michael; Gilligan never passes an unauthorized pod to it either way.
Ref: `SECURITY_FINDINGS.md` §1, §5; `POD_AUTHORIZATION.md` P2 items 11-12.

**B8. Is the current production Gilligan working?**
Its code calls `gemini-pro`, a retired Google model, so it probably fails on every question.
This matters because our rollback plan was to switch back to it.
Recommended: rollback means hiding the Gilligan page, not returning to the old model.
Default: the recommendation.

**B9. May we make read-only calls to the production device API during testing?**
Using the test users from B1 and our own accounts; no writes.
Recommended: yes, from September 21 until release.
Default: we ask before each run.

**B10. Who owns Gilligan after September 30?**
Who monitors errors and costs, answers customer complaints about answers, and approves future guidance entries?
Recommended: CER owns operation; we hand over a runbook on September 28.

---

## C. Guidance content (catalogue)

These were first asked on September 17.
Review page: `docs/catalogue/review.html` (23 draft entries, catalogue `2026-09-17.1`).
Without these answers, reports and chat state threshold crossings and limitations only, with no possible causes or recommended actions.

**C1. [17] Are the generic fallback ranges in source-of-truth v2 for education only?**
Recommended: education only; reports keep comparing against each pod's configured thresholds.
Default: education only.

**C2. [18] Can the current turbidity hardware be exempted from v2's quantitative turbidity content?**
Recommended: yes; turbidity is described with the three clarity bands only.
Default: yes.

**C3. [19] Approve, edit or reject each draft entry, and settle the six concerns about v2's worked examples.**
Recommended: approve entries individually; we launch only with what is approved by September 24.
Default: unapproved entries stay hidden.

**C4. [20] CER referral contacts and wording.**
Which contact to show (info@cleanearthrovers.com and/or the booking link), whether to name the service area (Southern California and Ohio), and the wording for the four CER services (algal bloom cleanup, fish kill cleanup, debris capture, oil spill response).
Recommended: email plus booking link, no service area.
Default: no referrals shown.

**C5. [6] Is "configured thresholds" the right thing to tell users?**
Gilligan calls the pod's alert limits "configured thresholds", never "normal ranges", so a dissolved oxygen of 0.5 mg/L can be "within configured thresholds" while fish are in trouble.
Recommended: keep the wording, and add a line when a reading is inside the thresholds but outside the v2 education range.
Default: keep the wording with no extra line.

---

## D. Pods, thresholds and merged pods

**D1. [1] Are the current alert limits the ones reports should trigger on?**
Several limits sit at the edge of what the sensor can read, which switches off detection: Old Woman Creek 2026 (pH 0-10, DO 0-12), Balboa Yacht Basin Buoy (DO 3-27), and the 75,000 µS/cm conductivity ceiling on Marina Park, PCH Public Dock Buoy, Algalita Pod and Balboa.
Recommended: the operator tightens them before September 28, or confirms they are intended.
Default: we use them as they are and the report says which events cannot be detected.

**D2. [2] Should the pods with unusable thresholds be configured?**
Trinidad Island DataPod™ and `dev:860322068098448` (all zeros), CER Conference Pod (placeholder 100s) and two pods with none.
Default: reports for those pods say "Not assessed".

**D3. Does access to a merged pod include the history of the pods it absorbed?**
Since August 19 the server merges replaced pods, and anyone who can see the surviving pod sees all the absorbed readings.
Three of the four merge chains cross organizations: Marina Park and PCH Public Dock Buoy absorb City of Newport Beach pods, and Old Woman Creek 2026 absorbs a pod in an organization that no longer exists.
Options: history follows the physical pod (current server behavior); history stays with the organization that recorded it; or history is shared only within one organization.
Recommended: history is shared only within one organization; Gilligan says when earlier history exists but is withheld.
Default: the recommendation, which is stricter than the dashboard.
Ref: `SECURITY_FINDINGS.md` §3, §7; `POD_AUTHORIZATION.md` §5-6, Q1.

**D4. When a pod moves site, is it a new monitoring location?**
Should reports cover the physical pod or the site, and how are testing and maintenance periods excluded?
Recommended: reports cover the current site from the move date; testing periods are excluded only if marked.
Default: reports cover whatever the pod's merged history returns within the requested window, and say so.
Ref: `POD_RELOCATION_EVIDENCE.md`.

**D5. Two pods point at organizations that do not exist (Marina Park, CWA Old).**
Fix the reference, or is that intended?
Default: those pods are visible to CER staff only.
Ref: `SECURITY_FINDINGS.md` §2; `POD_AUTHORIZATION.md` Q7.

**D6. [5] Which pods and organizations are in scope for release testing?**
Recommended: the test organizations from B1 plus one real customer organization with its permission.

---

## E. Turbidity

For September 30 turbidity is qualitative only (Clear, Moderate, Turbid), so none of these blocks the release, but each changes what Gilligan may say.

**E1. [3, 22] Which pods carry the Turner Turbidity Plus and which the Keyestudio KS0414?**
Also: the model or datasheet of the temperature probe.
Default: all pods treated as Keyestudio, qualitative only.

**E2. [18] Where does the conversion `NTU = (3.35 - V) × 300` come from?**
Neither vendor publishes it, and the dashboard labels turbidity "Relative".
Default: Gilligan calls the value "relative turbidity" and never compares it to published NTU or FNU ranges.

**E3. [14] Clarity band edges: 345/795 NTU (from the operator's 2.2 V and 0.7 V) or 350/800 (the dashboard dials)?**
Recommended: one set everywhere; we suggest 350/800 if the rounding was deliberate.
Default: reports keep 345/795 and the mismatch stays.

**E4. [4] Is 0-25 NTU the Turner sensor's range?**
Default: unknown; not used.

**E5. [10] Can a missing or offline turbidity reading arrive as empty instead of 0?**
Today it is indistinguishable from perfectly clear water.
Recommended: the server returns empty for missing or offline readings (a small server change).
Default: Gilligan treats a run of exact zeros as "possibly missing" and says so.

**E6. [11] Can the pod registry carry a sensor-model field?**
Recommended: yes, after the release.

---

## F. Data policy

**F1. [21] How long are Gilligan chats kept, and who may read them?**
Each saved message will also hold which sources and approved guidance produced the answer.
Recommended: keep 12 months; readable by the user and CER superadmins for support.
Default: kept indefinitely, readable by the user only, as today.

**F2. Is Fireworks acceptable as the model provider for customer data?**
Fireworks states it does not log or store prompts or answers for open models unless the account opts in; its page does not mention a data processing agreement.
Recommended: acceptable for launch.
Default: we proceed.

---

## After the answers

Record each answer and its date in `../STAKEHOLDER_QUESTIONS.md` (bracketed numbers) or, for new items, add them there.
Record any decision in `../timeline.md`.
Update the plan in `RELEASE_GOAL_AND_PLAN.md` where an answer changes a task.
