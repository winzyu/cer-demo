# Qualifying the 30 committed fixtures against the 2026-08-21 corpus

A per-fixture re-examination of `eval/fixtures/`, run **2026-08-24** against the corpus artifact
`data/corpus/corpus.json` (generated `2026-08-22T01:14:04Z`, 18 documents, 1,254,899 chars) and the
code as it stands on `dev`.

> **The corpus changed the day after this was written.** On 2026-08-24 three documents —
> `epa-wqs-handbook-ch3-water-quality-criteria.pdf`, `epa-assessing-monitoring-floatable-debris.pdf`
> and `noaa-nhabon-framework-workshop-report.pdf` — were cut for carrying no numeric criteria on
> any measured parameter, leaving **15 documents / 851,891 chars / 393 chunks**.
>
> **No finding below rests on those three as a source of an answer**, so the per-fixture
> judgements stand. What does change is every place they appear as a *distractor*: the
> recommendation to add `epa-wqs-handbook-ch3-water-quality-criteria.pdf` to a `must_not` list is
> now moot, and the `event-stormwater-vs-intrusion` note about the debris document costing a RAG
> arm top-k slots describes a problem that no longer exists. Read "nowhere else in the 18
> documents" as being against 15, and re-derive against the current artifact.
> See [`../documents/README.md`](../documents/README.md).

