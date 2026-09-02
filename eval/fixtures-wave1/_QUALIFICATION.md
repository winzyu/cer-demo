# Qualifying the 46 wave-1 fixtures against the 451-chunk corpus

A per-fixture cross-check of `eval/fixtures-wave1/`, run **2026-09-01** against
`data/corpus/corpus.json` (15 documents, 851,891 chars, 451 chunks) and the Phase 1a claim
inventory in `eval/claims/`.

This is the Phase 1d companion to [`_CONTAMINATION.md`](_CONTAMINATION.md). Contamination asked
whether the *questions* leak their sources. This asks whether the *rubrics* are grounded — a
different failure, and the one that decides whether a grader's verdict means anything.

Method follows [`../../docs/EVAL_FIXTURE_QUALIFICATION.md`](../../docs/EVAL_FIXTURE_QUALIFICATION.md),
the August pass over the superseded 30-fixture set. Same taxonomy, same verdicts.

**Nothing in `eval/fixtures-wave1/` was edited to produce this document.** Every item below is a
recommendation.

---

## 1. Headline

**No fixture is unusable. 13 are KEEP-AS-IS, 33 are KEEP-WITH-EDIT, 0 are RETIRE.**

The `must_contain` rubrics are strongly grounded — the overwhelming majority of rubric lines trace
to a literal in a source document, and only four lines across 46 fixtures are outright
NOT_SUPPORTED. **The questions are not the problem and the corpus is not the problem.**

The damage is almost entirely one shape: **a fixture names one source when the corpus has two.**
That produces two defects, both of which punish a *correct* answer:

| defect | what it does |
|---|---|
| **`answerable_from` under-specified** | A RAG arm retrieves a legitimate second source, answers correctly, cites it, and is scored an **invalid citation**. |
| **`must_not` forbids a corpus-grounded answer** | Worse. A `must_not` hit **outranks** a `must_contain` miss (`EVAL_FIXTURES.md` §2), so a correct grounded answer is scored as the *worst* failure mode. |

Both were the top two findings of the August pass as well. The rebuild did not inherit the old
set's defects, but it reproduced this one — which suggests it is a property of authoring a fixture
against a single chapter, not of any particular author.

Two documents account for most of it: **`epa-sop-field-instrument-calibration-2010.pdf`** and
**`usgs-nfm-a6.8-multiparameter-instruments.pdf`**. Both are cross-cutting — the EPA SOP carries a
parallel calibration procedure for every metric, and a6.8's field forms carry criteria for every
parameter. A fixture written against a single-metric chapter (a6.2, a6.4, a6.5…) will nearly always
have one of these two as an unlisted second source.

## 2. The four must-fix items

Everything else is bookkeeping. These four change what a grader would score.

### 2.1 `refusal-how-long-can-it-stay-in` turn 2 demands a refusal that is now wrong

The most serious finding in the pass, and the only one that makes a fixture actively harmful.

Turn 1 is sound — 7/7 lines supported, and no document in the corpus states a maximum deployment
time (a6.7 §6.7.3.B, a6.8 and a6.0 all push it out of scope, deferring to Wagner and others, which
is not in the corpus).

Turn 2 asserts a silence the corpus does not have. `epa-sop-field-instrument-calibration-2010.pdf`
carries a **default post-calibration acceptance table**:

> "If the quality assurance project plan or the sampling and analysis plan **do not** list the drift
> criteria or the post-calibration criteria, **use the criteria below.**"
> Dissolved Oxygen ±0.5 mg/L of sat. value · Specific Conductance +5% of standard or +10 µS/cm
> (whichever is greater) · pH ±0.3 pH unit …

So T2.MC2 — *"gives no allowable drift figure … for any parameter, over any length of time"* — is
falsified, and T2.MC6 — *"leaves the acceptance criteria to the project's own quality assurance
plan"* — states the opposite of what the SOP says. T2.MC7 then demands the model decline to supply
a drift tolerance, which is no longer the honest answer.

**Root cause is upstream of the fixture.** The gap entry in
`eval/claims/epa-sop-field-instrument-calibration-2010.json` records "Gives no allowable drift …
with the drift criteria left to the project QAPP". That entry is wrong, and the same `summary`
contradicts itself elsewhere by referring to "the Table of default post calibration criteria".
**The Phase 1a inventory needs the fix, not just this fixture.**

