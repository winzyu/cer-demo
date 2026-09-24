# Open questions for the operator, supervisor, backend owner and dashboard owner

A checklist of answers the project needs from people outside the codebase. Tick the box when an
item is resolved, write the answer and the date on its **Answer** line, and record any decision it
settles in `docs/timeline.md`. Delete an item only when its answer is recorded somewhere else.

Items are ordered by what they unblock, most blocking first. Last updated 2026-09-24, after the supervisor's answers.

---

## Operator

- [x] **1. Are these the alert limits the report should trigger on?**
  Since 2026-09-13, every report baseline is the pod's registry min/max, with no fallback table. A
  report only opens an event when a reading crosses a limit, so a limit set at the edge of what the
  sensor can read disables detection in that direction:
  - **Old Woman Creek 2026:** pH 0–10, DO 0–12, conductivity 0–100,000. The zero minimums mean
    Hypoxia, Sewage, Acidic input and Algal bloom can never be detected there.
  - **Balboa Yacht Basin Buoy:** DO 3–27 mg/L. A bloom's high DO swing practically never crosses 27.
  - **Marina Park, PCH Public Dock Buoy, Algalita Pod, Balboa:** a conductivity ceiling of
    75,000 µS/cm makes saltwater intrusion hard to trip. PCH's floor of 10,000 is well below its
    siblings' 40,000.

  *Unblocks:* meaningful event detection, and every advice entry keyed to an event.
  *Answer:* 2026-09-24 (supervisor): the wide limits, including Old Woman Creek 2026's, were not intentional; the supervisor will correct them in the superadmin view, where limits can change at any time. Until then a limit wider than the sensor's range reads "not assessed" (release plan Q5).

- [x] **2. Should the pods with unusable thresholds be configured?**
  `docs/migration/BACKEND_FIELDS.md` §3c records `Trinidad Island DataPod™` and `dev:860322068098448`
  with all ten values at 0, `CER Conference Pod` with placeholders (`maxPH=100`,
  `maxDissolvedOxygen=100`), and two devices with no thresholds at all. Reports for those pods now
  read **"Not assessed"** instead of comparing anything.
  *Unblocks:* reports for those pods.
  *Answer:* 2026-09-24 (supervisor): yes; thresholds are corrected in the superadmin view (see item 1). Reports keep reading "Not assessed" until they are.

- [x] **3. Which pods carry the Turner turbidity sensor, and which the Keyestudio?**
  The software cannot tell them apart: the registry has no sensor-model field. Until it can, chat
  treats turbidity as qualitative for every pod. The backend's conversion
  (`turbVoltToNTU.ts`) is written for the Keyestudio KS0414.
  *Unblocks:* quantitative turbidity for Turner pods, and the frozen fixture
  `refusal-turbidity-sensor-hardware`.
  Not needed for the September 30 release: turbidity stays qualitative for every pod (decided 2026-09-16).
  Interim, 2026-09-24 (user, provisional): every pod is treated as qualitative only until further notice (`timeline.md`, Task A).
  *Answer:* 2026-09-24 (supervisor): every pod is Keyestudio today, and the difference does not matter for the relaunch. A superadmin checkbox in device setup will record the sensor in Firestore later (item 11).

- [x] **4. Is 0–25 NTU the Turner sensor's range?**
  The deleted prompt range (0–25 NTU freshwater, 0–10 saltwater) contradicted live readings up to
  1,689. If it was the Turner's range, that explains the discrepancy. Lower priority now that the
  range is gone, but it matters once Turner pods are treated quantitatively.
  *Answer:* 2026-09-24: moot for now; no pod carries the Turner sensor (item 3).

- [ ] **5. Which pods and organisations are in scope for testing?**
  The configured device token sees 5 pods. The August census saw 15; a live read on 2026-09-23
  showed the token is superadmin and `/devices` no longer returns retired or merged pods, which
  accounts for the difference.
  *Answer:* 2026-09-24 (supervisor): live writes are allowed for test users and test organizations that this project creates and deletes before launch; nothing else is written or deleted without asking first. Which real pods are in scope is still open.

