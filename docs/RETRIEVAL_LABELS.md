# Retrieval ground-truth labels

Chunk-level relevance judgements for every user turn in both fixture sets, so retrieval quality can
be measured offline, deterministically, in seconds, with no LLM in the loop.

Built **2026-08-25** against `data/corpus/corpus.json` (`generatedAt` 2026-08-25T05:07:40Z — 15
documents, 393 chunks) and the fixtures as committed on that date.

One file per fixture: `eval/retrieval-labels/<fixtureId>.json`, matching `FixtureLabels` in
[`../src/eval/retrieval/types.ts`](../src/eval/retrieval/types.ts) exactly.

Companion docs: [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md) (what a fixture is, the twelve classes),
[`SPECS.md`](SPECS.md) (what's built), [`../documents/README.md`](../documents/README.md) (the corpus).

---

## 1. What this measures, and what it does not

It answers one question: **given a query, did the adapter put the right chunks in front of the
model?** That is a *necessary* condition for a good answer, not a sufficient one. A perfect recall
score says the material was available; it says nothing about what the model then did with it. The
same caution `HANDOFF.md` §4 attaches to the sweep's retrieval-miss rate applies here.

The point is the ordering: retrieval failures are unrecoverable downstream, so ruling them out
first is the cheapest thing to check. Today the only alternative is replaying 58 conversations
against an LLM and grading them by hand — hours and real money per iteration.

## 2. Coverage

| | fixtures | user turns |
|---|--:|--:|
| `eval/fixtures/` (the committed 30) | 30 | 62 |
| `eval/fixtures-next/` (the proposed 18) | 18 | 37 |
| **total** | **48** | **99** |

**259 chunk labels** across those turns: 118 at grade 2, 128 at grade 1, 13 at grade 0.
**20 turns carry `noRelevantChunks`** instead (§5).

Positive labels touch **72 distinct chunks of 393** — 18% of the corpus. That is expected: the
fixtures were written against a much smaller corpus and the operator reference carries most of
what they ask for.

| class | fixtures | turns | `noRelevantChunks` | grade 2 | grade 1 | grade 0 |
|---|--:|--:|--:|--:|--:|--:|
| `acronym-exact-token` | 4 | 8 | 1 | 11 | 14 | 1 |
| `cross-document` | 6 | 12 | 2 | 20 | 23 | 0 |
| `deep-in-manual` | 7 | 14 | 0 | 24 | 26 | 0 |
| `definitional` | 3 | 6 | 0 | 8 | 7 | 0 |
| `event-signature` | 3 | 6 | 0 | 9 | 10 | 0 |
| `follow-up` | 3 | 9 | 2 | 7 | 13 | 0 |
| `fouling-drift` | 3 | 6 | 0 | 10 | 5 | 0 |
| `precedence` | 5 | 10 | 2 | 9 | 9 | 0 |
| `probe-calibration` | 3 | 6 | 1 | 8 | 4 | 5 |
| `refusal` | 6 | 12 | 8 | 4 | 8 | 7 |
| `sensor-combined` | 3 | 6 | 3 | 4 | 4 | 0 |
| `threshold-lookup` | 2 | 4 | 1 | 4 | 5 | 0 |

Positive labels per document:

| document | positive labels |
|---|--:|
| `water-quality-metrics-source-of-truth.pdf` | 109 |
| `usgs-nfm-a6.7-turbidity.pdf` | 18 |
| `Industrial-DO-probe.pdf` | 14 |
| `usgs-nfm-a6.2-dissolved-oxygen.pdf` | 14 |
| `usgs-nfm-a6.4-ph.pdf` | 14 |
| `EC_K_1.0_probe.pdf` | 12 |
| `IpH_probe.pdf` | 12 |
| `IORP_probe.pdf` | 10 |
| `usgs-nfm-a6.3-specific-conductance.pdf` | 10 |
| `usgs-nfm-a6.5-orp.pdf` | 8 |
| `usgs-nfm-a6.1-temperature.pdf` | 7 |
| `usgs-nfm-a6.8-multiparameter-instruments.pdf` | 7 |
| `epa-sop-field-instrument-calibration-2010.pdf` | 7 |
| `usgs-nfm-a6.0-field-measurement-guidelines.pdf` | 4 |
| `usgs-nfm-a6.6-alkalinity.pdf` | **0** |

**No fixture in either set reaches the alkalinity chapter.** Alkalinity is not one of the six
measured parameters, so no question in the set asks for it. 36 chunks (9% of the corpus) are
therefore unreachable by this label set and will only ever appear as false positives.

## 3. The grading scale

Three grades, from `RELEVANCE_GRADES` in the contract:

- **2** — the chunk answers the query on its own.
- **1** — it supports or partially answers the query; it belongs in the context window but is not
  sufficient by itself.
- **0** — considered and rejected. Recorded rather than omitted, so a near-miss that keeps getting
  retrieved is distinguishable from a chunk nobody ever looked at.

Two conventions worth knowing, because they change how a score reads:

- **A question with N independent parts gets N grade-1 chunks, not N grade-2 chunks.**
  `crossdoc-recalibration-schedule` turn 1 asks for four intervals from four datasheets; no chunk
  answers it alone, so all eight contributing chunks are grade 1 and the turn has no grade 2 at all.
  nDCG on that turn measures ordering among equals, which is the honest reading.
- **Grade 0 is reserved for chunks that are topically close and actually wrong** — the pH and ORP
  "how often do you need to recalibrate" pages against a *conductivity* interval question, the
  stabilization-criteria tables against a *post-calibration drift* question. It is not used for a
  chunk that would be correct if the query had been rewritten; those turns get `noRelevantChunks`
  and are listed in §5.

## 4. How the set was built

Every label was verified against real chunk text. There are no inferred labels: nothing was
labelled because a document "probably" covers a topic.

1. The direct-feed slice (five Tier 1 documents, 16 chunks, 37,660 chars) was read in full.
2. Everything else was located with keyword and regex sweeps over `corpus.json`, and each candidate
   chunk was then read whole before being graded.
3. The `evidence` string is not typed by hand. Each label names a target sentence; a whitespace-
   tolerant matcher pulls the **exact span out of the chunk text** and stores that. A target that
   does not match hard-fails the build, so an evidence string that is not in its chunk cannot be
   written in the first place.
4. Labels follow **what answers the query**, not the fixture's `answerable_from` field. That field
   is document-level and predates the corpus expansion; §6 lists every place the two disagree.
5. Turn 2+ queries are labelled **as literally asked**. Retrieval runs on the raw turn with no
   conversation rewriting — gate ◆G11 is still open — so that is what the adapter receives. §5 is
   the direct consequence.

### Chunk overlap

Chunks overlap: each one repeats the tail of its predecessor. The same sentence therefore lives in
two chunks fairly often (the DO hypoxia bands, the pH fresh/salt line, the "for a valid comparison"
rule in NFM 6.7). Where both copies are genuinely retrievable both are labelled, usually 2 and 1.
That inflates recall slightly relative to a non-overlapping corpus and is a property of the
chunker, not of the labels.

## 5. The 20 `noRelevantChunks` turns

Three distinct reasons, and they mean different things.

### 5a. Unanswerable in isolation — 9 turns · **this is the finding**

These turns are pure deixis. Read alone — which is exactly how the adapter reads them — they name
no parameter, instrument, procedure or symptom, and no chunk in the corpus answers them. The
material that answers the *conversation* exists; the material that answers the *query* does not.

| fixture | turn | query |
|---|--:|---|
| `crossdoc-orp-reference-offset` | 2 | "So what should I compare instead?" |
| `crossdoc-ph-electrode-life` | 2 | "That's not a budget number. Which one do I plan around?" |
| `followup-diel-swing` | 3 | "When should I be worried about it?" |
| `precedence-conductivity-range` | 2 | "What would push it that low?" |
| `probecal-ph-interval` | 2 | "Which of those applies to us?" |
| `refusal-floatable-debris` | 2 | "Would it move any of the numbers at all, even indirectly?" |
| `selfref-diel-term` | 3 | "So when does it stop being that and start being a problem?" |
| `threshold-do-hypoxia` | 2 | "And what would you call 5.2?" |
| `threshold-turbidity-estuary` | 2 | "We're at 60 — should I be worried?" |

The last two are the sharpest, because both are bare numbers. "5.2" is a plausible DO concentration
and a plausible pH. "60" is a plausible NTU, µS/cm and mV reading, and the fixture's own point is
that 60 NTU is simultaneously normal by the document and abnormal by the operator range — a
distinction the raw turn cannot even reach.

**This is 9 of 99 turns — 9% of the set — where no retrieval strategy can succeed, because the
query does not contain the question.** It is direct evidence for query rewriting, and it is
measurable: an adapter cannot be scored above zero on these turns until ◆G11 closes. When rewriting
lands, these nine are the turns to re-label first, and the delta on them is the feature's headline
number.

**The criterion is mechanical, so you can disagree with a specific row.** A turn goes in this table
only when it contains **no domain content word at all** — no parameter, unit, instrument, procedure,
symptom or event. Words like "number", "budget", "low", "worried" and bare numerals do not count.
Turns that keep one weak domain anchor were labelled, not listed here; they are §5d.

### 5b. Nothing in the corpus answers it — 8 turns

Refusal turns, plus one prompt-level lookup. These are the ones where returning nothing is correct
(`QueryScore.correctlyEmpty`).

| fixture | turn | why |
|---|--:|---|
| `acronym-ntu-fnu` | 2 | "Which one does our sensor use?" — the unit is in the operator block of the system prompt, not in any document. |
| `refusal-nutrients` | 1 | No chunk reports a nitrate or phosphorus concentration. |
| `refusal-out-of-domain` | 1 | No tide table, no weather forecast. |
| `refusal-pathogens` | 1 | See below. |
| `refusal-pathogens` | 2 | See below. |
| `refusal-epa-criteria-number` | 2 | No regulatory or legal DO criterion exists anywhere in the corpus. |
| `refusal-floatable-debris` | 1 | Nothing describes detecting, counting or characterising floating debris. |
| `refusal-hab-bloom-bait` | 1 | Nothing measures chlorophyll, algal cell counts or toxins. |

`refusal-pathogens` was checked exhaustively rather than assumed: the strings `fecal`, `coliform`,
`E. coli`, `Escherichia` and `swim` appear in **none of the 393 chunks**. The volunteer manual left
the corpus on 2026-08-21 and took the whole fecal-bacteria chapter with it. The one chunk containing
the word `pathogens` is the operator reference's turbidity paragraph, and it is recorded at grade 0
because it is exactly what a lexical match will surface.

`documents/README.md` still warns that a RAG arm can be pulled off this refusal by retrieving
on-topic-looking text. **On the current corpus that bait is gone for pathogens, nutrients, HAB
toxins and floatable debris** — all four source documents have been removed. The grade-0 entries in
those fixtures record what is left.

Seven grade-0 near-misses sit in the refusal class for this reason. They are the near-misses to
watch: `refusal-epa-criteria-number` turn 2 carries two, because the corpus is full of plausible DO
numbers (`>6 mg/L healthy`, `6–11 mg/L`) that must not be promoted into a legal limit.

### 5c. Answered by the sensor tool — 3 turns

`sensor-doc-do-normal` turn 1, `sensor-doc-event-check` turn 1, `assessment-open-ended-concerns`
turn 1. These are `query_sensor_data` calls. No document carries a live or historical reading, and
the operator's normal ranges are in the system prompt. Retrieval has nothing correct to return.

### 5d. Labelled, but with a weak anchor

These were labelled rather than listed in §5a, and are the rows most likely to be argued about. Each
keeps exactly one domain word carrying the retrieval:

`crossdoc-recalibration-schedule` T2 ("deployment") · `followup-fouling-cleaning` T2 ("water",
"pod") and T3 ("clean") · `fouling-orp-span-loss` T2 ("cleaning") · `deepmanual-do-calibration-procedure`
T2 ("field site") · `deepmanual-stabilization-criteria` T2 ("depth") · `eventsig-negative-orp` T2
("trust the number", "moves around") · `assessment-open-ended-concerns` T2 (open-ended, not
anaphoric) · `refusal-hab-bloom-bait` T2 ("our six readings") · `acronym-ntu-fnu-optics` T2
("sonde readings") · `sensor-doc-do-normal` T2 ("the reference", "that level").

If a scored run shows these clustering at the bottom, treat that as the same ◆G11 evidence rather
than as a retrieval regression.

## 6. Where the labels disagree with `answerable_from`

Fourteen fixtures. `answerable_from` is document-level, was written before the 2026-08-21 expansion,
and the loader only checks that `cite` entries appear in it — nothing forces it to be complete.
None of these is a fixture bug; they are stale or conservative document lists.

### A better chunk exists in a document the fixture never names — 10

| fixture | document not named | what it carries |
|---|---|---|
| `acronym-ntu-fnu` | `usgs-nfm-a6.7-turbidity.pdf`, `usgs-nfm-a6.0` | 6.7 §6.7.1.B defines NTU (400–680 nm) and FNU (780–900 nm) by wavelength and states they are equivalent only on a calibration solution. A6.0 table 6.0–1 footnote 3 adds that in-situ sensors are usually infrared and reported in FNU. The fixture grounds this in the operator reference's two-line caveat only. `deepmanual-turbidity-optics` already notes the same shift; `acronym-ntu-fnu` does not. |
| `acronym-kcl-creep` | `Industrial-DO-probe.pdf` | The DO datasheet carries the same "KCl CREEP" page as the pH and ORP datasheets ("Dried KCl residue from Electrolyte solution"). The fixture names only pH and ORP. This is a third near-identical chunk competing for the same top-k slot — worth knowing for a fixture whose whole purpose is exact-token retrieval. |
| `deepmanual-stabilization-criteria` | `usgs-nfm-a6.0` | A6.0 table 6.0–1 carries the same five stabilization criteria as TM 9-A6.8 table 6.8–5. The fixture is labelled `deep-in-manual` on the assumption that 6.8 is the only source; there are two, in two documents, both outside the slice. |
| `definitional-orp` | `usgs-nfm-a6.5-orp.pdf` | The ORP chapter's formal definition of Eh. Grade 1 — the operator reference and the datasheet answer the turn — but it is a real third source the fixture predates. |
| `selfref-diel-term` | `usgs-nfm-a6.4-ph.pdf` | TM 9-A6.4 §2.1 uses the exact term: "commonly exhibit diel fluctuations in pH as a result of photosynthesis, respiration, and temperature". The whole design of this fixture is that turn 2 is a bare rare token; a RAG arm has a second document to land on, which the fixture's prediction does not account for. |
| `refusal-nutrients` | `usgs-nfm-a6.7-turbidity.pdf` | 6.7 §6.7.3.B states turbidity data are used "for correlation with concentrations of suspended sediment, total phosphorus, or other chemical constituents". That is independent grounding for turn 2's phosphorus-proxy inference, from a document the fixture does not name. |
| `crossdoc-conductivity-temp-sensor` | `water-quality-metrics-source-of-truth.pdf` | Turn 2's ~2 %/°C figure is stated directly in the operator reference (§3 and §6). The fixture's own note says so and grounds it twice, but the reference is missing from `answerable_from`. |
| `acronym-ec-specific-conductance` | `EC_K_1.0_probe.pdf` | The datasheet's operating-principle page defines electrical conductivity. Grade 1 support only. |
| `definitional-conductivity` | `EC_K_1.0_probe.pdf` | Same. |
| `followup-fouling-cleaning` | `Industrial-DO-probe.pdf` | Turn 3 asks what to clean the probes with. The DO datasheet has its own cleaning page and its own hard safety line ("DO NOT USE A BRUSH TO CLEAN THE MEMBRANE"). The fixture names pH, ORP and conductivity only — a four-probe pod with a three-probe rubric. |

### A named document contributes nothing I could verify — 4

| fixture | document named | finding |
|---|---|---|
| `probecal-post-deployment-drift-check` | `usgs-nfm-a6.0` | A6.0 contains no "calibration check", "drift" or post-recovery material at all. The EPA SOP carries the entire answer for both turns. |
| `crossdoc-do-salinity-correction` | `Industrial-DO-probe.pdf` | The DO datasheet's only mention of salt is "can be fully submerged in fresh or salt water" — a survivability claim, not a solubility or correction claim. Nothing in it bears on either turn. |
| `probecal-ph-interval` | `water-quality-metrics-source-of-truth.pdf` | Only turn 2 would have used it, and turn 2 is unanswerable in isolation (§5a). |
| `refusal-floatable-debris` | `water-quality-metrics-source-of-truth.pdf` | Turn 1 has no answer in the corpus; turn 2 is unanswerable in isolation (§5a). The fixture's grounded turn-2 answer exists only once the antecedent is restored. |

## 7. What was not verified

- **OCR fidelity.** `epa-sop-field-instrument-calibration-2010.pdf` is scanned, and its criteria
  table reads `+ (.5 mg/L`, `+ 10 uS/om`, `+10 mv` where the original prints ± signs and µS/cm. The
  evidence strings reproduce the OCR text exactly, because that is what the retriever sees, but they
  have **not** been checked against the source PDF. If the OCR cache is regenerated the
  `probecal-post-deployment-drift-check` turn-2 label will need re-cutting.
- **Whether these are the *only* relevant chunks.** The labels are a floor, not a closed set. A
  chunk absent from a turn's list has not necessarily been rejected — only grade-0 entries carry
  that meaning. Recall against this set is therefore a lower bound on true recall.
- **Nothing was run against an adapter.** `loadLabels` (`src/eval/retrieval/labels.ts`) accepts all
  48 files, but these labels have never been used to score a retrieval run. No number produced by
  `npm run retrieval:eval` has been sanity-checked against them.
- **The `answerable_from` disagreements in §6 were not fixed.** Changing a fixture changes the
  question set, and `EVAL_FIXTURES.md` §8 forbids that while ◆G7 is open.

## 8. What would invalidate this set

- **The corpus changes.** Chunk ids are content-derived (`src/ingestion/chunk.ts`), so a label
  survives edits elsewhere in a file and a document rename — `contentHash` reconciles the second
  case. It does **not** survive a change to the chunk's own text, a chunker parameter change, or a
  document being removed. Re-run the verification script (§9) after any ingest; a label pointing at
  a chunk id that no longer exists is exactly what it catches.
- **The chunker changes.** Chunk size or overlap changes every id in the corpus at once. The whole
  set has to be rebuilt, not patched.
- **A fixture's turn text changes.** Queries are stored verbatim and checked against the fixture at
  build time. Editing a turn breaks the label file for that fixture loudly, which is the intent.
- **◆G11 closes.** With query rewriting in front of retrieval, the nine §5a turns stop being
  unanswerable and need real labels. Scores across that boundary are not comparable.
- **A label turns out to be wrong.** Fix the label and re-score; do not reinterpret an old run. A
  wrong label is worse than a missing one — it makes a good retriever look bad forever, silently.

## 9. Verifying the set

`loadLabels` in [`../src/eval/retrieval/labels.ts`](../src/eval/retrieval/labels.ts) loads all 48
files clean — 48 fixtures, 99 queries — so chunk-id existence and evidence-substring validation pass
against the project's own loader.

The set was additionally checked with a throwaway script covering what the loader does not, for all
48 files:

- parses the JSON and confirms `fixtureId` matches the filename stem;
- confirms every `fixtureId` names a real fixture, and that `set` and `fixtureClass` match it;
- confirms the labelled turn count, numbering and **verbatim query text** match the fixture's user
  turns;
- confirms every `chunkId` and every `contentHash` exists in `data/corpus/corpus.json`, that the
  hash resolves back to that same chunk, and that `filename` matches the chunk's document;
- confirms every `grade` is 0, 1 or 2, and that no chunk is listed twice in one turn;
- confirms **every `evidence` string is a genuine substring of the chunk it cites**;
- confirms each turn either has a grade>0 chunk or a non-empty `noRelevantChunks` reason, never both.

Result on 2026-08-25 (the standalone check):

```
files: 48  fixtures covered: 48/48
committed: 30  next: 18
labelled turns: 99   noRelevantChunks turns: 20
graded chunk labels: grade2=118 grade1=128 grade0=13  total=259
evidence strings verified as verbatim substrings: 259
PASS — no problems found
```

The extra checks — verbatim query text against the fixture, `set`/`fixtureClass` agreement with the
fixture, duplicate chunk ids within a turn, and `noRelevantChunks` never co-existing with a grade>0
chunk — are not in `loadLabels` and are not in CI. They are worth adding next to
`test/unit/evalFixtures.test.ts`.