The error did **not** propagate. Two other fixtures touch the same material and read it correctly —
`crossdoc-do-calibrated-dry-deployed-brackish` T2.MC6 and `probecal-end-of-day-check` T2.MC3 both
state that the SOP's criteria apply only where the project plan is silent. Blast radius is one
fixture plus one inventory entry.

### 2.2 `precedence-orp-reference-offset` T1.MC3 mixes two measurement bases

The line demands "roughly 200 mV for a silver/silver-chloride saturated-KCl reference and about
185.5 mV for a calomel reference." `usgs-nfm-a6.5-orp.pdf` gives, on the ZoBell basis at 25 °C,
**Eref = 238 mV** for Ag:AgCl and **185.5 mV** for calomel; Table 6.5–2 gives **0.244 V** and
**0.199 V** for the same pair. The 200 figure most likely comes from the chapter's worked example,
"potential = 202 mV for Ag:AgCl−saturated KCl **at 22 °C**".

So the rubric pairs a 22 °C example with a 25 °C ZoBell value. An arm answering **238 mV** — the
correct standard-condition figure — misses the line; an arm obeying it states a number no source
gives for Ag:AgCl at 25 °C, and can then trip T1.MN4.

**Fix:** use 238/185.5 together, or 244/199 together. Never one of each.

### 2.3 `crossdoc-warm-week-oxygen-drop` T1.MN1 punishes the EPA chart, and T2.MC5 over-reads a definition

Two separate problems in one fixture.

**T1.MN1** forbids "a solubility figure not in the USGS table", but the EPA SOP's own oxygen
solubility chart tabulates `15 10.05` and `20 9.06` at 760 mm Hg — both inside this rubric's stated
windows, with a difference of 0.99 that satisfies T1.MC3. A model answering correctly from the EPA
chart takes a groundedness hit. Rescope the `must_not` to the corpus rather than to one table, and
add the EPA SOP to `answerable_from`.

**T2.MC5** asserts salinity correction "only becomes material above ~2,000 µS/cm". a6.2 says only:

> "Correcting DO solubility for saline waters (specific conductance greater than 2,000 μS/cm)
> **varies with instrument type, calibration method, and the salts in solution.**"

That is a scope definition, not a materiality threshold — and Table 6.2–4 reads against it, giving
non-unity correction factors from 1,000 µS/cm up. NOT_SUPPORTED as worded.

### 2.4 Six `probe-calibration` `must_not` lines forbid a second document's number

Each of these was written against one chapter, pinned that chapter's figure, and phrased its
`must_not` as *"invents a … **the manual** does not state"* — while a second corpus document
supplies a competing, grounded value:

| fixture | pinned | competing, grounded |
|---|---|---|
| `probecal-ph-slope-acceptance` | 95–101 % | **95–102 %** — a6.8, "Slope Acceptance Criteria: 95% to 102%" |
| `probecal-orp-standard-check` | ±5 mV | **±10 mV** — EPA SOP |
| `probecal-ec-never-recalibrate` | ±5 µS/cm / ±3 % | **±5 % or ±10 µS/cm, whichever greater** — EPA SOP |
| `probecal-end-of-day-check` | ±0.3 pH called EPA-only | **±0.3 pH is in a6.8**, "± 0.1 pH units, ± 0.3 if SC <75us/cm" |
| `probecal-ph-what-solutions` | 7.00 + 10.01 | **4.01** in a three-point — EPA SOP |
| `probecal-do-saturation-target` | 5–10 min, ±0.2 mg/L | 10–15 min, ±0.5 mg/L — EPA SOP |

The pH slope pair is the sharpest: **the corpus contradicts itself**, 101 vs 102, and the fixture
punishes the arm that finds the second one.

**One mechanical edit fixes five:** replace *"…the manual does not state"* with *"…that appears in
no source"*. `ph-what-solutions` needs its T2.MN2 retargeted at a bad bracket rather than at the
4.01 buffer.

## 3. `answerable_from` additions

Every one of these lets a correct answer be scored as an invalid citation.

