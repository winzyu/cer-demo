# Eval fixtures — the next question set (2026-08-24)

> ## ⚠ ARCHIVED AND NEVER MERGED — superseded by the wave 1 rebuild
>
> These 18 fixtures were an expansion of a set that has since been replaced wholesale. They were
> **archived on 2026-09-01** under `eval-archive-2026-09-01` without ever being merged, and they
> were written against an 18-document corpus that no longer exists (the corpus is 15 documents /
> 451 chunks). **The live set is `eval/fixtures-wave1/`** — see [`EVAL_REBUILD.md`](EVAL_REBUILD.md).


Eighteen new conversations, thirty-seven turns, written for the **18-document corpus** the
2026-08-21 expansion produced. They live in `eval/fixtures-next/`, **not** in `eval/fixtures/`,
and they are not part of any sweep that has run.

Same rule as [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md) §1: every rubric here is dated before any
answer was observed. The chat service was not run, `eval/transcripts/` was not opened, and no
`must_contain` entry was written to match something a model said.

Companion docs: [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md) (the committed 30, the classes, the grading
contract), [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) (the experiment),
[`CORPUS_SOURCING_BRIEF.md`](CORPUS_SOURCING_BRIEF.md) (what the hardware measures and what is
still missing), [`../documents/README.md`](../documents/README.md) (the tiers).

---

## 1. Do not merge this into `eval/fixtures/` while ◆G7 is open

`EVAL_FIXTURES.md` §8 states the rule and this set obeys it. Three arms answered the committed
thirty; adding a nineteenth conversation to that directory changes the question set, and the
captured transcripts then belong to a set that no longer exists.

**What merging would cost, concretely:**

- `eval/transcripts/{cold,warm}/<arm>/` — 3 arms × 2 passes × 28 files — stop being a complete
  capture of the set. Every completeness check against `loadFixtures()` starts reporting holes
  that are not holes.
- `grading/warm/` and its `KEY.json` describe a blind packet built from those transcripts. A
  packet rebuilt over a 48-fixture set is not the packet the judge scored, and the seeded label
  shuffle is keyed off the fixture id set.
- `pgvector-rag`'s runtime is archived (`eval/README.md`). One of the three arms **cannot be
  re-captured** without restoring it, so a set that has grown cannot be brought back to parity by
  re-running. The evidence is the only copy.

The corpus expansion already invalidates the N2 sweep *for re-running* — `documents/README.md`
says so. That is precisely why the answer is a new set in a new directory rather than an edit,
and why nothing here touches an existing fixture.

**When this set does get promoted**, the sequence is: close ◆G7 on the captured evidence → move
`eval/fixtures-next/*` into `eval/fixtures/` → re-run every arm against the 18-document corpus →
grade fresh. Not before, and not partially.

---

## 2. What the expansion left untested, and what this set does about it

The committed thirty were written against eight documents. Tier 2 went from two chapters to
nine on 2026-08-21, and four measured parameters — **temperature, specific conductance, pH and
ORP** — each acquired a dedicated authoritative chapter that no fixture reaches. `deepmanual-*`
covered DO (6.2) and multiparameter sondes (6.8) and nothing else. Tier 3 and Tier 4 arrived
with no fixtures at all.

That gap is the whole assignment. The set is deliberately **RAG-weighted** — 7 `rag`, 9 `tie`,
2 `direct-feed`, against the committed set's 17 direct-feed / 3 RAG / 10 tie — because the new
mass is reachable only by a RAG arm by construction (`corpus.ts`: the ◆G9 slice was left alone on
purpose). A set that predicted direct-feed here would be predicting that the expansion changed
nothing.

### The eighteen

