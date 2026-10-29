# Open questions for the operator, supervisor, backend owner and dashboard owner

A checklist of answers the project needs from people outside the codebase.
When an item is answered, record the answer and any decision it settles in `docs/timeline.md` (or the document that owns it), then delete the item here.
Only open questions stay in this file; answered items 1-4, 7-13 and 17-20 were removed on 2026-10-11, item 23 (approved 2026-09-25) on 2026-10-21, and items 28-32 and 35 on 2026-10-28; they remain in `git log -p docs/STAKEHOLDER_QUESTIONS.md`.
Partly answered items keep only their open part.

Items are ordered by what they unblock, most blocking first. Last updated 2026-10-28.

---

## Operator

- [ ] **24. Do the pods report conductivity corrected to 25 °C?**
  Conductivity rises with water temperature even when salinity does not change, so a reading must be corrected to 25 °C (specific conductance) before it can be compared with v2 §3's ranges.
  Example: Marina Park reads 31,000-39,000 µS/cm; against v2's coastal range of 50,000-52,000 an uncorrected reading would be "low" every day.
  Until this is answered, conductivity has no v2 fallback: a pod without a usable conductivity threshold reads "not assessed" for it (`docs/timeline.md`, 2026-10-11).
  *Unblocks:* the conductivity fallback in chat and reports, and v2 §2.4's salinity content.
  *Answer:*

- [ ] **25. Which field marks a board that is not responding, and how many in a row should flag it?**
  The CER colleague who added the per-metric error flags asked that two or three consecutive "board not responding" errors flag the sensor at once (`docs/plans/POST_LAUNCH_BACKLOG.md` §1).
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

- [ ] **36. Were `CWA 2025 testbed` and `CWA Old` ever in salt water?**
  Not blocking. Both pods merged into `Old Woman Creek 2026`, a fresh-water pod on Lake Erie, but the registry lists them as `salt-water` (`docs/records/POD_RELOCATION_EVIDENCE.md` §3).
  The water type sets which normal ranges a reading is judged against, so their history is withheld from Old Woman Creek's for now (`docs/timeline.md`, 2026-09-28, Q10).
  A "no, the registry is wrong" would let their history be shown once the predecessor hand-off is enabled (`docs/plans/POST_LAUNCH_BACKLOG.md` §2).
  Not yet sent to Michael; it goes in the next message, with the item 26 follow-up.
  *Answer:*

---

## Supervisor

- [ ] **26. Should natural-variation notes, such as coastal upwelling, live in the guidance catalogue?**
  v2 §3 says coastal dissolved oxygen can dip to 4-5 mg/L and pH to about 7.6 during upwelling, both below its fallback ranges.
  For now the code attaches that note itself when a coastal pod is judged against the v2 fallback (`docs/timeline.md`, 2026-10-11).
  The catalogue is where every approved explanation customers see lives, so the note may belong there instead, alongside v2 §5's other natural cycles.
  A second catalogue question from the same work: the approved "Inspect the pod" step (`inspect-sensors`) is triggered by any threshold crossing, but v2 §9.2 recommends inspection only when a data issue is likely.
  The report now shows it only then, enforced in code (`DATA_ISSUE_ONLY_ENTRIES` in `src/report/narrative.ts`); the catalogue entry's own conditions could say so instead.
  *Unblocks:* moving the note and the inspection condition into the catalogue, or confirming they stay in code.
  *Answer:*

- [ ] **27. Who corrects the thresholds that do not fit the water?**
  The 2026-10-09 scan found most persistent flags come from thresholds that do not fit the water, for example PCH's 68 °F maximum against 78-85 °F water (`POST_LAUNCH_BACKLOG.md` §1a).
  The email half is answered: Michael (2026-10-23) wants the alert emails changed so they have a grey area, recorded in `docs/timeline.md` and `POST_LAUNCH_BACKLOG.md` §1e.
  *Unblocks:* fewer persistent flags.
  *Answer:*

On 2026-10-15 Michael was sent six questions, items 28-32 and item 27's email half; he answered all six on 2026-10-23 (`docs/timeline.md`), and the answered items were removed on 2026-10-28.
Items 33 and 34 were never sent; 33 waits for the release after next (user, 2026-10-26).

- [ ] **33. What did "learn the normalcies" mean?**
  Either Gilligan learns each pod's normal pattern (for example pH dipping on hot afternoons), likely as a separate model trained on the pods' data that hands Gilligan a conclusion, or Gilligan learns from people marking its answers wrong, which needs someone at CER to score answers.
  *Unblocks:* the direction of any learning work after the release.
  *Answer:*

- [ ] **34. Are there labels or maintenance logs for the pods' data?**
  Records of when a pod or sensor was serviced, cleaned or calibrated would let a model (item 33) and the flag rules tell maintenance from water.
  *Unblocks:* item 33's first option, and telling servicing or a probe problem from water without inferring it from the readings (`docs/timeline.md`, 2026-10-27).
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