- [ ] **22. Did the three cross-organization merges transfer the site, or only the hardware?**
  Not blocking. `Marina Park`, `PCH Public Dock Buoy` and `Old Woman Creek 2026` each absorbed a
  pod that belonged to another organization in the August census. Pod data is shown only where
  the organization is known to own it, so those predecessors' readings are withheld from answers
  and reports today (`SPECS.md` §10.3c). A "yes, the site transferred" for a named chain would let
  its history be shown; no answer keeps it withheld.
  *Answer:* 2026-09-24 (supervisor), Old Woman Creek 2026 only: the retired "CWA Old" pod still belongs to Cleveland Water Alliance, its old organization should be null because the pod was merged into the new one, and its readings stay on the merged pod. The pod also served other sites and organizations, so answers and reports default to its current site unless the user asks otherwise (release plan Q3). Marina Park and PCH Public Dock Buoy are unanswered.

---

## Supervisor

Items 17-20 are on the release critical path: the September 30 roadmap needs their answers by about September 25 (`docs/migration/GILLIGAN_TARGET_ARCHITECTURE.md` §4).
They were sent on 2026-09-19 in the email recorded as `docs/migration/SUPERVISOR_QUESTIONS_SEND.md`, asking for a reply by September 21; the supervisor answered on 2026-09-24, leaving item 17, the support contact in item 20, and per-entry catalogue sign-off in item 19 open.

- [ ] **17. Are the generic fallback ranges in source-of-truth v2 for education only?**
  v2 §3, "Fallback Baseline Ranges (Use Only Without a Site Baseline)", gives generic ranges per parameter, and §0 rule 3 says to use them only when a site has no baseline.
  The current rule is that a document's range never stands in for a pod's configured threshold (see item 6 and `docs/timeline.md`, 2026-09-13).
  If v2's ranges are meant to change what a report says when a pod has no configured threshold, that rule changes; if they are for explaining and teaching only, it stays.
  *Unblocks:* which v2 content enters the catalogue, and whether reports ever compare against v2 ranges.
  *Answer:*

- [x] **18. Can the current turbidity hardware be exempted from v2's quantitative turbidity content?**
  v2 gives turbidity ranges in FNU (§3), a typical sensor accuracy of ±2 FNU or ±5% (§8.3), and says field readings are FNU unless stated.
  The release treats turbidity as qualitative only, because the current sensors cannot support measured values (item 3), and the fleet reports NTU, not FNU.
  Confirm that v2's turbidity numbers do not apply to the current hardware, so chat and reports keep using the three clarity bands.
  Interim, 2026-09-24 (user, provisional): treated as granted, so the bands and the caveat are unchanged (`timeline.md`, Task A).
  Vendor documentation for both sensors the operator named was transcribed on 2026-09-17 (`documents/_excluded/keyestudio-ks0414-turbidity-sensor.md`, `documents/_excluded/turner-turbidity-plus-sensor.md`) and supports the exemption: Turner states only "Excitation Wavelength: IR" with no angle and no ISO 7027 or EPA 180.1 claim, is "not factory calibrated", and has no temperature compensation; Keyestudio states no optical property at all and publishes no voltage-to-NTU equation.
  Two follow-ups for the operator: which sensor is fitted to each pod (the device registry has no sensor-model field), and where this project's `NTU = (3.35 - V) × 300` conversion came from, since neither vendor publishes it.
  *Unblocks:* the turbidity entries in the catalogue.
  *Answer:* 2026-09-24 (supervisor): granted; every pod is Keyestudio and the turbidity hardware difference need not be handled for the relaunch, so the qualitative bands and caveat stand.

- [ ] **19. Review the v2 worked examples, and approve the recommendations customers may see.**
  Concerns found in the 2026-09-16 review (details in `docs/migration/GILLIGAN_PRODUCT_DIRECTION.md`, "Resolve before adopting v2"):
  - Page 19, Example 1 says percent saturation falls less because colder water holds more oxygen; by its own formula, a lower measured DO against a higher saturation value makes the percent drop larger, not smaller.
  - Example 2 treats "no rain" as ruling out stormwater, but rain earlier or elsewhere in the catchment is not ruled out by the data given.
  - Example 3 goes from a suspected sensor failure to marking the readings as failed without saying what confirms the failure.
  - Readings that change at the same moment do not by themselves show a sensor fault; how and how often the sensors sample matters.
  - Building site baselines needs a minimum number of samples, a rule for when the spread is zero, behaviour when context is missing, and one consistent set of confidence terms.
  - The scientific claims have no full reference list, and the CER-specific findings need the analyses behind them.

  Then approve, edit or reject each follow-up recommendation for customers.
  The approved set becomes the catalogue that chat and reports share; nothing unapproved is shown.
  The entries to review, with their conditions, evidence and sources, are in `docs/catalogue/review.html` (catalogue `2026-09-19.1`, 38 drafts, generated by `npm run catalogue:review`).
  This replaces item 7.
  *Unblocks:* possible causes and recommended actions in reports and chat.
  *Answer:* 2026-09-24: the supervisor answered the four catalogue questions in the marked-up review (`review-marked-up.html`, untracked): routine cleaning is the customer's job, calibration, power, battery and sensor repair are CER's under the subscription, CER sets the default limits, and a sustained run of 0 or 1005 is a failed sensor that CER replaces. No entry is approved yet; per-entry sign-off is still needed (release plan C1-C3).