| id | class | favors | slice | reaches |
|---|---|---|---|---|
| `deepmanual-temperature-verification` | deep-in-manual | rag | none | 6.1 + EPA SOP |
| `deepmanual-conductivity-cell-constant` | deep-in-manual | rag | none | 6.3 |
| `deepmanual-ph-slope-acceptance` | deep-in-manual | rag | none | 6.4 |
| `deepmanual-orp-not-routine` | deep-in-manual | rag | none | 6.5 + 6.0 |
| `acronym-ntu-fnu-optics` | acronym-exact-token | rag | none | 6.7 v2.1 + 6.0 |
| `fouling-turbidity-optical-drift` | fouling-drift | rag | partial | 6.7 + 6.8 + T1 |
| `probecal-post-deployment-drift-check` | probe-calibration | rag | none | EPA SOP + 6.0 |
| `crossdoc-ph-electrode-life` | cross-document | tie | partial | T1 datasheet vs 6.4 |
| `crossdoc-conductivity-temp-sensor` | cross-document | tie | partial | 4 T1 datasheets + 6.3 + 6.1 |
| `crossdoc-do-salinity-correction` | cross-document | tie | partial | T1 + 6.2 |
| `precedence-conductivity-saltwater-high` | precedence | tie | partial | T1 + 6.3 |
| `precedence-optimal-do-range` | precedence | tie | full | T1 (§8 candidate) |
| `eventsig-negative-orp` | event-signature | tie | partial | T1 + 6.5 (§8 candidate) |
| `selfref-diel-term` | follow-up | tie | full | T1 (§8 candidate, **new shape**) |
| `assessment-open-ended-concerns` | sensor-combined | tie | full | T1 + tool (§8 candidate, **new shape**) |
| `refusal-hab-bloom-bait` | refusal | direct-feed | full | Tier 4 bait + over-refusal guard |
| `refusal-floatable-debris` | refusal | direct-feed | full | Tier 4 bait |
| `refusal-epa-criteria-number` | refusal | tie | none | Tier 3 bait |

### Fixtures worth knowing about individually

- **`crossdoc-conductivity-temp-sensor`** — the sharpest multi-document case in the set. Three of
  the four Atlas datasheets say *internal temperature sensor: no*; only the DO probe carries one
  (a PT-1000). TM 9-A6.3 assumes a conductivity cell contains its own thermistor. So this pod's
  specific conductance is corrected from a temperature source **the corpus does not identify**,
  and the graded behaviour is saying so. Six documents in `answerable_from`, four needed in one
  answer, against top-k 5.
- **`probecal-post-deployment-drift-check`** — the grounding Phase N6's recalibration guidance
  will be graded on. Turn 2's trap is that the EPA SOP's post-calibration drift criteria and
  NFM A6.0's stabilization criteria look alike and mean different things; an answer that mixes
  the two tables is wrong even though every number in it exists in the corpus.
- **`refusal-hab-bloom-bait`** — both failure directions in one conversation. Turn 1 is baited by
  137K characters of NOAA HAB framework that direct-feed structurally cannot see; turn 2 is the
  **over-refusal guard**, where the operator reference's bloom signature is a grounded answer and
  a blanket refusal scores 0.
- **`deepmanual-orp-not-routine`** — the most surprising document in the new corpus. USGS does not
  treat Eh as a routine field measurement and does not recommend it in general, while the DataPod
  reports it as one of six core parameters. The failure mode is over-correcting into "so ignore
  ORP" — which the operator reference already answers, since it says trend beats absolute value.
- **`selfref-diel-term`** — the §8 self-referential follow-up, authored the way §8 says it has to
  be. See §5.
- **`deepmanual-conductivity-cell-constant`** turn 2 — the correct answer is partly a *negative*
  result: a saltwater deployment at 55,000 µS/cm sits above every standard the chapter names. An
  arm that produces a plausible high-range standard has fabricated it.

---

## 3. Coverage

### Against the twelve classes (`EVAL_FIXTURES.md` §3)

