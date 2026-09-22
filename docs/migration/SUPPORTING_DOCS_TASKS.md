# Supporting-document task packets

Written 2026-09-17. Each packet below is one session's work on the documents that support the assistant: the retrieved corpus (`documents/`, `data/corpus/corpus.json`), the guidance catalogue (`src/catalogue/`), source-of-truth v2 (`water-quality-source-of-truth-v2.pdf`, deliberately outside the corpus), and the superseded advice drafts (`docs/advice/`).

## How to use this file

**Take one packet per chat.** You are given a packet id (for example, "do C1 only"). Do that packet, stop at its "Done when" line, and do not start another. If you find work that belongs to a different packet, add it under that packet's "Notes from other sessions" heading instead of doing it.

Packets are grouped by gate. A gated packet must not be started before its gate clears; the gate is stated in the packet and is not negotiable from inside the session.

Standing house rules still apply and are not repeated in each packet: read `../STATUS.md` first, run only the named Jest suites and with `--runInBand`, `npm run typecheck` and `npm run lint` are free to run, Git mutations need a `/git-plan` approved in chat, live device reads are announced before running, and paid evaluation runs need approval.

**Completion protocol, the same for every packet:** update the durable doc the packet names, then run `/handoff` so the outcome reaches `../STATUS.md`, then offer a Git plan if the user asks for one.