- [ ] **20. Confirm the CER referral contacts and wording.**
  Gilligan will suggest CER for four problems: algal bloom cleanup, fish kill cleanup, debris capture and oil spill response.
  Everything else is referred to a separate solution, with no named third party.
  The public website gives:
  - email: info@cleanearthrovers.com;
  - "Schedule a Call" booking link: https://calendar.app.google/b4asoD6b6vuae7Qj6;
  - no phone number or address.

  A third-party listing says CER serves Southern California and Ohio.
  Confirm which contact to show, whether the service area should be mentioned, and the wording of both referral lines.
  *Unblocks:* referrals in chat and reports.
  *Answer:* 2026-09-24, partial: referral wording is proposed in the marked-up review (Floating algae removal, Oil spill cleanup (small to medium), fish kill cleanup after agency sampling, NRC and Cal OES numbers verified). Which CER support contact to show is still open (release plan O1).

- [ ] **23. Approve the Firestore data framework for Gilligan.**
  On 2026-09-24 the supervisor allowed new Firestore collections for Gilligan, once they have seen a table of what they hold.
  The table is `docs/migration/GILLIGAN_FIRESTORE_FRAMEWORK.md`.
  *Unblocks:* the persistent usage store, and any Firestore-backed corpus.
  *Answer:*

- [ ] **6. Is "configured thresholds" the right thing for users to hear?**
  Chat now calls registry values "configured thresholds" (alert limits an operator set), never
  "normal ranges". A DO of 0.5 mg/L at Old Woman Creek is "within configured thresholds" even though
  aquatic life would be in trouble. The alternative is operators entering tighter limits that mean
  "healthy".
  *Answer:*

- [x] **7. Approve, edit or reject the 38 advice-catalogue candidates.**
  Review page: https://claude.ai/code/artifact/826ae48b-8403-49bc-b52b-60198efaf6d9 (private; share
  from the page's menu). Two caveats before approving:
  - 16 entries cite the removed source-of-truth document as evidence (2 of them its range claims),
    so their evidence must be re-sourced first.
  - Every entry fires on a detected event, so item 1 decides which ones can ever trigger.

  *Unblocks:* advice in reports, then advice in chat and fixtures.
  *Answer:* Superseded 2026-09-17. The catalogue is rebuilt from source-of-truth v2 and the usable drafts; its approval is item 19.

- [x] **8. Does the veto also cover the removed document's event signatures?**
  The veto removed its ranges and the document itself. `src/report/events.ts` still classifies
  events using that document's signature-matrix *patterns* (which parameters move in which direction
  — for example DO and ORP falling together with turbidity rising reads as Sewage). These are not
  ranges, but their only source is now a document outside the corpus.
  *Unblocks:* nothing today; it decides whether event classification needs a new source.
  *Answer:* Settled by source-of-truth v2 (2026-09-16), which supplies its own event signatures in §6. Event rules are reconciled to v2 rather than to the removed document; the known difference is v2's marine sewage signature, where conductivity falls.

- [x] **9. Audit-log retention and access, before `AUDIT_LOG` is ever switched on.**
  Records hold the question, the full answer (which can contain customer sensor readings) and a
  caller identity. No retention period or access rule is set (`src/services/auditLog.ts`).
  *Answer:* 2026-09-17: `AUDIT_LOG` stays off. Audit details are saved inside each chat message instead (decision D4 in `docs/migration/GILLIGAN_TARGET_ARCHITECTURE.md`), so the retention question moves to item 21.

---

## Backend owner (`clean-earth-rovers-server`)

- [x] **10. Can a missing or offline turbidity reading stop arriving as 0?**
  `src/utils/turbVoltToNTU.ts` returns 0 for a missing voltage and for the firmware's offline code
  (`turbVolt > 100`), the same value as clear water. A run of zeros is indistinguishable from clear
  water. A `null` or a flag would let this service tell them apart.
  Interim, 2026-09-24 (user, provisional): this service flags a period in which every turbidity reading is 0 as a possible missing sensor, and leaves a lone 0 as Clear (`timeline.md`, Task A).
  *Answer:* 2026-09-24 (supervisor): failing devices read a flat 0 or 1005 with no variance, and Gilligan should recognise that as an abnormal pattern (release plan Q4). Returning null from `turbVoltToNTU.ts` stays a Task A upstream follow-up.