The 30 fixtures are a pinned control — three arms were captured against them
([`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §4b). **Nothing in `eval/fixtures/` was edited to
produce this document.** Everything below is a recommendation for whoever re-derives the set for
the next sweep, per [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md) §7's rule that a corpus change is
grounds for re-derivation rather than reinterpretation.

Companion docs: [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md) (what a fixture is),
[`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) (the experiment),
[`../documents/README.md`](../documents/README.md) (the corpus tiers).

---

## 1. Headline

**No fixture is unusable. 16 are KEEP-AS-IS, 14 are KEEP-WITH-EDIT, 0 are RETIRE.**

Every one of the 30 loads clean, and every `must_contain` claim in the set was traced to text in
the corpus — with **one exception**, in `deepmanual-turbidity-optics`, where the rubric asks for a
unit the two named documents contradict. That is the only outright grounding defect found.

The rest of the damage is subtler and falls into three repeating shapes:

- **Under-specified `answerable_from` (9 fixtures).** The expansion put a legitimate second source
  in reach. A RAG arm that retrieves it answers correctly, cites it, and is scored an invalid
  citation because the filename is not in the fixture's list.
- **A `must_not` that now forbids a corpus-grounded answer (3 fixtures).** All three trace to
  `usgs-nfm-a6.5-orp.pdf`, which contradicts the Atlas ORP datasheet on abrasives and supplies
  exactly the reference-electrode conversion one rubric forbids. Per §2 of `EVAL_FIXTURES.md` a
  `must_not` hit outranks a `must_contain` miss, so this is the most expensive kind of drift: the
  grader marks a good answer as the worst failure mode.
- **Prose that names a document that no longer exists (2 fixtures).** `refusal-pathogens` and
  `refusal-nutrients` still tell the grader to watch for material from
  `volunteer_stream_monitoring_a_methods_manual.pdf`, removed 2026-08-21.

### The four findings that matter most

1. **`crossdoc-orp-reference-offset` turn 1 now penalises a correct answer.** Its `must_not` is
   `"supplies a numeric conversion between reference electrodes"`. `usgs-nfm-a6.5-orp.pdf` — new to
   the corpus — is *built around* that conversion: `Eh = emf + Eref`, `Eref = 238 mV` for Ag:AgCl
   in saturated KCl at 25 °C, `185.5 mV` for calomel, and Table 6.5–2 of half-cell potentials by
   temperature. A RAG arm that retrieves it gives a grounded, correct, useful answer and is graded
   as a groundedness failure. See §4.5.

2. **`deepmanual-turbidity-optics` turn 1 asks for a fact its own sources deny.** `must_contain`
   #2 says the sensor uses a near-infrared source; #3 says "the result is reported in nephelometric
   turbidity units (NTU)". Table 6.7–4 of `usgs-nfm-a6.7-turbidity.pdf` maps near-IR at 90° to
   **FNU**, and white light at 90° to NTU; `usgs-nfm-a6.8-multiparameter-instruments.pdf` footnote
   2 says multiparameter turbidity sensors "are reported in FNU". An arm that gets #2 right cannot
   satisfy #3 without contradicting the corpus. See §4.9.

3. **The refusal fixtures still work, but for a different reason than their notes claim.** The
   corpus contains **zero** occurrences of `CFU`, `colony-forming`, or `MPN/100` — no numeric
   bacterial threshold exists anywhere in it. The volunteer manual's fecal-bacteria chapter is
   gone, and its replacement as retrieval bait is one page: §3.4 of
   `epa-wqs-handbook-ch3-water-quality-criteria.pdf`, which names *Escherichia coli*, enterococci,
   fecal contamination and swimming, but gives no numbers. **Nutrients are the larger exposure now**
   — that same document mentions "nutrient" **79** times, with a full §3.6 on nutrient criteria —
   though it too carries no numeric value, pointing to EPA websites instead. See §4.23 and §4.25.

4. **Three of the four exact-token and threshold fixtures that were slice-only are now
   dual-sourced.** `usgs-nfm-a6.3-specific-conductance.pdf` says "specific conductance" 215 times
   and defines the EC-vs-SC distinction directly; `usgs-nfm-a6.7-turbidity.pdf` documents NTU/FNU
   better than the operator reference does. Both fixtures still have a valid in-slice source so
   their `direct-feed` predictions remain *loader*-valid, but they discriminate less than they did
   on 2026-07-29. Record that, do not silently repredict.

### What did not drift

`threshold-do-hypoxia`, `threshold-orp-range`, `threshold-turbidity-estuary`,
`precedence-conductivity-range`, `precedence-ph-range` and both `event-*` fixtures all turn on
material that is still **slice-only**: the DO band list, the ORP healthy range, the baseline
reference table, and the pollution-event signature matrix appear nowhere else in the 18 documents.
`acronym-kcl-creep` is likewise untouched — "KCl creep" occurs only in the three Atlas datasheets
and in no USGS or EPA document.

---

## 2. Loader validity — the whole set passes

```
npx jest test/unit/evalFixtures.test.ts
```

**24 tests passed, 0 failed** (run 2026-08-24, 67.3 s). That covers every rule in
`validateFixture`: id-matches-stem, known class / favor / requires, ≥2 turns, non-empty
`must_contain`, `cite` ⊆ `DOC_META` ∩ `answerable_from`, and both `expected_to_favor` ↔
slice-coverage invariants. It also asserts unique ids, full class coverage, and that the
`sensor-tool` gate holds exactly two fixtures back while `SENSOR_TOOL` is off.

So **loader validity is not where the problem is**, and that is the point worth making about the
loader: it checks that a fixture is *well-formed* against `DOC_META`, not that its rubric is
*true* against the text behind those filenames. The three fixtures repointed after the expansion
(`deepmanual-do-calibration-procedure`, `deepmanual-stabilization-criteria`,
`deepmanual-turbidity-optics`, per `git diff eval/fixtures/`) passed the loader the moment the
filenames were correct — which is why `deepmanual-turbidity-optics` shipped with a rubric its new
sources contradict.

### Runnability

`availableCapabilities()` derives `sensor-tool` from `config.tools.sensorTool`, which
`src/config/index.ts:376` reads as `readBool("SENSOR_TOOL", false)`. With defaults:

| | fixtures | turns |
|---|--:|--:|
| Committed | 30 | 62 |
| Runnable (`SENSOR_TOOL` off) | **28** | **58** |
| Blocked — `sensor-tool` | 2 | 4 |

`turbidity-in-scope` is in `AVAILABLE_CAPABILITIES` unconditionally, so the seven fixtures carrying
it are runnable; the tag is now inert bookkeeping. `WATER_TYPE` defaults to `freshwater`
(`src/config/index.ts:401`), which is what `precedence-conductivity-range` (0–1,500 µS/cm) and
`threshold-turbidity-estuary` (0–25 NTU) assume. Both are consistent with the pinned prompt.

**Two fixtures arguably lack a `requires` entry they should carry.**
`deepmanual-stabilization-criteria` turn 1 demands a turbidity criterion (±0.5 TU) and
`definitional-temperature-master-variable` turn 2 asks the model to check turbidity, yet both have
`requires: []`. Because `turbidity-in-scope` is now always available this changes no behaviour —
it is a consistency note only, and not worth touching a pinned fixture for.

---

## 3. Summary table

`slice` is the derived `sliceCoverage`. `grounded` is my verdict after tracing every `must_contain`
entry to corpus text. `drift` is whether the 2026-08-21 expansion changed what the fixture
discriminates.

| id | class | favors | slice | loader | grounded | drift | verdict |
|---|---|---|---|---|---|---|---|
| `acronym-ec-specific-conductance` | acronym-exact-token | direct-feed | full | ✓ | ✓ | **yes** — a6.3 | KEEP-WITH-EDIT |
| `acronym-kcl-creep` | acronym-exact-token | direct-feed | full | ✓ | ✓ | no | KEEP-AS-IS |
| `acronym-ntu-fnu` | acronym-exact-token | direct-feed | full | ✓ | ✓ | **yes** — a6.7 | KEEP-WITH-EDIT |
| `crossdoc-do-drift-vs-hypoxia` | cross-document | direct-feed | full | ✓ | ✓ (1 inference) | yes — strengthens | KEEP-AS-IS |
| `crossdoc-orp-reference-offset` | cross-document | direct-feed | full | ✓ | ✓ | **yes — `must_not` conflict** | KEEP-WITH-EDIT |
| `crossdoc-recalibration-schedule` | cross-document | direct-feed | full | ✓ | ✓ | minor — EPA SOP | KEEP-WITH-EDIT |
| `deepmanual-do-calibration-procedure` | deep-in-manual | rag | none | ✓ | ✓ verbatim | yes — EPA SOP §5.3 | KEEP-WITH-EDIT |
| `deepmanual-stabilization-criteria` | deep-in-manual | rag | none | ✓ | ✓ verbatim | **yes** — a6.0 table 6.0–1 | KEEP-WITH-EDIT |
| `deepmanual-turbidity-optics` | deep-in-manual | rag | partial | ✓ | **✗ turn 1 #3** | yes | KEEP-WITH-EDIT |
| `definitional-conductivity` | definitional | tie | full | ✓ | ✓ | no | KEEP-AS-IS |
| `definitional-orp` | definitional | tie | full | ✓ | ✓ | no | KEEP-AS-IS |
| `definitional-temperature-master-variable` | definitional | tie | full | ✓ | ✓ | no | KEEP-AS-IS |
| `event-sewage-signature` | event-signature | direct-feed | full | ✓ | ✓ | no | KEEP-AS-IS |
| `event-stormwater-vs-intrusion` | event-signature | direct-feed | full | ✓ | ✓ | noise only | KEEP-AS-IS |
| `followup-diel-swing` | follow-up | tie | full | ✓ | ✓ | minor — a6.4 | KEEP-WITH-EDIT |
| `followup-fouling-cleaning` | follow-up | tie | full | ✓ | ✓ | **yes — `must_not` conflict** | KEEP-WITH-EDIT |
| `fouling-do-erratic` | fouling-drift | direct-feed | full | ✓ | ✓ verbatim | no | KEEP-AS-IS |
| `fouling-orp-span-loss` | fouling-drift | direct-feed | full | ✓ | ✓ | **yes — `must_not` conflict** | KEEP-WITH-EDIT |
| `precedence-conductivity-range` | precedence | tie | full | ✓ | ✓ | no | KEEP-AS-IS |
| `precedence-ph-range` | precedence | tie | full | ✓ | ✓ | no | KEEP-AS-IS |
| `probecal-conductivity-interval` | probe-calibration | direct-feed | full | ✓ | ✓ verbatim | minor — EPA SOP | KEEP-WITH-EDIT |
| `probecal-ph-interval` | probe-calibration | direct-feed | full | ✓ | ✓ verbatim | minor — EPA SOP | KEEP-WITH-EDIT |
| `refusal-nutrients` | refusal | direct-feed | full | ✓ | ✓ | **yes** — stale prose | KEEP-WITH-EDIT |
| `refusal-out-of-domain` | refusal | tie | full | ✓ | ✓ | no | KEEP-AS-IS |
| `refusal-pathogens` | refusal | direct-feed | none (empty) | ✓ | ✓ | **yes** — stale prose | KEEP-WITH-EDIT |
| `sensor-doc-do-normal` | sensor-combined | tie | full | ✓ | ✓ | no | KEEP-AS-IS (blocked) |
| `sensor-doc-event-check` | sensor-combined | tie | full | ✓ | ✓ | no | KEEP-AS-IS (blocked) |
| `threshold-do-hypoxia` | threshold-lookup | direct-feed | full | ✓ | ✓ | no | KEEP-AS-IS |
| `threshold-orp-range` | threshold-lookup | direct-feed | full | ✓ | ✓ | no | KEEP-AS-IS |
| `threshold-turbidity-estuary` | precedence | direct-feed | full | ✓ | ✓ | no | KEEP-AS-IS |

---

## 4. Per fixture

Only the 14 KEEP-WITH-EDIT fixtures get a full section. The 16 KEEP-AS-IS fixtures are summarised
in §5, with the supporting passage named so the check is repeatable.

### 4.1 `acronym-ec-specific-conductance` — KEEP-WITH-EDIT

**Grounding: passes.** All six `must_contain` entries trace to
`water-quality-metrics-source-of-truth.pdf` §3:

> Temperature → EC: Ion mobility rises with temperature; raw EC increases ~2% per °C. Always
> report temperature-corrected specific conductance so EC changes reflect chemistry, not warming.

**Drift: significant.** `usgs-nfm-a6.3-specific-conductance.pdf` (74K chars, new 2026-08-21) uses
the phrase "specific conductance" 215 times and treats the distinction head-on:

> The terms "specific conductance," "specific electrical conductance," and "electrical
> conductivity" have been used interchangeably in the literature… Because the term "electrical
> conductivity" is not always referenced to a standard temperature, the measurement or reference
> temperature must be reported with this parameter.

Two consequences. First, turn 1 is no longer slice-only, so the `direct-feed` prediction is
weaker. Second — and this is the trap — a6.3 gives the temperature dependence as **"0.5 to 3
percent per degree Celsius"**, not the reference's "~2% per °C". An arm grounded in a6.3 partially
misses `must_contain` #3, cannot do turn 2's arithmetic (4% rise ÷ 2 °C ⇒ artifact) at all, and
cites a document absent from `answerable_from`, scoring an invalid citation on top.

**Edit:** add `usgs-nfm-a6.3-specific-conductance.pdf` to `answerable_from` (slice coverage becomes
`partial`; the `direct-feed` invariant still holds because the reference stays in the slice), and
add a turn-2 grader note that only the operator reference supports the ~2%/°C arithmetic. Leave
`expected_to_favor` alone and record that it is now less defensible than when written.

### 4.3 `acronym-ntu-fnu` — KEEP-WITH-EDIT

**Grounding: passes.** Turn 1 from `water-quality-metrics-source-of-truth.pdf` §6:

> Turbidity units: NTU (white-light) and FNU (infrared) are not interchangeable. Standardize on one
> across the fleet.

Turn 2 ("which one does our sensor use?") is answered from the operator block in the pinned prompt
— `Turbidity: 0 to 25 NTU`, plus "turbidity (in NTU)" in the scope line — exactly as the fixture's
own note says. No citation is expected and none is required. Still correct.

**Drift: significant, and it lands on the fixture's whole reason for existing.**
`usgs-nfm-a6.7-turbidity.pdf` v2.1 contains `NTU` 18 times and `FNU` 10 times, and its Table 6.7–4
is a more complete treatment than the reference's one-liner — it maps detector geometry × light
wavelength onto the full unit family, and adds the caveat the reference omits:

> These reporting units are equivalent when measuring a calibration solution … but their respective
> instruments may not produce equivalent results for environmental samples.

The exact-token premise survives (a dense retriever still has to land on a rare token), but "only
direct-feed can see this material" no longer holds. A RAG arm that answers turn 1 from a6.7 answers
it *better* and is scored an invalid citation.

**Edit:** add `usgs-nfm-a6.7-turbidity.pdf` to `answerable_from` and to turn 1's `cite`. Flag the
`direct-feed` prediction as weakened; do not change it.

### 4.5 `crossdoc-orp-reference-offset` — KEEP-WITH-EDIT · **highest-priority fix**

**Grounding: passes.** Turn 1's four claims split cleanly across the two named documents.
`water-quality-metrics-source-of-truth.pdf` §6:

> ORP reference offset: ORP values depend on the electrode's reference type (Ag/AgCl vs. standard
> hydrogen electrode). Record which reference is used so values are comparable across DataPods and
> over time. Treat ORP trend as more reliable than absolute value.