| class | committed 30 | this set | note |
|---|--:|--:|---|
| `definitional` | 3 | 0 | baseline competence, fully in-slice — the expansion cannot move it |
| `acronym-exact-token` | 3 | 1 | NTU/FNU re-grounded in the chapter that defines it |
| `threshold-lookup` | 2 | 0 | verbatim operator numbers, fully in-slice — unaffected by the expansion |
| `cross-document` | 3 | 3 | all three now span Tier 1 **and** Tier 2 |
| `deep-in-manual` | 3 | 4 | one per newly-covered parameter: 6.1, 6.3, 6.4, 6.5 |
| `follow-up` | 2 | 1 | the self-referential shape (see §5) |
| `precedence` | 3 | 2 | the "optimal" trap, and the saltwater high-side conflict |
| `refusal` | 3 | 3 | one per new tier risk: Tier 3, Tier 4 ×2, plus the over-refusal guard |
| `probe-calibration` | 2 | 1 | post-deployment drift, the N6 case |
| `fouling-drift` | 2 | 1 | turbidity — the only sensor whose fouling has a signed direction |
| `event-signature` | 2 | 1 | negative ORP |
| `sensor-combined` | 2 | 1 | open-ended assessment (see §5) |

`definitional` and `threshold-lookup` are the two deliberate zeroes. Both are answered entirely
from the ◆G9 slice and from the authoritative block, both are already covered three and two ways
respectively, and neither can discriminate on a corpus change that left the slice untouched.
Adding more of them would grow the sweep without measuring anything new.

### Against the four corpus tiers

| tier | document | fixtures reaching it |
|---|---|--:|
| 1 | `water-quality-metrics-source-of-truth.pdf` | 9 |
| 1 | `EC_K_1.0_probe.pdf` | 2 |
| 1 | `IpH_probe.pdf` | 2 |
| 1 | `Industrial-DO-probe.pdf` | 2 |
| 1 | `IORP_probe.pdf` | 1 |
| 2 | `usgs-nfm-a6.0-field-measurement-guidelines.pdf` | 3 |
| 2 | `usgs-nfm-a6.1-temperature.pdf` | 2 |
| 2 | `usgs-nfm-a6.2-dissolved-oxygen.pdf` | 1 |
| 2 | `usgs-nfm-a6.3-specific-conductance.pdf` | 3 |
| 2 | `usgs-nfm-a6.4-ph.pdf` | 2 |
| 2 | `usgs-nfm-a6.5-orp.pdf` | 2 |
| 2 | `usgs-nfm-a6.6-alkalinity.pdf` | **0** |
| 2 | `usgs-nfm-a6.7-turbidity.pdf` | 2 |
| 2 | `usgs-nfm-a6.8-multiparameter-instruments.pdf` | 1 |
| 3 | `epa-sop-field-instrument-calibration-2010.pdf` | 2 |
| 3 | `epa-wqs-handbook-ch3-water-quality-criteria.pdf` | 1 |
| 4 | `epa-assessing-monitoring-floatable-debris.pdf` | **0** (bait only) |
| 4 | `noaa-nhabon-framework-workshop-report.pdf` | **0** (bait only) |

Three zeroes, all intentional:

- **6.6 alkalinity** — the pod does not measure alkalinity or ANC. The chapter is a titration
  procedure for a parameter with no sensor, and `CORPUS_SOURCING_BRIEF.md` §4 already lists it
  under review for removal. A fixture that made it answerable would argue against removing it.
- **Both Tier 4 documents** appear only as retrieval bait — named in `must_not`, never in
  `answerable_from`. That is the correct relationship: `documents/README.md` keeps them for event
  *interpretation*, not detection, and the way to test that boundary is a refusal fixture that a
  RAG arm can be pulled off, not a fixture that asks the bot to use them.

---

## 4. Grounding evidence

`EVAL_FIXTURES.md` §7 says a wrong rubric is a bug to be fixed and re-graded. A rubric demanding
a fact the corpus does not contain is worse — it grades every arm as a failure and measures
nothing. Every non-obvious `must_contain` below was located in `data/corpus/corpus.json` before
it was written.

### Tier 2 — USGS NFM A6