- [x] **11. Can the device registry carry a sensor-model field?**
  Same need as item 3, from the data side.
  *Answer:* 2026-09-24 (supervisor): yes, later: a superadmin checkbox in device setup, stored in Firestore. Not needed for the release (item 3).

- [x] **12. Who creates the Firestore composite index for audit-log lookups?**
  `findAuditLogRecords` filters on `caller`, ranges on `timestamp` and orders by it. With no index the
  first real query fails with `FAILED_PRECONDITION` (`src/services/auditLog.ts`; there is no
  `firestore.indexes.json` in the repo).
  *Answer:* Not needed: `AUDIT_LOG` stays off (item 9).

- [ ] **21. How long are Gilligan chats kept, and who may read them?**
  The upstream `chats` collection keeps every conversation with no deletion, and from the release each saved message also carries audit details: the cited sources, the model, the approved-content version and the data lookups behind the answer.
  Chats already hold customer questions and sensor readings.
  Decide a retention period (or confirm "keep indefinitely") and who besides the user may read a chat, for example superadmins handling a disputed answer.
  *Unblocks:* nothing for the release itself; it is the data policy the release inherits.
  *Answer:* 2026-09-24 (supervisor): keep chats; the supervisor finds old conversations useful, so retention is indefinite. Who besides the author may read a chat is still open (release plan O5).

---

## Dashboard owner (`user-dashboard`)

Found in a read-only pass on 2026-09-14.
The Gilligan page itself (`src/app/gilligan/page.js`, `components/gilligan-answer.js`) is left out on purpose: it is known to be broken, and this project is building its replacement.

- [x] **13. Can the "Ask Gilligan" box on the home, charts, dials and map pages send the whole question?**
  The box opens the Gilligan page with the question in the address, but it does not encode it (`src/app/components/gilligan-widget.js:35`).
  Anything after an `&` or `#` is lost, so "Is pH above 8 & rising?" arrives as "Is pH above 8 ".
  The fix is to wrap the question in `encodeURIComponent`.
  *Unblocks:* the replacement page receiving full questions from the box, which it will keep reading from `?question=`.
  *Answer:* 2026-09-17: this project fixes it as part of the Gilligan replacement, developed in a local clone and transferred upstream after the supervisor approves it. Done in R3 on the dashboard's `local` branch (`encodeURIComponent` in `gilligan-widget.js`), not yet transferred.

- [ ] **14. Which turbidity band edges are right: 345/795 NTU or 350/800?**
  The dials page calls a reading Clear below 350 NTU and Turbid from 800 (`src/app/datahub-dial/page.js:117-118`).
  The operator's voltage edges from 2026-09-10 (2.2 V and 0.7 V, through NTU = (3.35 - V) × 300) work out to 345 and 795, and this project's report uses those.
  So a reading of 347 NTU shows as Clear on the dial and Moderate in a report.
  If 350/800 was deliberate rounding, the report should change instead; confirm with the operator either way.
  Interim, 2026-09-24 (user, provisional): the report keeps 345/795, which match the operator's voltages, and the dial is the one to change; still to confirm with the operator.
  *Unblocks:* the dashboard and reports agreeing on a reading's clarity band.
  *Answer:*

- [ ] **15. Can the shared form-field style be moved onto the light palette?**
  `src/app/shared/text-field-style.js` still carries the colours from before the 2026-08-26 repaint: grey `#888` labels and borders, and a bright blue `#23A5EB` focus ring.
  Grey `#888` on the page background is about 3:1 contrast, below the 4.5:1 minimum for readable text.
  It is used on the login, register and password-reset pages, the team, device, account and card dialogs, the date picker and the "Ask Gilligan" box.
  *Unblocks:* nothing for this project; the replacement page will sit beside these fields and should not look different from them.
  *Answer:*

- [ ] **16. Can small gold labels use the readable gold?**
  The device list's Battery, Water Score and Calibration labels are 12px text in brand gold (`src/app/components/device-pill.js:100`), about 2.5:1 on the page background.
  `globals.css` already defines `--gold-txt` for exactly this case.
  Smaller: in the phone menu, the "Home" item has no text colour of its own, so it looks different from the items below it (`src/app/components/header.js:121-124`).
  *Unblocks:* nothing for this project.
  *Answer:*