`IORP_probe.pdf`:

> An ORP probe has a platinum tip that is connected to a silver wire, surrounded by silver chloride.
> That silver wire is then connected to a KCL reference solution.

**Drift: the rubric now punishes the best available answer.** `usgs-nfm-a6.5-orp.pdf` was not in
the corpus when this fixture was written. It is the USGS Eh chapter, it mentions ZoBell's solution
44 times, and its entire method *is* the reference-electrode conversion:

> Eh = emf + Eref … Eref = 238 mV (saturated KCl, immersed with the platinum electrode in ZoBell's
> at 25 °C) is the measured potential of the silver:silver-chloride (Ag:AgCl) electrode; Eref =
> 185.5 mV … is the measured potential of the calomel (Hg:HgCl2) electrode

plus Table 6.5–2, "Standard half-cell potentials of selected reference electrodes as a function of
temperature and potassium chloride reference-solution concentration", and the troubleshooting line
"If using different electrodes (Ag:AgCl and Hg:HgCl2), reading should be 44 ± 5 mV".

Turn 1's `must_not` reads `"supplies a numeric conversion between reference electrodes"`. That
prohibition was written when no such conversion existed in the corpus, so producing one was
necessarily a fabrication. It is now a citation. Under `EVAL_FIXTURES.md` §2 — *a `must_not` hit
outranks a `must_contain` miss* — an arm that retrieves a6.5 and answers well is graded worse than
one that says nothing useful.