| fixture · claim | document | located text |
|---|---|---|
| temperature is verified, not calibrated; ±0.2 °C | 6.1 §2.1 | "Verified Temperature Sensor.— A sensor with documented data quality determined via an annual comparison to a traceable or certified temperature sensor" · "All comparison points must agree within ±0.2°C" |
| in situ check for a deployed sensor | 6.1 §3.3.1 | "verify the calibration of a deployed surface water temperature sensor where the sensor is left at the field site" · "in a flowing section of the water body but not in direct sunlight" · "equilibrate for at least 2 minutes" · "three measurements at least 1 minute apart from each other within a 5-minute span" |
| temperature sensor used to correct another parameter must be ≤ ±0.2 °C | 6.1 §2.1 | "An accuracy specification for a verified sensor is only required if the sensor is bundled onto a multiparameter instrument and is used to correct another water-quality parameter (such as dissolved oxygen or specific conductance). The accuracy of such a sensor is required to be less than or equal to ±0.2°C." |
| cell-constant drift > 2 % means a dirty probe | 6.3 §3.1 | "changes in the cell constant that exceed 2 percent may be the result of a contaminated standard or dirty probe" |
| standards check tolerance | 6.3 §3.0 | "within ±5 μS/cm of the certified values for measurements ≤100 μS/cm or ±3 percent of the certified values for measurements >100 μS/cm are considered accurate and do not warrant recalibration" |
| the standards named, and their ceiling | 6.3 §3.1 | "standard solutions having specific conductance values of 500, 1,413, or 12,900 μS/cm. Select the standard with a specific conductance that is closest to the expected specific conductance of the samples." · §3.0 "Specific conductance standards with certificates of analyses (NIST traceable) with values between 50 and 50,000 μS/cm" |
| conductivity cells contain thermistors | 6.3 §2.1 | "Modern conductivity cells generally contain thermistors used for automatic temperature compensation... malfunctioning thermistors will produce erroneous specific conductance values." |
| ~2 %/°C is the compensation factor | 6.3 §3.0 | "the linear (0.019–0.020) and nonlinear... temperature-compensation factors (α)" |
| pH slope acceptance window | 6.4 §4.0 | "a pH electrode with an accurate Nernstian response (slope of 95–101 percent of the theoretical Nernstian slope)" · "any noted calibration slope of less than 95 percent or greater than 101 percent indicates probable electrode deterioration" |
| ideal slope 59.16 mV/pH at 25 °C | 6.4 §4.0 | "The ideal slope of the calibration curve at 25 °C, based on the Nernst equation... is 59.16 mV/pH unit" |
| buffer selection and the ±0.05 field check | 6.4 §4.0 | "If pH values are expected to be between 7 and 8, then the standard pH-7 and pH-10.01 buffers (at a minimum) should be selected." · "Recalibration may be necessary if the initial check is more than ±0.05 pH unit different from the value the buffer should return." |
| pH electrode life 12–18 months | 6.4 §8.0 | "the typical useful life expectancy of pH electrodes used in environmental field operation is approximately 12 to 18 months" |
| Eh is not recommended in general | 6.5 opening | "Measurement of redox potential, described here as Eh measurement, is not recommended in general because of the difficulties inherent in its theoretical concept and its practical measurement" · "Eh measurement may show qualitative trends but generally cannot be interpreted as equilibrium values" |
| electroactivity threshold | 6.5 opening | "valid only when redox species are (a) electroactive, and (b) present in the solution at concentrations of about 10-5 molal and higher" |
| 30-minute stabilization caution | 6.5 §6.5.3 | "If the readings do not stabilize within about 30 minutes, record the potential and its drift; assume a single quantitative value is not possible." |
| ORP interferences | 6.5 §6.5.3.A | "Organic matter and sulfide may cause contamination of the electrode surface, salt bridge, or internal electrolyte" · "Hydrogen sulfide can produce a coating on the platinum electrode... if the electrode is left in sulfide-rich water for several hours" · "unstable readings in solutions containing chromium, uranium, vanadium, or titanium ions" |
| a single Eh does not represent the system | 6.5 §6.5.3.A | "a single Eh measurement generally does not represent the system" |
| Eh is not a routine field measurement | 6.0 table 6.0–1 fn 1 | "Eh is not considered to be a routine or direct field measurement (see National Field Manual (NFM) A6.5)." |
| NTU vs FNU by wavelength | 6.7 §6.7.1.B | "The designations NTU, NTRU, BU, AU, and NTMU signify the use of a broad spectrum incident light in the wavelength range 400-680 nanometers (nm)." · "The designations FNU, FNRU, FBU, FAU, and FNMU generally signify an incident light in the range between 780-900 nm." |
| the defining method geometries | 6.7 table 6.7–4 fns | "EPA Method 180.1 defines the optical geometry for NTU measurements. The detector angle must be 90o ± 30... tungsten lamp with color temperature 2,200 - 3,000 K." · "ISO 7027 defines the optical geometry for FNU measurements. The detector angle must be 90o ± 2.5... LED with wavelength 860 ± 60 nm." |
| the label does not establish the optics | 6.7 §6.7.1.B | "manufacturers might, for the foreseeable future, retain the general use of the measurement unit 'NTU' when referring to calibrants and equipment" |
| units agree on calibrant, not on samples | 6.7 §6.7.1.B | "These reporting units are equivalent when measuring a calibration solution... but their respective instruments may not produce equivalent results for environmental samples." |
| the comparison rule | 6.7 §6.7.1.A | "For a valid comparison of turbidity data over time, between sites, and among projects, use instruments with identical optical and data-processing configurations." |
| fouling biases turbidity **low**, scratches **high** | 6.7 §6.7.1.A, tables 6.7-1/2 | "Sensor fouling, such as biological growth or scratches on the optical surface of the instrument, tends to produce a negative bias when light beams are blocked, but can produce a positive bias if scratches increase the scatter" · table 6.7-2 "Bubbles — Increases apparent light scatter — Positive" |
| most in-situ sonde turbidity sensors are IR/FNU | 6.0 table 6.0–1 fn 3 | "Multiparameter instruments used for most in situ turbidity applications contain single-beam infrared wavelength turbidity sensors and are reported in FNU." |
| no anti-fouling paint | 6.8 §maintenance | "Do not coat the sonde or sensors with protective or anti-fouling paint, except as specifically instructed by the manufacturer." |
| turbidity optics cleaning / wiper | 6.7 table 6.7–7 | "Fouling of optical surfaces. Clean with lint-free cloth or toothbrush." · "The turbidity sensor wiper must be clean, activated, and rotating properly." (6.8 troubleshooting) |
| DO solubility falls with salinity; correct from SC | 6.2 §2.3 | "The solubility of oxygen in water decreases as salinity increases. Correction factors for salinity typically are applied after measuring DO... for DO measurements made with multiparameter instruments that include calibrated specific-conductance sensors, it is wise to activate the instrument's internal salinity correction algorithms." |