| packet | title | gate | owner |
|---|---|---|---|
| [C1](#c1--v2-ingestion-decision-memo) | v2 ingestion decision memo | none | Claude |
| [C2](#c2--advice-drafts-disposition) | Advice-drafts disposition | none | Claude, user decides |
| [C3](#c3--corpus-portability-and-r5-seeding-runbook) | Corpus portability and R5 seeding runbook | none | Claude |
| [C4](#c4--temperature-probe-datasheet-sourcing-ask) | Temperature probe datasheet sourcing ask | none | Claude drafts, operator answers |
| [C5](#c5--catalogue-approval-intake) | Catalogue approval intake | supervisor items 17-20 | Claude |
| [C6](#c6--fallback-ranges-policy-item-17) | Fallback-ranges policy | supervisor item 17 | Claude |
| [C7](#c7--turbidity-hardware-provenance-item-18-follow-ups) | Turbidity hardware provenance | operator answer on item 18 | Claude, operator answers |
| [C8](#c8--turbidity-ingest-chain) | Turbidity ingest chain | Phase 1d fixture freeze | Claude |

---

# Unblocked

## C1 — v2 ingestion decision memo

**Gate:** none, can start now.

**Owner:** Claude.

**Why:** the corpus is strong on how to measure and weak on what a pattern means (`../CORPUS_SOURCING_BRIEF.md` §5, Priority 2). Source-of-truth v2 supplies exactly that material but was kept out of the corpus on 2026-09-16, so chat can only speak signatures through the catalogue and can never cite them. The objections recorded at the time are section-specific, not document-wide, which makes a partial ingestion worth deciding on the record rather than leaving implicit.

**Files:** write `V2_CORPUS_DECISION.md` in this directory. Read `GILLIGAN_PRODUCT_DIRECTION.md` ("Source-of-truth v2 review" and "Resolve before adopting v2"), `../CORPUS_SOURCING_BRIEF.md` §5, `../../eval/fixtures-wave1/_CONTAMINATION.md`, `../../src/ingestion/chunk.ts` (chunk id scheme), `../../src/ingestion/corpus.ts` (`DOC_META`, `DIRECT_FEED_SLICE`). The PDF is at the repository root; extract it to the scratchpad with `pdftotext -layout`, never into the tree.

**Steps:**

1. State the candidate: v2 §5 (natural cycles), §6 (event signatures), §7 (fault signatures), §11 (parameter couplings), extracted to one corpus document. Exclusions to argue explicitly: §0 (rules addressed to the model, which would compete with the system prompt), §3 (fallback ranges, vetoed as pod limits and pending supervisor item 17), and the quantitative turbidity content (pending item 18).
2. Assess the competing-instructions objection against the actual §0 text, and say whether excluding §0 is sufficient or whether other sections also address the model directly.
3. Assess contamination: v2 prose overlaps fixture answers, so check the candidate sections against `_CONTAMINATION.md`'s method and report which fixture classes would be affected.
4. State the label impact from evidence, not assumption: chunk ids are `filename__contentHash` (`chunk.ts`), so adding a document leaves existing chunk ids untouched and existing labels valid; the additive work is labelling new chunks where they are relevant.
5. Cover the citation consequence both ways: ingesting makes interpretation citable with a verbatim quote, and also makes CER's own wording quotable as if it were third-party authority. Say which risk is larger.
6. Recommend one option: ingest the four sections, ingest a narrower set, or leave v2 out. Name the trigger that would revisit it.

**Verify:** `npx markdownlint` is not configured here, so check by reading: every claim about current behaviour cites a file path or a doc section, and the memo contains no instruction to run `npm run ingest`.

**Done when:** `V2_CORPUS_DECISION.md` exists with a single recommendation and its trigger, and no corpus or code file has changed.

**On completion:** the memo is the durable doc. Then `/handoff`.

### Notes from other sessions

---

## C2 — Advice-drafts disposition

**Gate:** none, can start now. The disposition choice (archive versus keep) is the user's; bring them the options with evidence.

**Owner:** Claude proposes, user decides.

**Why:** `../advice/` holds 4 candidate files (38 drafts) and a 106 KB generated `review.html`, all superseded on 2026-09-17 by `../../src/catalogue/catalogue.json`. Leaving two review surfaces in the tree invites a supervisor or a future session to review the wrong one.

**Files:** `../advice/README.md`, `../advice/candidates-*.md`, `../advice/review.html`, `../ARCHIVED.md`, and the referrers found in step 2.

**Steps:**

1. Establish what the catalogue actually carried over: `catalogue.json` entries cite their origin as `advice-drafts <id>` in `sources`, so list which draft ids are cited and which are not.
2. Find referrers: `grep -rn "docs/advice\|advice/candidates\|advice/review" docs/ src/ test/ documents/ README.md`.
3. Present the options with their consequences: archive by tag following `../ARCHIVED.md` (retrieved later with `git show`, never restored into the tree) versus keep in place with a superseded banner. Note that archiving must keep cited draft ids resolvable, since `catalogue.json` points at them as evidence.
4. Apply the user's choice, repoint every referrer, and add the `ARCHIVED.md` row if archiving.

**Verify:** `grep -rn "docs/advice" docs/ src/ test/ documents/` returns only intentional references; if archived, `git show <tag>:docs/advice/README.md | head` works and `ls docs/advice` is gone.

**Done when:** exactly one advice surface exists in the tree, and every reference to the other resolves.

**On completion:** `../ARCHIVED.md` if archived, otherwise `../RESPONSIBILITY.md`. Then `/handoff`.

### Notes from other sessions

---

## C3 — Corpus portability and R5 seeding runbook

**Gate:** none, can start now. Writing the runbook needs no credentials; running it against the upstream project does not happen in this packet.

**Owner:** Claude.

**Why:** `data/corpus/corpus.json` and 12 of the 14 source PDFs are untracked, so a fresh clone retrieves nothing and the R5 deployment into the upstream project would too. `GILLIGAN_TARGET_ARCHITECTURE.md` §6 promises the upstream owners "a runbook and seed script by Sep 25", and nothing currently plays that role.

**Files:** extend `WSL_SANDBOX.md` with a seeding section, or add a sibling file it links to. Read `../../scripts/ingest.ts`, `../../scripts/seedFirestore.ts`, `../../scripts/seedFirestoreChunks.ts`, `../../src/retrieval/sources/FirestoreCorpusSource.ts`, `../SPECS.md` §11 ("Seeding Firestore"), `../../documents/README.md`.

**Steps:**

1. List exactly which files must be carried to a new machine or project: the untracked corpus artifact, the untracked PDFs, and the four tracked probe datasheets that are already in Git.
2. Write the sequence: place documents, `npm run ingest` (record the `direct-feed slice:` line it prints as the check that the slice is not empty), `npm run embed:cache`, then `npm run seed:firestore-chunks` against the target project.
3. State the credentials and IAM each step needs, without reading or printing any credential.
4. Give a post-seed verification: a query whose expected source document is known, run through the `firestore-direct` adapter, with the expected observable result.
5. State the failure modes plainly: ingest exits 0 with an empty slice; seeding into the wrong project or database id; a corpus artifact from a different chunking run.

**Verify:** `grep -n "seed:firestore-chunks\|embed:cache\|ingest" package.json` confirms every command named exists. Do not run the seeding step.

**Done when:** an upstream owner with IAM but no context could seed a corpus from the runbook alone.

**On completion:** `WSL_SANDBOX.md` and the R5 row in `GILLIGAN_TARGET_ARCHITECTURE.md` §6. Then `/handoff`.

### Notes from other sessions

---

## C4 — Temperature probe datasheet sourcing ask

**Gate:** none, can start now.

**Owner:** Claude drafts the ask; the operator answers.

**Why:** after the turbidity vendor documentation landed on 2026-09-17, the temperature probe datasheet is the last Tier 1 gap, and no stakeholder item currently asks for it. The same message should ask which turbidity sensor is fitted to each pod, since the registry has no sensor-model field.

**Files:** `../STAKEHOLDER_QUESTIONS.md`, `../CORPUS_SOURCING_BRIEF.md` §5 Priority 3 item 12, `../../documents/README.md` (Tier 1 tables).

**Steps:**

1. Add one stakeholder item, numbered after the existing ones, in the file's established format (question, why it matters, what it unblocks, `*Answer:*` left empty).
2. Ask for two things: the temperature probe's datasheet or model number, and a per-pod record of which turbidity sensor is fitted (Keyestudio KS0414 or Turner Turbidity Plus).
3. Say what each answer unblocks: a Tier 1 temperature document, and the ability to tell a customer which instrument produced a turbidity reading.
4. Cross-reference the sourcing brief's Priority 3 item 12 and the Tier 1 gap paragraph in `documents/README.md` so the three stay consistent.

**Verify:** the new item's number does not collide (`grep -n "^- \[ \] \*\*[0-9]" docs/STAKEHOLDER_QUESTIONS.md`), and the release-critical framing at the top of that file still reads correctly if this item is not release-critical.

**Done when:** the item exists and is ready to send, and the two cross-references point at it.

**On completion:** `../STAKEHOLDER_QUESTIONS.md`. Then `/handoff`.

### Notes from other sessions

---

# Gated on the supervisor (items 17-20, expected about 2026-09-25)

## C5 — Catalogue approval intake

**Gate:** the supervisor has returned decisions on `docs/catalogue/review.html`. Without them there is nothing to transcribe; do not approve entries on anyone's behalf.

**Owner:** Claude.

**Why:** the catalogue ships with 23 draft entries and 5 draft referrals, and nothing reaches a customer until `review.status` says `approved`. Until then reports name no causes and give no recommendations for flagged periods.

**Files:** `../../src/catalogue/catalogue.json` is the only source to edit. `../catalogue/review.html` is generated. Read `../SPECS.md` §4b for the rules.

**Steps:**

1. For each decision: set `review.status` to `approved` or `rejected`, and record `review.by` and `review.date` (validation rejects an approval without both).
2. Apply edited wording verbatim into `text`; if the supervisor changed when an entry applies, update `appliesTo` and `requiredEvidence` to match, not just the prose.
3. Approve referrals separately from entries. An entry whose referral is still draft stays hidden even when the entry itself is approved; confirm the contact details the supervisor returned for the four CER services.
4. Bump `version` (the date-plus-counter form already in the file).
5. Regenerate the review page: `npm run catalogue:review`. Never hand-edit `docs/catalogue/review.html`.
6. If the supervisor's answers to items 17 or 18 change what an entry may say, note it and hand that part to C6; do not rewrite the threshold policy here.

**Verify:** `npx jest test/unit/catalogue.test.ts test/unit/catalogueReviewPage.test.ts test/unit/reportNarrative.test.ts --runInBand` passes, and `npm run typecheck`. Confirm the intended entries are live: the approved-only guidance set is what a deployment without `CATALOGUE_DRAFTS` shows.

**Done when:** every returned decision is in `catalogue.json`, the version is bumped, the page is regenerated, and the three suites pass.

**On completion:** `../STAKEHOLDER_QUESTIONS.md` items 19 and 20 (`*Answer:*`), and a `../timeline.md` row recording the approved set and its version. Then `/handoff`.

### Notes from other sessions

---

## C6 — Fallback-ranges policy (item 17)

**Gate:** the supervisor has answered item 17, whether source-of-truth v2's generic fallback ranges are educational only or may change a report's assessment.

**Owner:** Claude.

**Why:** v2 §3 labels its ranges "CER default", starting points for tuning rather than standards, and v2 §0 rule 3 says to use them only where no site baseline exists. That collides with the 2026-09-13 supervisor veto under which a pod's limits come only from its registry thresholds, with no fallback table. The collision must be resolved in one direction, in writing, before any v2 range reaches a customer.

**Files:** `../RESPONSIBILITY.md`, `../timeline.md`. Only if the answer requires code: `../../src/prompt/systemPrompt.ts` (the no-ranges rule and its pinned test), `../../src/tools/getPodThresholds.ts`, `../../src/report/operatorThresholds.ts`, `../../src/report/referenceRanges.ts`.

**Steps:**

1. Record the answer verbatim in `../STAKEHOLDER_QUESTIONS.md` item 17.
2. If educational only: no code changes. Write the rule down where it will be found — a `timeline.md` decision row and a `RESPONSIBILITY.md` paragraph saying a v2 range may be quoted as general background and never applied as a pod's limit. This is the expected outcome.
3. If ranges may change an assessment: this is a policy reversal, not a tweak. Before editing anything, write what it breaks — the prompt's "This prompt carries no normal or acceptable ranges" rule and its test, the `precedence` fixture class, and the report's "N/A means no baseline" contract — and get the user's explicit agreement to proceed.
4. Either way, keep the two sources distinct in wording everywhere they are described: an operator-configured threshold is a limit; a document range is background.

**Verify:** if code changed, `npx jest test/unit/prompt.test.ts test/unit/getPodThresholds.test.ts --runInBand` plus `npm run typecheck` and `npm run lint`. If only docs changed, confirm no durable doc now contradicts the veto: `grep -rn "fallback" docs/ | grep -i range`.

**Done when:** item 17's answer is recorded, the policy exists in a durable doc, and code either matches it or is untouched by design.

**On completion:** `../RESPONSIBILITY.md` and a `../timeline.md` row. Then `/handoff`.

### Notes from other sessions

---

## C7 — Turbidity hardware provenance (item 18 follow-ups)

**Gate:** the operator has said which turbidity sensor is fitted per pod, or has confirmed they cannot say. The desk research half can start earlier if the user asks, but the conclusion needs their answer.

**Owner:** Claude, with the operator answering.

**Why:** the fleet reports NTU from `NTU = (3.35 - V) × 300`, a conversion neither vendor publishes, and the registry has no sensor-model field, so the report cannot say which instrument produced a reading. Supervisor item 18 turns on exactly this.

**Files:** `../../src/report/referenceRanges.ts` (`TURBIDITY_BAND_EDGES` and the conversion's docstring), `DEVICE_API.md` §8, `../../documents/keyestudio-ks0414-turbidity-sensor.md`, `../../documents/turner-turbidity-plus-sensor.md`, `../../documents/README.md` Tier 1 notes, `BACKEND_FIELDS.md` (registry fields).

**Steps:**

1. Start from the strongest evidence already found: `referenceRanges.ts` clamps the index to 0-4550, which is exactly the Keyestudio KS0414's stated 0-4550 NTU detection range, suggesting the conversion was built around that sensor. Confirm or refute this by reading the file's own derivation notes and `DEVICE_API.md` §8.
2. Record what each vendor does and does not support: Turner states "Excitation Wavelength: IR" with no angle and no ISO 7027 or EPA 180.1 claim, is not factory calibrated, and has no temperature compensation; Keyestudio states no optical property and publishes no voltage-to-NTU equation, only an empirical 0.13 NTU per mg/L.
3. Put the question to the operator: which sensor per pod, and where the 3.35 V / 300 constants came from.
4. Write the conclusion into `DEVICE_API.md` §8 and the Tier 1 notes in `documents/README.md`: what the NTU label does and does not mean on this fleet.
5. If a sensor-model registry field is the right fix, record it as a scoped proposal with its cost, do not build it here; it is a later item in `GILLIGAN_TARGET_ARCHITECTURE.md` §5.

**Verify:** `npx jest test/unit/reportReferenceRanges.test.ts test/unit/getTurbidityInfo.test.ts --runInBand` still passes if any docstring or constant was touched; otherwise a docs-only change with no test impact.

**Done when:** a reader of `DEVICE_API.md` §8 can tell what instrument the NTU figure comes from, or can see recorded that the deployment cannot yet say.

**On completion:** `DEVICE_API.md`, `../STAKEHOLDER_QUESTIONS.md` item 18. Then `/handoff`.

### Notes from other sessions

---

# Gated on the Phase 1d fixture freeze

## C8 — Turbidity ingest chain

**Gate:** the Phase 1d fixture review on the 45 / 90 set is complete and `eval/fixtures-wave1/_EXIT_CRITERIA.md` is updated (user task in `../STATUS.md`). Labelling before the freeze means labelling against fixtures that are about to change.

**Owner:** Claude. The Firestore seeding step needs the user's approval in chat, in the session that runs it.

**Why:** `documents/keyestudio-ks0414-turbidity-sensor.md` and `documents/turner-turbidity-plus-sensor.md` are written and registered in `DOC_META`, but `data/corpus/corpus.json` has not been regenerated, so neither is retrievable and the corpus still cannot ground a turbidity-instrument question.

**Files:** `../../documents/*.md` (already written, do not rewrite), `../../src/ingestion/corpus.ts` (`DIRECT_FEED_SLICE` decision), `../../eval/retrieval-labels/`, `../../scripts/resolveRetrievalLabels.ts`, `../RETRIEVAL_EVAL.md`, `../../documents/README.md`.

**Steps:**

1. `npm run ingest`. Read the `direct-feed slice:` line it prints; a `0 chars` slice means the tracked probe datasheets are missing and the run must not be trusted. Confirm the two new documents appear with non-zero chunk counts.
2. `npm run embed:cache` for the new chunks.
3. Label the new chunks: run `scripts/resolveRetrievalLabels.ts` and check the turbidity turns. The script does not delete stale label files, so verify by count and by spot-reading rather than assuming a clean regeneration. Existing labels for untouched documents stay valid because chunk ids are `filename__contentHash`.
4. `npm run retrieval:eval -- --out=...` and diff the ranked chunk ids against the previous snapshot. Report what moved, including anything that got worse; a summary average hides that.
5. Decide `DIRECT_FEED_SLICE` membership. Default is no: the registry cannot say which pod carries which sensor, so injecting an unattributed datasheet into every answer asserts hardware the deployment cannot confirm. Changing the slice also re-baselines the ◆G9 direct-feed arm, so it needs the user's agreement.
6. `npm run seed:firestore-chunks` only for the Firestore arms, and only with the user's approval in chat: it is a live write.
7. Record the new recall, precision, MRR and nDCG in `../RETRIEVAL_EVAL.md` alongside the existing baseline table, and update the corpus totals (documents, chars, chunks) in `../../documents/README.md`.

**Verify:** `npx jest test/unit/ingestion.test.ts test/unit/firestoreCorpus.test.ts --runInBand`, plus the ingest and retrieval-eval output above. Generation captures are not invalidated by this packet: the system prompt is unchanged and gold contexts are unchanged.

**Done when:** both turbidity documents are retrievable, labels cover them, the new retrieval numbers are recorded, and the slice decision is written down with its reason.

**On completion:** `../RETRIEVAL_EVAL.md` and `../../documents/README.md`. Then `/handoff`.

### Notes from other sessions