**Edit:** narrow the `must_not` to the fabrication it was meant to catch, e.g. *"supplies a
reference-electrode conversion not present in the context"*, and add
`usgs-nfm-a6.5-orp.pdf` to `answerable_from`. The fixture's core — declining to call either pod
wrong without knowing the other's reference type — is unaffected and still good.

### 4.6 `crossdoc-recalibration-schedule` — KEEP-WITH-EDIT (minor)

**Grounding: passes, verbatim, across four datasheets.** pH `~1 Year` spec plus "once per year for
the first two years. After that every ~six months"; ORP the same pair; DO `~1 Year` plus "Best
practice is to replace the electrolyte solution and membrane every 1 – 2 years"; conductivity
`~10 years` plus "The plates do not go bad, or change, so recalibration is not necessary." Turn 2's
priority argument is grounded in the reference's §6: "pH, DO, and ORP probes drift over time."

**Drift: minor.** `epa-sop-field-instrument-calibration-2010.pdf` §4.0 answers the same question
with a different unit of time —

> At a minimum, the instrument is calibrated prior to use on the day the measurements are to be
> performed.

— which is about field-sampling practice, not probe service life, but reads as a direct answer to
"give me the recalibration interval". An arm that leads with it misses every `must_contain` without
tripping any `must_not`, and cites a document not in `answerable_from`.

**Edit:** a turn-1 grader note distinguishing the datasheet service interval from the EPA SOP's
per-use calibration check. No `answerable_from` change needed — the SOP does not carry per-probe
intervals, so it is not a legitimate source for what this turn asks.

### 4.7 `deepmanual-do-calibration-procedure` — KEEP-WITH-EDIT (minor)

**Grounding: passes verbatim**, which is worth saying plainly given the file was repointed from
`tm9a6.2.pdf` after the rename. `usgs-nfm-a6.2-dissolved-oxygen.pdf`:

> The main goal of the one-point DO calibration procedure is to create a 100-percent saturated
> oxygen environment in which the DO sensor and its thermistor are at the same temperature. There
> are two procedures … • Procedure 1—Calibration in air (can be accomplished with air-calibration
> chamber or wet-towel method) • Procedure 2—Calibration in air-saturated water (water bubbled with
> air)

Turn 2 likewise:

> The air calibration or check with a wet-towel method (variation of Procedure 1) is the recommended
> method to be performed at the field site. … [Procedure 2] is generally favored for laboratory
> calibrations because of the equipment required.

**Drift: a competing procedure entered the corpus.** `epa-sop-field-instrument-calibration-2010.pdf`
§5.3 gives a full step-by-step DO calibration using a wet sponge or paper towel to make a
"100 percent water-saturated air environment". It is the same physics under different names, it is
also outside the ◆G9 slice, and it is a defensible answer to the question as asked. It scores 0–1
on correctness (the rubric demands the USGS "Procedure 1 / Procedure 2" labels) and its citation
grades invalid.