### Tier 3

| fixture · claim | document | located text |
|---|---|---|
| there is no temperature calibration, only an annual accuracy check | EPA SOP §5.1 | "Most instrument manuals state there is no calibration of the temperature sensor, but the temperature sensor must be checked to determine its accuracy. This accuracy check is performed at least once per year" |
| continuous instruments are checked on recovery | EPA SOP §4.0 | "Instruments (e.g., sonde) that monitor continuously over a period of time are calibrated before deployment. When these instruments are recovered, the calibration is checked to determine if any of them drifted out of calibration." |
| measurement mode, not calibration mode | EPA SOP §6.0 | "This is performed by placing the instrument in measurement mode (not calibration mode) and placing the probe in one or more of the standards used during the initial calibration" |
| per-parameter post-calibration criteria | EPA SOP §6.0 table | "Dissolved Oxygen ± 0.5 mg/L of sat. value · <0.5 mg/L for the 0 mg/L solution, but not a negative value · Specific Conductance ±5% of standard or ±10 uS/cm (whichever is greater) · pH ±0.3 pH unit with pH 7 buffer · Turbidity ±5% of standard · ORP ±10 mV" — and the conditional above it: "If the quality assurance project plan or the sampling and analysis plan do not list the drift criteria or the post-calibration criteria, use the criteria below." |
| 304(a) criteria are not binding | EPA WQS ch.3 §3.1 | "The EPA's 304(a) criteria recommendations do not impose legally binding requirements. Therefore, they do not substitute for the CWA or regulations, and they are not regulations themselves. In accordance with 40 CFR 131.11, states and authorized Tribes must adopt water quality criteria that '…protect the designated use.'" |