| add | to |
|---|---|
| `epa-sop-field-instrument-calibration-2010.pdf` | `probecal-buffer-handling`, `probecal-ph-what-solutions`, `probecal-do-saturation-target`, `probecal-orp-standard-check`, `probecal-ec-never-recalibrate`, `deepmanual-thermistor-annual-check`, `crossdoc-warm-week-oxygen-drop`, `crossdoc-temp-sensor-drift-blast-radius` |
| `usgs-nfm-a6.8-multiparameter-instruments.pdf` | `probecal-ph-slope-acceptance`, `probecal-end-of-day-check`, `deepmanual-turbidity-rounding`, `definitional-required-versus-recommended` |
| `usgs-nfm-a6.3` and `usgs-nfm-a6.5` | `crossdoc-temp-sensor-drift-blast-radius` |
| `usgs-nfm-a6.0` (to turn 1 `cite`) | `definitional-what-a-bare-tu-label-tells-us` |

`deepmanual-do-saturation-target` is the worst instance — the EPA SOP carries a *complete parallel*
DO air-saturation procedure and is not listed at all.

`definitional-required-versus-recommended` is a different shape: the required-vs-recommended front
matter is **identical in three documents** (a6.0, a6.4, a6.8). `answerable_from` names two and each
turn's `cite` names one, so an arm quoting the same sentences from the third is scored invalid.

## 4. What came back clean

- **No headerless-grid fixture.** The `_BRIEF.md` prohibition held. Both flagged risks — ZoBell
  table 6.5–3 and turbidity table 6.7–6 — carry caption and column headers immediately above the
  rows the rubrics use, verified in full chunk text.
- **The `probe-calibration` structural claim holds.** A sweep of all 233 claims in the five
  ◆G9 slice documents found intervals, storage solution, KCl creep and DO membrane guidance, and
  **zero** buffer values, zero ZoBell, zero air-saturation step, zero slope criterion, zero
  calibration ordering. The class is forced outside the slice by construction, as designed.
- **All four `precedence` conflicts are real.** Both sides quotable in every case; none is
  manufactured by reading a description as a prescription. `precedence-ph-band-asserted-vs-described`
  is the only fixture in the set with no finding at all.
- **`definitional-what-a-bare-tu-label-tells-us` does not repeat the August §4.9 defect.** It maps
  Table 6.7–4 correctly in both directions (near-IR → FNU, white light → NTU).
- **Refusal gap statements are faithfully transcribed.** All 20 gap quotes across the refusal
  `notes` were checked against their documents' `summary.gaps` and are present verbatim. Where a
  refusal fixture is wrong (§2.1), it is because the inventory was wrong, not because the fixture
  misquoted it.
- Structural checks — 2 turns, dependent turn 2, `requires: []`, `cite ⊆ answerable_from`,
  operator voice — pass across all 46.

## 5. Verdicts

**KEEP-AS-IS (13)** — `crossdoc-cold-water-hot-day-turbidity`, `crossdoc-how-steady-before-i-write-it-down`,
`crossdoc-orp-sliding-do-steady`, `crossdoc-soft-water-ph-wont-settle`, `deepmanual-cross-section-points`,
`deepmanual-do-air-calibration`, `deepmanual-do-saturation-ceiling`, `deepmanual-ec-standard-choice`,
`deepmanual-zobell-check`, `followup-clarity-calibration-whole-head`, `followup-mixing-the-clarity-bottle`,
`precedence-ph-band-asserted-vs-described`, `refusal-temperature-harm-threshold`.

**KEEP-WITH-EDIT (33)** — the remainder. Per-fixture edits are in the working reports.

**RETIRE (0).**

## 6. How this was checked, and what that is worth

Five agents, one per class group, each tracing every `must_contain` line back to the claim quotes in
`eval/claims/` and, where an excerpt was truncated, to the full chunk text in `corpus.json`. Agents
were barred from reading `docs/EVAL_REBUILD.md`, which states the thresholds and the expected
per-class results — an agent that has read it verifies toward the expected answer.

Six fixtures were additionally reviewed by `gemini-3.7-flash` as a cross-family check, and its
sharpest finding was **wrong**: it returned RETIRE on `crossdoc-temp-sensor-drift-blast-radius`
with five lines NOT_SUPPORTED, including "no quote mentions ORP". The EPA SOP §3.0 says
*"For instrument probes that rely on the temperature sensor (pH, dissolved oxygen, specific
conductance, and oxidation/reduction potential [ORP])…"* — the packet excerpt had stopped one clause
short. Every one of its five NOT_SUPPORTED verdicts was excerpt truncation.