**Edit:** add `epa-sop-field-instrument-calibration-2010.pdf` to `answerable_from` so the citation
is not scored invalid, and add a grader note that only a6.2 carries the Procedure 1/2 taxonomy the
`must_contain` entries name. Slice coverage stays `none`, so the `rag` prediction is unaffected.

### 4.8 `deepmanual-stabilization-criteria` — KEEP-WITH-EDIT

**Grounding: passes verbatim.** Table 6.8–5 of `usgs-nfm-a6.8-multiparameter-instruments.pdf`:

> Temperature ± 0.2 °C · Specific electrical conductance (SC) ± 5 μS/cm for SC ≤100 μS/cm, or ± 3%
> for SC >100 μS/cm · DO ± 0.2 mg/L · pH ± 0.1 pH units · Turbidity ± 0.5 TU or 5% of the measured
> value, whichever is greater, for turbidity ≤ 100 TU

Turn 2 likewise: "Wait a minimum of 60 seconds for the sensors and sonde body to reach thermal
equilibrium with the water … Some instruments require a longer equilibration time; check the
manufacturer's recommendations."

**Drift: `answerable_from` is now under-specified, on both turns.**
`usgs-nfm-a6.0-field-measurement-guidelines.pdf` — added 2026-08-21 — carries **Table 6.0–1,
"Stabilization criteria for recording direct field measurements"**, with the same five numbers:

> Thermistor ±0.2 °C · Specific electrical conductance ≤100 μS/cm ±5 μS/cm, >100 μS/cm ±3% ·
> Dissolved oxygen … ±0.2 mg/L · pH: Meter displays to 0.01 ±0.1 unit · Turbidity ≤100 FNU
> ±0.5 TU or ±5%, whichever is greater

and the 60-second guidance ("Surface water: Allow at least 60 seconds"). A6.0's own footnote points
at A6.8 for the multiparameter version, so the two are consistent by design — but a RAG arm has two
correct places to land and only one of them scores.

This also matters for the fixture's secondary purpose. Its note says it "doubles as a check that
the [alpha-ratio] filter change did its job for the chunked arms" on table-shaped material. With
two tables in play the check is now about *which* table gets retrieved, which is a different
measurement than the one intended.

**Edit:** add `usgs-nfm-a6.0-field-measurement-guidelines.pdf` to `answerable_from` and to both
turns' `cite`. Slice coverage stays `none`; the `rag` prediction is unaffected and, if anything,
better supported.

### 4.9 `deepmanual-turbidity-optics` — KEEP-WITH-EDIT · **the one genuine grounding defect**

**Turn 1 claims 1 and 2: grounded, verbatim.** `usgs-nfm-a6.8-multiparameter-instruments.pdf`:

> Most multiparameter-instrument turbidity sensors use a monochrome light source with a spectral
> output typically near infrared (780–900 nm), typically a light-emitting diode, and one detector
> at 90-degree orientation to the light source.

**Turn 1 claim 3 — "the result is reported in nephelometric turbidity units (NTU)" — is
contradicted by both named sources.** Table 6.7–4 of `usgs-nfm-a6.7-turbidity.pdf` maps a single
beam with a detector at 90°:

| light source | unit |
|---|---|
| White or broadband, peak 400–680 nm | Nephelometric Turbidity Unit (**NTU**) |
| Monochrome, typically near infrared 780–900 nm | Formazin Nephelometric Unit (**FNU**) |

and a6.8's footnote 2 states "Most multiparameter instruments used for USGS turbidity measurement
contain single-beam infrared wavelength turbidity sensors and are **reported in FNU**." A6.0's
Table 6.0–1 says the same in its footnote 3.

So an arm that satisfies claim 2 (near-IR) **cannot** satisfy claim 3 (NTU) without contradicting
the corpus, and an arm that says "FNU" — the grounded answer — scores a miss. This is precisely
the failure mode the task brief describes: a rubric demanding a fact the corpus does not contain
measures nothing.

The likely cause is visible in the repointing history. The claim was written against the volunteer
manual, which described generic nephelometry; when a6.7 v2.1 replaced it (`git diff`), the note was
rewritten to explain the turn-2 change but claim 3 was carried over unexamined.

Turn 2 is fine. Its `must_contain` ("white light corresponds to NTU, infrared to FNU") is exactly
what Table 6.7–4 says, and the note added 2026-08-21 already tells the grader to accept either
grounding — that was the right call and it holds.

**Edit:** rewrite turn-1 `must_contain` #3 to something the corpus supports, e.g. *"names the
reporting unit that follows from the light source — FNU for a near-infrared source at 90°, NTU for
white light"*. Note that this changes the question's difficulty and therefore its comparability
with the captured arms; it should land as part of a deliberate re-derivation, not as a patch.

### 4.15 `followup-diel-swing` — KEEP-WITH-EDIT (minor)

**Grounding: passes.** All three turns from `water-quality-metrics-source-of-truth.pdf` §3 and §5 —
"pH and DO therefore rise and fall together on the daily cycle. In-phase daily swings of pH and DO
are the fingerprint of biological productivity"; "A smooth, repeating daily oscillation is biology,
not pollution"; and the matrix's "pre-dawn DO minimum is the danger window".

**Drift: minor.** `usgs-nfm-a6.4-ph.pdf` independently grounds turn 2:

> River waters not affected by contamination generally have a pH in the range of 6.5 to 8.5 and
> commonly exhibit diel fluctuations in pH as a result of photosynthesis, respiration, and
> temperature, causing variations in dissolved CO2

The fixture is `expected_to_favor: tie`, so this does not disturb a prediction — but a RAG arm that
cites a6.4 for turn 2 is scored an invalid citation for a correct answer.

**Edit:** add `usgs-nfm-a6.4-ph.pdf` to `answerable_from` and to turn 2's `cite`. Slice coverage
becomes `partial`, which is fine for a `tie`.

### 4.16 `followup-fouling-cleaning` — KEEP-WITH-EDIT

**Grounding: passes, including the safety line.** Turn 3's three cleaning routes are verbatim.
`IpH_probe.pdf`: "Soft coatings can be removed by vigorous stirring or by the use of a squirt
bottle. Organic chemical, or hard coatings, should be chemically removed using a light bleach
solution. … **Do not use a brush or abrasive materials on the pH probe.**" `IORP_probe.pdf`: the
same, plus "A light bleach solution or even a 5 – 10% hydrochloric acid (HCl) soak … Do not use
abrasive materials on the ORP probe." `EC_K_1.0_probe.pdf`: "Soft coatings can be removed by
lightly brushing around the conducting area. … Hard coatings should be chemically removed."

**Drift: the turn-3 `must_not` now forbids USGS guidance.** `usgs-nfm-a6.5-orp.pdf`'s
troubleshooting section says:

> Polish platinum tip with mild abrasive (crocus cloth, hard eraser, or a 400–600-grit wet/dry
> Carborundum™ paper), rinse thoroughly with deionized water.

The fixture's `must_not` is `"recommends brushing or abrasive cleaning of the pH or ORP probe"`.
The Atlas datasheet is Tier 1 and outranks a general reference, so the *right* answer is still the
datasheet's — but an arm that surfaces the a6.5 advice is now citing the corpus, not confabulating,
and the grader has no way to tell those apart from the rubric alone.

**Edit:** keep the `must_not` — the safety line is the point of the turn — but add a grader note
recording the conflict and stating that the operator datasheet governs. Optionally add
`usgs-nfm-a6.5-orp.pdf` to `answerable_from` so the conflict is visible in the fixture itself.

### 4.18 `fouling-orp-span-loss` — KEEP-WITH-EDIT

**Grounding: passes, and the vocabulary bridge the fixture is built on is real.** `IORP_probe.pdf`:

> Coating of the platinum tip can lead to erroneous readings including shortened span (slope).

with the soft/hard cleaning split, the 5–10% HCl soak, "Do not use abrasive materials on the ORP
probe", and `Working Life ~4+ Years` for turn 2. The reference supplies "Treat ORP trend as more
reliable than absolute value" and §6's calibration-history cross-check.

**Drift: same `must_not` conflict as §4.16.** Turn 1's `must_not` is `"recommends abrasive
cleaning"`, which `usgs-nfm-a6.5-orp.pdf` now explicitly does for the platinum tip. Because this
turn's whole rubric is about *how to clean an ORP probe*, a RAG arm is more likely to land on the
a6.5 troubleshooting table here than anywhere else in the set.

**Edit:** same shape — retain the `must_not`, add a grader note naming a6.5 and stating that the
Tier 1 datasheet governs for this probe.

### 4.21 `probecal-conductivity-interval` — KEEP-WITH-EDIT (minor)

**Grounding: passes verbatim.** `EC_K_1.0_probe.pdf`: "Conductivity probes work by measuring the
electrical current of the water between two graphite plates. The plates do not go bad, or change,
so recalibration is not necessary. After the first calibration your conductivity probe is good to
go", with `~10 years` in the spec block. Turn 2's three causes are also verbatim — deposits
changing "the basic electrical properties of the probe", "air bubbles … caught between the two
graphite plates … Lightly tap your conductivity probe", and the reference's ~2%/°C.

**Drift: minor.** The EPA SOP's per-use calibration rule (§4.0, quoted in §4.6 above) and its §5.4
specific-conductance procedure give a RAG arm a competing answer that does not trip the `must_not`
("gives a ~1 year interval") but misses `must_contain`. The fixture's sharpest property — that the
conductivity answer contradicts the other three datasheets — is undisturbed.

**Edit:** grader note distinguishing service interval from per-use calibration check. No
`answerable_from` change.

### 4.22 `probecal-ph-interval` — KEEP-WITH-EDIT (minor)

**Grounding: passes verbatim.** `IpH_probe.pdf` carries exactly the two-answer structure the
fixture is built on: `~1 Year` in the spec table, and in the body "there is no set schedule for
recalibration … weak levels of acids and bases you will only need to recalibrate your probe once
per year for the first two years. After that every ~six months … batch chemical manufacturing,
industrial process, or … strong acids and bases, then calibration should be done monthly".

Turn 2's second claim — "fouling or a failed calibration check can force it sooner" — is supported
by inference from the reference's §6 (calibration drift, biofouling) rather than by a sentence
saying so. Defensible, and the `cite` already includes the reference.

**Drift: minor**, the same EPA SOP competition as §4.21.

**Edit:** grader note only.

### 4.23 `refusal-nutrients` — KEEP-WITH-EDIT

**Grounding: passes, and turn 2's grounded-inference target is intact.**
`water-quality-metrics-source-of-truth.pdf` §1:

> Critically, particles carry adsorbed pollutants — phosphorus, metals, hydrocarbons, pathogens —
> so a turbidity spike is also a proxy for contaminant loading.

**Drift: the hazard is real now, and the rubric names the wrong document.** Turn 1's `must_not`
reads `"presents nutrient material from the volunteer manual as this deployment's data"`. That
manual left the corpus on 2026-08-21. Its replacement as retrieval bait is
`epa-wqs-handbook-ch3-water-quality-criteria.pdf`, which says "nutrient" **79** times and devotes
§3.6 to nutrient water quality criteria:

> Nutrient pollution is a widespread and growing environmental problem in the United States. …
> the EPA recommends that states and authorized Tribes adopt numeric criteria into WQS for both
> total nitrogen and total phosphorus

Two things follow. The exposure is **larger** than it was — 79 on-topic mentions versus a chapter
in a manual that no longer exists — so this fixture is now more valuable, not less. But the
document is policy narrative and **carries no numeric nutrient value**; it points readers to EPA
websites. So `must_not: "converts the inference into a numeric nutrient estimate"` still catches
only fabrication, which is what it was for.

**Edit:** replace "the volunteer manual" with
`epa-wqs-handbook-ch3-water-quality-criteria.pdf` in turn 1's `must_not`, and add a grader note
that the handbook contains no numeric nutrient criteria, so any number produced is fabricated.

### 4.25 `refusal-pathogens` — KEEP-WITH-EDIT

**Grounding: n/a by design** — `answerable_from` is `[]`, which the loader exempts from the
`direct-feed` slice invariant (`answerableFrom.length > 0` guard in `validateFixture`). Both turns
demand a refusal.

**Drift: the fixture still works, but its stated mechanism is gone.** Its note says the volunteer
manual "contains a full fecal-bacteria chapter" that a RAG arm can be pulled toward. That document
was removed 2026-08-21. What the corpus contains today:

| term | occurrences, whole corpus |
|---|--:|
| `CFU` / `colony-forming` / `MPN/100` | **0** |
| `coliform` | 0 |
| `fecal` | 3 (2 in the EPA handbook, 1 in floatable debris) |
| `Escherichia coli` / `enterococci` | 2, both in the EPA handbook |

The one substantive passage is §3.4 of `epa-wqs-handbook-ch3-water-quality-criteria.pdf`, about a
page:

> In 2012, the EPA issued updated AWQC recommendations for recreational waters for two bacterial
> indicators of fecal contamination: Escherichia coli and enterococci. The new criteria are designed
> to protect primary contact recreational uses including swimming, bathing, surfing…

That is on-topic-looking retrievable text in front of a question the service must refuse, so the
Tier 4 / Tier 3 risk `documents/README.md` flags is genuine — but it is a page of policy prose, far
weaker bait than a whole chapter, and the fixture discriminates less sharply than it did.
`noaa-nhabon-framework-workshop-report.pdf`'s 25 "bacteria" hits are all *cyanobacteria* in a HAB
context and are not fecal-indicator material.

Turn 2's grader note — "any threshold produced is fabricated, since the criteria documents were
removed from the corpus" — I re-verified and it **still holds**: there is no numeric bacterial
threshold anywhere in the 18 documents.

**Edit:** rewrite the `notes` and turn-1 `must_not` to name
`epa-wqs-handbook-ch3-water-quality-criteria.pdf` §3.4 instead of the volunteer manual, and record
that the discriminating power has dropped. Do **not** retire it — it is still the only fixture
testing this failure mode, and `documents/README.md` explicitly asks for the refusal fixtures to be
re-checked after any sweep on this corpus.

---

## 5. The 16 KEEP-AS-IS fixtures

Each was checked the same way; the supporting passage is named so the check is repeatable.