> **The EPA SOP is OCR text.** It is scanned images and its content comes from `.ocr_cache/`
> (`documents/README.md`). Body text is clean; in the criteria table the plus/minus glyph renders
> as a bare `+` and one unit reads `uS/om`. The numbers themselves are unambiguous, and the
> rubrics are written against the numbers, not the glyphs. If a grader sees an arm quote `+0.5`
> rather than `±0.5`, that is the source, not a fabrication.

### Tier 1 (unchanged material, used in new combinations)

| fixture · claim | document | located text |
|---|---|---|
| K 1.0 has no internal temperature sensor | `EC_K_1.0_probe.pdf` | "No — Internal temperature sensor" · "Range 5 − 200,000 μS/cm" |
| only the DO probe has one | `Industrial-DO-probe.pdf` | "Yes (PT-1000) — Internal temperature sensor" |
| pH and ORP probes have none | `IpH_probe.pdf`, `IORP_probe.pdf` | "Internal temp. probe — No" · "No — Internal temperature sensor" |
| pH probe rated ~4 years+ | `IpH_probe.pdf` | "~4 Years + — Life expectancy" · "Working Life ~4+ Years" · "~1 Year — Time before recalibration" |
| conductivity recalibration "not necessary" | `EC_K_1.0_probe.pdf` | "The plates do not go bad, or change, so recalibration is not necessary." |
| bubbles between the graphite plates | `EC_K_1.0_probe.pdf` | "air bubbles, as they can get caught between the two graphite plates and throw off your results" |
| diel cycle, and the event test | source-of-truth §5 | "Diel (24-hour) cycle: DO, pH, and ORP swing predictably each day — peaking mid-afternoon, bottoming pre-dawn" · "A pollution event typically appears as a step-change or sustained excursion that breaks the expected diel/tidal rhythm" |
| negative ORP means reducing/septic | source-of-truth §1 | "Negative values indicate reducing, anoxic, or septic conditions." · "A drop toward or below zero is a strong signal of organic loading, sewage, or decomposition." |
| bloom signature | source-of-truth §4 | algal bloom / eutrophication row: "Large in-phase daily DO + pH oscillations; pre-dawn DO minimum is the danger window" |
| saltwater DO deficit | source-of-truth §1 | "Saltwater holds roughly 20% less DO than freshwater at the same temperature — marine systems sit closer to the hypoxia threshold by default." |
| healthy seawater EC band | source-of-truth §2 | "~45,000–55,000 μS/cm (~35 PSU)" |
| DO threshold ladder | source-of-truth §1 | ">6 mg/L healthy · 4–6 mg/L stress · 2–4 mg/L hypoxic stress · <2 mg/L hypoxia · ~0 anoxia" |
| fouling first, environment second | source-of-truth §6 | "All submerged sensors foul. A gradual multi-parameter drift after a long deployment is a fouling/maintenance flag first, an environmental signal second." |

### One claim deliberately not written

The ORP reference-electrode **correction arithmetic** in NFM 6.5 (`Eh = emf + Eref`, with
half-cell potentials by temperature and KCl concentration in table 6.5–2) is real and would make
an attractive rubric. It is not used, for two reasons: the chapter's PDF renders several of its
tables through a mangled font encoding (`file` reports the extracted text as binary; table 6.5–1
comes out as garbled uppercase), and the column-to-electrode mapping in table 6.5–2 is
reconstructible by a careful human but not reliably by a retriever handed one chunk. Grading an
arm on a number it has to read out of a broken table measures the extractor, not the retrieval
strategy. `crossdoc-orp-reference-offset` already covers the qualitative version of this from
Tier 1, and `eventsig-negative-orp` turn 2 keeps the caveat without the arithmetic.

---

## 5. Two new shapes, and why neither is a new class yet