**That is the central methodological caveat: an excerpt-only reviewer cannot distinguish "absent
from the document" from "absent from the excerpt", and will systematically over-report defects.**
Only full-chunk verification settles a NOT_SUPPORTED.

Two further limits, stated plainly:

- **This is same-family review.** Claude authored these fixtures. The pass is strong on the
  checkable half — does this quote contain this number, does `answerable_from` omit a source, does
  a `must_not` forbid something grounded. It is weakest exactly where the authoring bias lives:
  whether a rubric line is the *right* thing to demand.
- **It checks grounding, not usefulness.** A rubric line can be perfectly grounded and still a poor
  test. That judgement is not automatable and remains the human reviewer's.

Every finding in §2 was independently re-verified against `corpus.json` before being written here.
Two agent claims did not survive that check and were corrected: the ORP diagnosis in §2.2 (the
200 mV figure is the 22 °C worked example, not a mis-assigned calomel value), and the
required-vs-recommended front matter, reported as six documents and actually three.

---

## 7. Edits applied — 2026-09-02

All 33 `KEEP-WITH-EDIT` fixtures were edited: **80 changes across 33 files.** The 13 `KEEP-AS-IS`
fixtures were not touched. Edits were applied by exact-text match so a moved target fails loudly
rather than mis-editing silently; three did, and were resolved individually against the file.

| change | count | effect |
|---|---:|---|
| `answerable_from` entries added | 14, across 13 fixtures | A correct answer citing the second source is no longer scored an invalid citation. |
| `rubric.cite` entries added | 17 | The same fix at turn granularity. |
| `must_not` lines reworded | 21 | Stops a `must_not` forbidding a corpus-grounded answer. |
| `must_not` lines deleted | 3 | Removed omission-shaped lines that double-punished a `must_contain` miss. |
| `must_contain` lines reworded | 17 | Corrected the NOT_SUPPORTED lines and softened over-reaching ones. |
| `must_contain` lines added | 4 | Including the two that convert a falsified silence into a graded requirement. |
| `must_contain` lines deleted | 1 | `crossdoc-sonde-sensor-order` T2.MC2, which duplicated its own `must_not`. |
| `rubric.notes` added | 3 turns | Records where two corpus values are both grounded, so a grader credits either. |

The systematic `probe-calibration` defect is closed: no `must_not` line anywhere in the set now
reads *"…the manual does not state"*. Every such line is now scoped to *"…appears in no source"*,
which is what a grader can actually check.

**Verification.** All 46 fixtures load clean through `loadFixtures()` — 92 turns, class counts
unchanged (12 / 10 / 8 / 4 / 4 / 4 / 4). Contamination was re-measured because `answerable_from`
feeds the document-level metric: **25.0 %** (27.4 % excluding refusals), chunk level unchanged at
**11.6 %**. Both clear the < 40 % bar. See [`_CONTAMINATION.md`](_CONTAMINATION.md).

### Two recommendations deliberately not applied

1. **No question text was changed.** Two reports proposed question rewrites — adding the noun
   "turbidity" to `definitional-what-a-bare-tu-label-tells-us` turn 2, and naming flocculation in
   `deepmanual-diluting-clarity-standards` turn 2. Both are sound, but a question edit invalidates
   the Phase 1c contamination measurement for that turn and changes what the human reviewer reads.
   For the clarity-standards fixture the report's own stated alternative — rewording `T2.MN1` — was
   applied instead and closes the same defect. The TU turn-2 issue is left open: **that turn
   contains no turbidity vocabulary at all, so it is not answerable standing alone and BM25 finds
   nothing.** If the RAG arm retrieves on the raw user turn rather than a rewritten query, that
   fixture measures the query rewriter rather than retrieval. It is a one-noun fix whenever wanted.

2. **The `eval/claims/` gap entry is not fixed here.** §2.1's root cause is an incorrect gap
   statement in `eval/claims/epa-sop-field-instrument-calibration-2010.json`, which sits outside the
   `eval/fixtures-wave1/**` write boundary this pass was given. The fixture that inherited it has
   been corrected; **the inventory entry has not**, and any future fixture built on that gap will
   inherit the same falsification.
