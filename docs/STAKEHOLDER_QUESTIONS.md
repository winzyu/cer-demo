# Open questions for the operator, supervisor, backend owner and dashboard owner

A checklist of answers the project needs from people outside the codebase.
When an item is answered, record the answer and any decision it settles in `docs/timeline.md` (or the document that owns it), then delete the item here.
Only open questions stay in this file; answered items 1-4, 7-13 and 17-20 were removed on 2026-10-11 and remain in `git log -p docs/STAKEHOLDER_QUESTIONS.md`.
Partly answered items keep only their open part.

Items are ordered by what they unblock, most blocking first. Last updated 2026-10-11.

---

## Operator

- [ ] **24. Do the pods report conductivity corrected to 25 °C?**
  Conductivity rises with water temperature even when salinity does not change, so a reading must be corrected to 25 °C (specific conductance) before it can be compared with v2 §3's ranges.
  Example: Marina Park reads 31,000-39,000 µS/cm; against v2's coastal range of 50,000-52,000 an uncorrected reading would be "low" every day.
  Until this is answered, conductivity has no v2 fallback: a pod without a usable conductivity threshold reads "not assessed" for it (`docs/timeline.md`, 2026-10-11).
  *Unblocks:* the conductivity fallback in chat and reports, and v2 §2.4's salinity content.
  *Answer:*

- [ ] **25. Which field marks a board that is not responding, and how many in a row should flag it?**
  The CER colleague who added the per-metric error flags asked that two or three consecutive "board not responding" errors flag the sensor at once (`docs/migration/POST_LAUNCH_BACKLOG.md` §1).
  The 2026-10-09 production scan found the error flags only ever take the value 1, and that a reading with all six flags set reads `1000000000` on every metric.
  This project treats three consecutive all-channel failures as a likely data issue, provisionally.
  *Unblocks:* confirming or changing that provisional count.
  *Answer:*

- [ ] **5. Which real pods are in scope for testing?**
  The configured device token sees 5 pods.
  Live writes are allowed only for test users and test organizations this project creates and deletes (supervisor, 2026-09-24); which real pods are in scope is still open.
  *Answer:*

- [ ] **22. Did the Marina Park and PCH Public Dock Buoy merges transfer the site, or only the hardware?**
  Not blocking. Each absorbed a pod that belonged to another organization in the August census, so those predecessors' readings are withheld from answers and reports (`SPECS.md` §10.3c).
  A "yes, the site transferred" for either chain would let its history be shown. Old Woman Creek 2026 was answered on 2026-09-24 (release plan Q3).
  *Answer:*

---

## Supervisor

- [ ] **26. Should natural-variation notes, such as coastal upwelling, live in the guidance catalogue?**
  v2 §3 says coastal dissolved oxygen can dip to 4-5 mg/L and pH to about 7.6 during upwelling, both below its fallback ranges.
  For now the code attaches that note itself when a coastal pod is judged against the v2 fallback (`docs/timeline.md`, 2026-10-11).
  The catalogue is where every approved explanation customers see lives, so the note may belong there instead, alongside v2 §5's other natural cycles.
  *Unblocks:* moving the note into the catalogue, or confirming it stays in code.
  *Answer:*

- [ ] **27. Who corrects the thresholds that do not fit the water, and should the alert emails follow the new flag rule?**
  The 2026-10-09 scan found most persistent flags come from thresholds that do not fit the water, for example PCH's 68 °F maximum against 78-85 °F water (`POST_LAUNCH_BACKLOG.md` §1a).
  Gilligan now flags a metric only after 3 consecutive readings beyond its limit, but the server's alert emails still check only the latest reading, so an email can alert while chat says the metric is in range.
  *Unblocks:* fewer persistent flags, and chat and emails agreeing.
  *Answer:*

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

---

## Backend owner (`clean-earth-rovers-server`)

- [ ] **21. Who besides the author may read a saved Gilligan chat?**
  Chats are kept indefinitely (supervisor, 2026-09-24) and hold customer questions, sensor readings and each answer's audit details.
  Decide who besides the user may read one, for example superadmins handling a disputed answer (release plan O5).
  *Unblocks:* nothing for the release itself; it is the data policy the release inherits.
  *Answer:*

---

## Dashboard owner (`user-dashboard`)

Found in a read-only pass on 2026-09-14.
The Gilligan page itself (`src/app/gilligan/page.js`, `components/gilligan-answer.js`) is left out on purpose: it is known to be broken, and this project is building its replacement.

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