| id | why it holds |
|---|---|
| `acronym-kcl-creep` | Verbatim in `IpH_probe.pdf` — "KCl will form a salt channel that wicks the water out of the probe's soaker bottle", "Your probe is not damaged", "Simply rinse off your probe with water, and carry on"; turn 2's 3-week dry limit and the 5-step rehydration are on the same page. "KCl creep" occurs in **three** Atlas datasheets (IpH, IORP, Industrial-DO — the fixture's note says two) and in **no** USGS or EPA document. The sharpest exact-token probe in the set, and the expansion did not touch it. |
| `crossdoc-do-drift-vs-hypoxia` | Verbatim on both sides — `Industrial-DO-probe.pdf` "When the electrolyte is depleted, the probe will read very low numbers. Best practice is to replace the electrolyte solution and membrane every 1 – 2 years", the galvanic construction ("HDPE membrane, an anode bathed in an electrolyte and a cathode", "Cathode (Pure silver rod)", "Anode (Zinc)"); reference §6 "a slow one-directional trend across weeks may be drift". Turn 1's ORP discriminator is an inference from §3's DO↔ORP coupling rather than a quoted sentence — grade it as such. **The expansion sharpens the turn-2 trap:** `usgs-nfm-a6.2-dissolved-oxygen.pdf` says "optical"/"luminescent" 80 times and "galvanic" **zero** times, so a RAG arm now retrieves 154K chars of optical-sensor manual for a galvanic-probe question. |
| `definitional-conductivity` | Reference §1 and the §2 baseline table: 50–1,500 µS/cm freshwater, ~45,000–55,000 µS/cm (~35 PSU) seawater, "differ by roughly 1,000×". Slice-only. |
| `definitional-orp` | Reference §1 plus `IORP_probe.pdf` "The output of the probe is represented in millivolts"; the `must_not` "claims the reading indicates how many electrons are available for transfer" is lifted straight from the datasheet's own caveat. |
| `definitional-temperature-master-variable` | Reference §1 "Temperature is the master variable — it sets DO capacity, accelerates biological and chemical rates, and shifts EC readings"; turn 2 from §3 and the thermal-discharge row of the §4 matrix. Slice-only. |
| `event-sewage-signature` | The §4 matrix row (DO ↓↓, ORP ↓↓, EC ↑, pH ↓, turbidity ↑, "not tied to time of day") and the algal-bloom row. The matrix exists in no other corpus document. |
| `event-stormwater-vs-intrusion` | The stormwater and saltwater-intrusion rows plus §5's tidal rule-out. `epa-assessing-monitoring-floatable-debris.pdf` says "storm" 87 times, but about debris and CSO trash, not chemistry — retrieval noise that costs a RAG arm top-k slots without offering a competing answer. If anything this strengthens the `direct-feed` prediction. |
| `fouling-do-erratic` | Verbatim: "a small amount of corrosion (zinc oxide) may build up around the anode … **Do not file the cathode, as this will damage the probe**"; "the membrane can wear out"; turn 2's "Approximately 60 ml/min". |
| `precedence-conductivity-range` | Operator range 0–1,500 µS/cm from the prompt at `WATER_TYPE=freshwater`; reference floor of 50 µS/cm from the §2 table. The conflict at 30 µS/cm is exactly as described. |
| `precedence-ph-range` | Operator range 6.5–8.5 from the prompt; the seawater 7.8–8.3 band the user pushes back with is in the §2 table and nowhere else. `usgs-nfm-a6.4-ph.pdf` independently states 6.5–8.5 for uncontaminated river water, which corroborates the operator range rather than competing with it. |
| `refusal-out-of-domain` | Turn 2 verbatim from §5: "EC, temperature, and turbidity oscillate with the tide. Turbidity often peaks at maximum current (resuspension). An EC change that repeats on the tidal clock is mixing, not a discharge." |
| `sensor-doc-do-normal` | Bands from the reference's DO threshold list; operator 5–14 mg/L from the prompt. **Not runnable** — `SENSOR_TOOL` is off by default. |
| `sensor-doc-event-check` | Signature matrix plus §5 rule-out. **Not runnable** — same gate. |
| `threshold-do-hypoxia` | "Thresholds (general): >6 mg/L healthy · 4–6 mg/L stress · 2–4 mg/L hypoxic stress · <2 mg/L hypoxia · ~0 anoxia." Nothing else in the corpus carries these bands — `epa-wqs-handbook-ch3` treats DO only as a policy/site-specific-criteria topic, and a6.2 mentions hypoxia once, in an instrument-capability aside. |
| `threshold-orp-range` | "+200 to +400 mV … Negative values indicate reducing, anoxic, or septic conditions", plus §6's trend-over-absolute caveat. `usgs-nfm-a6.5-orp.pdf` is procedural and offers no healthy-water band, so this stays slice-only. |
| `threshold-turbidity-estuary` | §2 table: brackish/estuarine 5–100+ NTU, healthy freshwater <5–25 NTU; §1 "Rivers and estuaries are naturally more turbid and event-driven". The operator range (0–25 NTU) is in the prompt. The 2026-07-29 reclassification to `precedence` still reads correctly. |

---

## 6. What I did not verify

- **No arm was run and nothing was measured.** Every claim about what a RAG arm *would* retrieve is
  an inference from the presence of text in the corpus, not an observed retrieval. Whether a given
  competing passage actually lands in a top-k window is exactly the thing a sweep measures, and I
  did not run one. The per-class hit rates in `RETRIEVAL_BAKEOFF.md` §4b predate this corpus.
- **I read the corpus artifact, not the PDFs.** `data/corpus/corpus.json` dated
  `2026-08-22T01:14:04Z` was taken as the ground truth for document text. `npm run ingest` was not
  re-run. If extraction dropped or garbled a passage, a claim I marked ungrounded could be grounded
  in the source PDF.
- **`epa-sop-field-instrument-calibration-2010.pdf` is OCR text** and visibly garbled in its
  contents pages and signature blocks (`documents/README.md` says as much). Its body text read
  cleanly for the sections I quoted, but I cannot rule out that a term I searched for is present in
  the PDF and lost in the OCR.
- **A few `must_contain` entries are supported by inference rather than by a quotable sentence** —
  `crossdoc-do-drift-vs-hypoxia` turn 1's ORP discriminator, `probecal-ph-interval` turn 2's
  "fouling can force it sooner", `fouling-orp-span-loss` turn 2's calibration-history check. I
  judged each defensible from the reference's §6, but they are not verbatim and a strict grader
  could read them differently. They are flagged where they occur rather than counted as failures.
- **I did not re-check the `expected_to_favor` predictions against anything but the corpus.** Where
  I say a prediction is weakened, that is an argument from source availability, not a result.
- **Chunk-level behaviour was not examined.** The alpha-ratio filter, chunk boundaries, and whether
  a table survives chunking are all relevant to `deepmanual-stabilization-criteria` in particular,
  and none of it is visible from the document text alone.
