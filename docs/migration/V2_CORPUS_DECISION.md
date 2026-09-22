# V2 corpus ingestion decision

Written 2026-09-17, packet C1 of [`SUPPORTING_DOCS_TASKS.md`](SUPPORTING_DOCS_TASKS.md).
Source read: `water-quality-source-of-truth-v2.pdf` at the repository root, version 2.0, dated 2026-09-16, 21 pages, extracted with `pdftotext -layout` to a scratch directory outside the tree.
No corpus, code, or ingested-data file was touched to write this memo.

## Recommendation

**Leave v2 out of the corpus for now.**
Revisit once the supervisor closes stakeholder items 17-20 and the catalogue's causal and limitation entries are approved, and once the two open objections below are resolved.
This is a narrower call than "never": the trigger names exactly what would flip it.

## The candidate

Per the packet, the candidate for ingestion is v2 §5 (Natural Cycles and Look-Alike Events), §6 (Event Signature Library), §7 (Sensor Fault Signatures), and §11 (Parameter Coupling Reference), extracted to one corpus document.
Excluded from the candidate: §0 ("How to Use This Document (Rules for the Model)"), §3 (Fallback Baseline Ranges), and the quantitative turbidity magnitudes in §2.6 ("Indicative turbidity magnitudes").

## Why the candidate should not ship as-is

### It duplicates the catalogue's gate on the same content class, not just on pollution causes

The obvious framing is that v2's event signatures assert pollution causes, which is the class of claim `src/catalogue/catalogue.json` already gates behind supervisor approval (`docs/STATUS.md` "Catalogue (R2)": "Nothing is approved, so reports currently name no causes and give no recommendations for flagged periods").
Checking `catalogue.json` shows the gate is broader than that: it already carries `upwelling-caution` and `fault-first`, both `kind: "limitation"` entries, covering exactly the natural-cycle and sensor-fault reasoning in v2 §5 and §7, not only the pollution-cause reasoning in §6.
So there is no subset of the four candidate sections that falls outside the catalogue's existing scope; §5 and §7 are inside it too.

`src/prompt/systemPrompt.ts` has no rule that would stop a cited CONTEXT excerpt from carrying a cause or a limitation statement to the customer.
The prompt's citation rule (`systemPrompt.ts` lines 214-221) lets the model quote any CONTEXT excerpt verbatim and present it as the answer; the only restrictions are on treating a document range as this pod's configured threshold and on quantitative turbidity claims.
Nothing there requires that a quoted cause or limitation statement first have passed the catalogue's approval, version, or `guidance_ids` audit trail (`docs/STATUS.md` "Gilligan release": "`audit` field carrying `catalogue_version`/`guidance_ids`").
Ingesting v2 §5-7 would let chat retrieve and quote "consistent with a raw sewage input" or "check battery voltage before interpreting a pre-dawn anomaly" straight from the corpus, in the same session where the catalogue is deliberately withholding the identical class of statement pending items 17-20.
That is a second, ungated channel for content the project has already decided needs one gate, not evidence that the gate is unnecessary.

### Two "Resolve before adopting v2" items land inside the candidate, unresolved

`GILLIGAN_PRODUCT_DIRECTION.md` "Resolve before adopting v2 as governing material" lists eight items from the September review.
Item 6 ("Simultaneous timestamps/changes alone do not identify a fault; synchronized sampling and cadence matter") is a direct objection to v2 §7.2 rule 1 ("Identical timestamp across all channels suggests a fault"), which sits inside the candidate.
Item 8 ("Scientific claims lack a full bibliography, and CER-specific empirical claims need supporting analyses") applies to the whole document, including the candidate sections; v2 is CER's own synthesis (`Owner: Clean Earth Rovers, Inc.` on the cover page), not an independently authored external source like the USGS or EPA documents already in the corpus.
Ingesting it would let the assistant cite CER's own unreviewed interpretation as if it were the same kind of authority as the USGS chapters sitting next to it in CONTEXT, with no visible difference to the customer reading a citation marker.
Neither item is marked resolved anywhere in the tree searched for this memo (`GILLIGAN_PRODUCT_DIRECTION.md`, `STATUS.md`).

### Partial excerption leaves cross-references dangling

v2 §6.1's direction vocabulary ("CER default: robust z-score magnitude above 5") depends on the baseline and z-score methodology defined in §4 (Site Baselines) and §9.1 (Detection Procedure), neither of which is in the candidate.
v2 §7.2 twice points to "Sections 7 and 8" or "Section 8" for QC tests that live in §8 (Data Quality Control), also not in the candidate.
Extracted alone, the four candidate sections would ship internal references to sections that do not exist in the corpus document, which a retrieval-only reader (or the model) has no way to resolve.

## Contamination

Applying `eval/fixtures-wave1/_CONTAMINATION.md`'s method (does a fixture's own wording trivially retrieve the new material) rather than its 2026-09-01/02 numbers, which were measured against the current corpus and do not include v2:

- A keyword sweep of all 46 fixture files for the candidate sections' distinctive vocabulary (`upwelling`, `internal tide`, `marine heatwave`, `sewage spill`, `stormwater runoff`, `algal bloom`, `bloom collapse`, `diel cycle`, `tidal cycle`, `galvanic`, `biofilm`, `battery voltage`, `conductivity cell fouling`, `treated effluent`, `dry-weather runoff`, `acid mine drainage`, `saltwater intrusion`, `parameter coupling`, `robust z-score`, `confidence tier`) returned **zero fixture files**. The event-signature and fault vocabulary v2 would add does not exist anywhere in the current fixture set, which makes sense given `docs/CORPUS_SOURCING_BRIEF.md` §5 Priority 2 describes this as the gap the corpus is missing, not something already tested.
- A broader sweep on the underlying domain nouns (`fault`, `baseline`, `tide`, `tidal`, `hypoxi`, `bloom`, `coupling`) surfaces plain-English scenario fixtures whose surface vocabulary overlaps v2's, even though they are sourced from USGS calibration chapters today: `crossdoc-acid-drainage-conductivity-suspect` (mine adit, pH, conductivity — overlaps v2 §6.3's "Acidic input (acid mine drainage, acid spill)" row), `crossdoc-orp-sliding-do-steady` (ORP drift with steady DO — overlaps v2 §7.1's "ORP platinum fouling or sulfide poisoning" row), `crossdoc-cold-water-hot-day-turbidity` (temperature/turbidity artifact — overlaps v2 §7.1's turbidity-fouling and §5 diel/seasonal framing), and `crossdoc-soft-water-ph-wont-settle` (pH instability — overlaps v2 §7.1's pH electrode rows). These four are `cross-document` fixtures, the class with the second-highest chunk-level hit rate already (12.5%, `_CONTAMINATION.md` "Per class").
- The `precedence` class is where this exact failure mode already happened once: all four of the original precedence fixtures (`precedence-orp-reference-offset`, `precedence-hypoxia-threshold-split`, `precedence-ph-band-asserted-vs-described`, `precedence-ec-temperature-coefficient`) were built against the operator's v1 card and were retired and rewritten against USGS chapters after that document left the corpus (see the `notes` field of the current `precedence-do-hypoxia-qa-trigger-not-pod-limit.json` and its siblings). None of the three live precedence fixtures overlap the candidate sections' vocabulary in the sweep above, so this class is not currently at risk from this candidate, but it is the class that has already demonstrated the mechanism: a CER-authored, scenario-styled source document is easy for a fixture's plain-English wording to land on by accident.
- `definitional`, `follow-up`, `probe-calibration`, and `refusal` show no overlap in either sweep.
- Chunk-level re-measurement, not a guess, is what would settle this if ingestion goes ahead: only the four named `cross-document` fixtures need checking.

## Label impact

`src/ingestion/chunk.ts` (`chunkIdOf`) keys chunk ids as `filenameSlug(filename) + "__" + contentHashOf(text)`.
A new filename (the v2 excerpt would need one distinct from `water-quality-source-of-truth-v2.pdf`, which is deliberately kept out of `documents/`, and distinct from the retired `water-quality-metrics-source-of-truth.pdf`) produces chunk ids that cannot collide with any existing chunk id, so no existing retrieval label in `eval/retrieval-labels/` would change or need re-resolution.
Adding v2 is additive labelling work only: new chunks would need new labels where they are relevant to a fixture, not a relabel of anything that exists today.
This holds regardless of which way the recommendation above goes.

## Citation consequence, both directions

Ingesting makes the interpretive material citable with a verbatim quote, which is a real gain: right now chat can state what a metric is and how it is measured (the corpus is strong there), but cannot cite anything for what a multi-parameter pattern means, so it either falls back to the catalogue (gated, and currently empty of approved cause text) or refuses.
The same act also makes CER's own synthesized wording quotable in a citation marker that looks, to a customer, identical to a USGS or EPA citation — the "Resolve before adopting v2" item 8 risk above.
The second risk is the larger one here, for a reason specific to this deployment: the project has already built and is actively populating a supervisor-approval mechanism (the catalogue) for exactly this content class, precisely because self-attributed cause language needs a human check before it reaches a customer.
Ingestion would let the same class of statement reach a customer through a path that mechanism does not cover.

## Trigger to revisit

Revisit once both of these hold:

1. The supervisor has closed stakeholder items 17-20 and approved catalogue entries covering the event, natural-cycle, and fault content v2 would otherwise duplicate (`docs/STATUS.md` "Stakeholders").
2. `GILLIGAN_PRODUCT_DIRECTION.md` "Resolve before adopting v2" items 6 and 8 are addressed for the candidate sections specifically: either v2 §7.2 rule 1 is rewritten or dropped, and either a bibliography/validation pass is done on the candidate's empirical claims or the supervisor explicitly accepts CER-authored interpretive text as citable grounding.

At that point, the better shape may not be raw corpus ingestion at all: the catalogue's `sources` field already resolves an entry to draft evidence (`advice-drafts <id>`, per `SUPPORTING_DOCS_TASKS.md` C2), so v2 sections could instead be cited *from* individual approved catalogue entries the same way, keeping the single supervisor-gated channel rather than opening a second one through the corpus. That option was not evaluated in depth here and is worth weighing against plain ingestion when the trigger conditions are met.
