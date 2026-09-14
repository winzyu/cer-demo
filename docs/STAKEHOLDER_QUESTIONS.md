# Open questions for the operator, supervisor and backend owner

A checklist of answers the project needs from people outside the codebase. Tick the box when an
item is resolved, write the answer and the date on its **Answer** line, and record any decision it
settles in `docs/timeline.md`. Delete an item only when its answer is recorded somewhere else.

Items are ordered by what they unblock, most blocking first. Last updated 2026-09-13.

---

## Operator

- [ ] **1. Are these the alert limits the report should trigger on?**
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
  *Answer:*

- [ ] **2. Should the pods with unusable thresholds be configured?**
  `docs/migration/BACKEND_FIELDS.md` §3c records `Trinidad Island DataPod™` and `dev:860322068098448`
  with all ten values at 0, `CER Conference Pod` with placeholders (`maxPH=100`,
  `maxDissolvedOxygen=100`), and two devices with no thresholds at all. Reports for those pods now
  read **"Not assessed"** instead of comparing anything.
  *Unblocks:* reports for those pods.
  *Answer:*

- [ ] **3. Which pods carry the Turner turbidity sensor, and which the Keyestudio?**
  The software cannot tell them apart: the registry has no sensor-model field. Until it can, chat
  treats turbidity as qualitative for every pod. The backend's conversion
  (`turbVoltToNTU.ts`) is written for the Keyestudio KS0414.
  *Unblocks:* quantitative turbidity for Turner pods, and the frozen fixture
  `refusal-turbidity-sensor-hardware`.
  *Answer:*

- [ ] **4. Is 0–25 NTU the Turner sensor's range?**
  The deleted prompt range (0–25 NTU freshwater, 0–10 saltwater) contradicted live readings up to
  1,689. If it was the Turner's range, that explains the discrepancy. Lower priority now that the
  range is gone, but it matters once Turner pods are treated quantitatively.
  *Answer:*

- [ ] **5. Which pods and organisations are in scope for testing?**
  The configured device token sees 5 pods. The August census saw 15, because each token is scoped
  to one organisation.
  *Answer:*

---

## Supervisor

- [ ] **6. Is "configured thresholds" the right thing for users to hear?**
  Chat now calls registry values "configured thresholds" (alert limits an operator set), never
  "normal ranges". A DO of 0.5 mg/L at Old Woman Creek is "within configured thresholds" even though
  aquatic life would be in trouble. The alternative is operators entering tighter limits that mean
  "healthy".
  *Answer:*

- [ ] **7. Approve, edit or reject the 38 advice-catalogue candidates.**
  Review page: https://claude.ai/code/artifact/826ae48b-8403-49bc-b52b-60198efaf6d9 (private; share
  from the page's menu). Two caveats before approving:
  - 16 entries cite the removed source-of-truth document as evidence (2 of them its range claims),
    so their evidence must be re-sourced first.
  - Every entry fires on a detected event, so item 1 decides which ones can ever trigger.

  *Unblocks:* advice in reports, then advice in chat and fixtures.
  *Answer:*

- [ ] **8. Does the veto also cover the removed document's event signatures?**
  The veto removed its ranges and the document itself. `src/report/events.ts` still classifies
  events using that document's signature-matrix *patterns* (which parameters move in which direction
  — for example DO and ORP falling together with turbidity rising reads as Sewage). These are not
  ranges, but their only source is now a document outside the corpus.
  *Unblocks:* nothing today; it decides whether event classification needs a new source.
  *Answer:*

- [ ] **9. Audit-log retention and access, before `AUDIT_LOG` is ever switched on.**
  Records hold the question, the full answer (which can contain customer sensor readings) and a
  caller identity. No retention period or access rule is set (`src/services/auditLog.ts`).
  *Answer:*

---

## Backend owner (`clean-earth-rovers-server`)

- [ ] **10. Can a missing or offline turbidity reading stop arriving as 0?**
  `src/utils/turbVoltToNTU.ts` returns 0 for a missing voltage and for the firmware's offline code
  (`turbVolt > 100`), the same value as clear water. A run of zeros is indistinguishable from clear
  water. A `null` or a flag would let this service tell them apart.
  *Answer:*

- [ ] **11. Can the device registry carry a sensor-model field?**
  Same need as item 3, from the data side.
  *Answer:*

- [ ] **12. Who creates the Firestore composite index for audit-log lookups?**
  `findAuditLogRecords` filters on `caller`, ranges on `timestamp` and orders by it. With no index the
  first real query fails with `FAILED_PRECONDITION` (`src/services/auditLog.ts`; there is no
  `firestore.indexes.json` in the repo).
  *Answer:*