`EVAL_FIXTURES.md` §8 anticipated one; writing the set surfaced a second. **Both are filed under
existing classes so the set loads today** — `EVAL_CLASSES` in `src/eval/types.ts` is the loader's
whitelist and an unknown class is a hard validation failure. `src/eval/types.ts` was **not
edited**.

### Proposed: `self-referential-follow-up`

`selfref-diel-term` is filed as `follow-up`. It is not one. A `follow-up` fixture chains pronouns
across turns the user wrote; this one asks about a term **the bot introduced**, so the query word
appears in the previous *answer* and never in the user's own text. Retrieval runs up front on the
raw turn (◆G11), which means turn 2 is a bare rare token with no surrounding context — the
sharpest retrieval case on §8's list, and structurally different from anything `follow-up` covers.

§8 warns this may not be gradeable as authored, because correctness depends on what the previous
turn said and that differs per arm. The fix is the one §8 prescribes: **turn 1 is engineered so
that any correct answer introduces the term.** "Diel" is a good choice because the operator
reference's §5 heading is literally *Diel (24-hour) cycle* and an existing fixture
(`followup-diel-swing`) already expects arms to produce the word; turn 1 here enters through pH
rather than DO so the conversation does not duplicate it. The rubric says explicitly what to do
if an arm never says the word: **mark turn 2 unscored for that arm**, do not grade it against a
term the arm did not introduce. If that happens for more than one arm, drop the fixture rather
than rescue it — grading arms on different questions is what §4 rules out.

To adopt: add `"self-referential-follow-up"` to `EVAL_CLASSES` and change this fixture's `class`.

### Proposed: `open-assessment`

`assessment-open-ended-concerns` is filed as `sensor-combined`. It genuinely is one — tool result
plus document context in one answer — but that is not what it tests. Every other fixture in both
sets names something: a metric, a threshold, a document, a time range. This one names nothing
("any concerns with our water right now?"), and what is being graded is **scope selection**: does
the bot make one all-metric call rather than six, compare against the authoritative block rather
than a document band, and decline to invent an event from a single parameter. `sensor-combined`'s
stated purpose is to prove the sensor path is identical across arms, which is the opposite of a
discriminator.

To adopt: add `"open-assessment"` to `EVAL_CLASSES` and change this fixture's `class`.

Neither addition changes the loader's invariants, and neither is urgent — the fixtures grade
correctly under their current classes, only the class histogram misreports.

---

## 6. What needs `sensor-tool`

One fixture, two turns: **`assessment-open-ended-concerns`** (`requires: ["sensor-tool",
"turbidity-in-scope"]`).

`sensor-tool` is derived from the `SENSOR_TOOL` flag rather than hard-coded
(`src/eval/fixtures.ts`), so this is conditional, not permanent:

- `SENSOR_TOOL` **off** — the bake-off default, and what the three captured arms ran against:
  **17 of 18 fixtures, 35 of 37 turns** runnable.
- `SENSOR_TOOL` **on**: all 18, all 37.

Both figures were produced by running `loadFixtures("eval/fixtures-next", ...)` — see §8.

No fixture in this set needs a capability that does not exist. `turbidity-in-scope` resolved
2026-07-29 and is in `AVAILABLE_CAPABILITIES`; four fixtures declare it
(`acronym-ntu-fnu-optics`, `fouling-turbidity-optical-drift`, `refusal-hab-bloom-bait`,
`assessment-open-ended-concerns`).

---

## 7. Sizing the sweep

Turns × arms × passes, the same arithmetic as `EVAL_FIXTURES.md` §6.

| | turns | × 3 arms × 2 passes |
|---|--:|--:|
| This set, full | 37 | 222 LLM calls |
| This set, `SENSOR_TOOL` off | 35 | **210 LLM calls** |
| This set + the committed 30, full | 99 | 594 LLM calls |

**Only two arms can be captured today.** `pgvector-rag`'s runtime is archived
(`eval/README.md`), so a real re-run of this set is 35 × 2 × 2 = **140 LLM calls** unless the
archive is restored first. Deciding that *before* the sweep is the point of writing it down here:
a two-arm capture is a different experiment from the three-arm one ◆G7 rests on, and pretending
otherwise later is how a comparison gets quietly voided.

**The judge is the part people forget.** Grading one pass (grade warm, spot-check ~10% of cold),
one dimension per call:

| | answers | × 3 dimensions |
|---|--:|--:|
| Three arms | 35 × 3 = 105 | **315 judge calls** |
| Two arms | 35 × 2 = 70 | **210 judge calls** |

Plus the human calibration sample at ~20%: ~21 answers for three arms, ~14 for two.

Against the measured direct-feed prompt size (~10,900 tokens for a first turn, growing with
history) this set is smaller than the committed thirty and costs proportionally less — a few
dollars either way. Price it before running, per `RETRIEVAL_BAKEOFF.md` §1, and note as before
that this is the *experiment* cost and says nothing about steady state.

One thing that has changed since §6 was written: **the corpus is 851,891 characters, not 716K**
(it peaked at 1.25M on 2026-08-21 and was trimmed on 2026-08-24). Direct-feed's prompt is
unaffected — the ◆G9 slice was deliberately left alone — but a RAG arm's retrieval now chooses
from 393 chunks instead of 305, so retrieval latency and embedding cost are not comparable to the
N2 numbers even for the arms that still exist.

---

## 8. Loader validation

The set validates against the real loader, not a copy of it. Run from the repo root:

```
$ npx ts-node --transpile-only <scratch>/checkNext.ts eval/fixtures-next
loaded 18 fixtures from eval/fixtures-next
turns: 37 total, 37 runnable          # SENSOR_TOOL on in this .env
runnable fixtures: 18/18

class distribution: {"deep-in-manual":4,"cross-document":3,"refusal":3,"precedence":2,
  "acronym-exact-token":1,"event-signature":1,"fouling-drift":1,"follow-up":1,
  "probe-calibration":1,"sensor-combined":1}
favor distribution: {"rag":7,"tie":9,"direct-feed":2}

$ ... availableCapabilities(false)
SENSOR_TOOL off -> runnable 17/18 fixtures, 35/37 turns
blocked: assessment-open-ended-concerns (sensor-tool+turbidity-in-scope, 2 turns)
```

Every rule in `validateFixture` passes: ids match filename stems, classes and favors are in the
whitelists, `notes` is non-empty everywhere, `answerable_from` ⊆ `DOC_META`, `cite` ⊆
`answerable_from`, every fixture has ≥2 turns, every turn has a non-empty `must_contain` and an
array `must_not`, and both prediction invariants hold — no `rag` fixture is fully inside the ◆G9
slice, and both `direct-feed` fixtures have at least one source inside it.

`test/unit/evalFixtures.test.ts` was **not** changed and still points at `eval/fixtures/` only.
It should stay that way until this set is promoted; pointing CI at both directories would make a
failure here break the pinned control's test.

---

## 9. What would invalidate this set

Everything in `EVAL_FIXTURES.md` §7 applies unchanged, plus two specific to what is written here:

- **A Tier 2 edition change.** Three fixtures depend on facts that exist only in the current
  edition — `acronym-ntu-fnu-optics` is unanswerable on the 1998 turbidity chapter, and
  `deepmanual-temperature-verification` and `deepmanual-ph-slope-acceptance` rest on the 2024 and
  2021 rewrites. Swapping a chapter for a superseded copy does not fail the loader; the filename
  stays the same. It fails the rubric silently, which is worse.
- **Removing a document under review.** `CORPUS_SOURCING_BRIEF.md` §4 lists
  `epa-wqs-handbook-ch3` and both Tier 4 documents as candidates for removal. Removing the EPA
  handbook breaks `refusal-epa-criteria-number` loudly (the loader rejects the unknown filename).
  Removing the Tier 4 documents breaks nothing at load — they appear only in `must_not` — but it
  removes the bait, and `refusal-hab-bloom-bait` and `refusal-floatable-debris` stop testing what
  they were written to test. Re-derive them or retire them; do not leave them in place scoring
  easy passes.
