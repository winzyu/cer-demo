# Eval fixtures — the Phase N2 bake-off question set

> ## ⚠ ARCHIVED SET — this describes fixtures that are no longer in the tree
>
> The 30-fixture / 62-turn set this document specifies was **archived on 2026-09-01** under the tag
> `eval-archive-2026-09-01` (`git show eval-archive-2026-09-01:eval/fixtures/<id>.json`). It was
> replaced because 27 of its 30 fixtures were answerable from 4.4% of the corpus and three carried
> the entire `deep-in-manual` class — a three-sample class mean cannot support a conclusion.
>
> **The live set is 46 fixtures / 92 turns in `eval/fixtures-wave1/`.** For the current design, the
> seven populated classes and the wave-1 exit criteria, read
> [`EVAL_REBUILD.md`](EVAL_REBUILD.md) §2 instead of this file.
>
> Kept because §7's reasoning about rubric wording, the class taxonomy and the pinned-control
> constraint is still cited elsewhere — including by the open question of how a refusal turn should
> be marked, which §7 answers in a way the rebuild has now outgrown.


The fixed conversation set every retrieval arm is graded against, written to
[`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §5 and **committed before any arm runs**. Thirty
conversations, sixty-two turns, one JSON file per conversation in `eval/fixtures/`.

Ordering matters here: rubrics written after seeing an arm's output are not a test, they are a
rationalization. Everything in this document — the classes, the rubrics, and the per-fixture
prediction of which arm wins — is dated to before the first sweep.

Companion docs: [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) (the experiment), [`SPECS.md`](SPECS.md)
(what's built), [`timeline.md`](timeline.md) (phases and gates).

---

## 1. What a fixture is

```jsonc
{
  "id": "threshold-do-hypoxia",          // kebab-case, equals the filename stem
  "class": "threshold-lookup",           // one of the twelve classes in §3
  "expected_to_favor": "direct-feed",    // prediction, recorded before the run
  "answerable_from": ["water-quality-metrics-source-of-truth.pdf"],
  "requires": [],                        // capabilities the service doesn't have yet (§5)
  "notes": "why this conversation is in the set",
  "turns": [
    {
      "role": "user",
      "content": "At what dissolved oxygen level does the water become hypoxic?",
      "rubric": {
        "must_contain": ["gives hypoxia as below 2 mg/L", "..."],
        "must_not": ["invents a threshold absent from the context"],
        "cite": ["water-quality-metrics-source-of-truth.pdf"],
        "notes": "optional grader guidance"
      }
    }
  ]
}
```

`src/eval/fixtures.ts` loads and validates the set; `test/unit/evalFixtures.test.ts` runs that
validation in CI. Malformed fixtures fail at load rather than after three arms have been replayed
and paid for.

**Every turn carries its own rubric.** Every user turn produces an answer, every answer gets
graded, and a conversation-level rubric would hide which turn actually failed — usually the
follow-up, which is the turn the multi-turn format exists to test.

Two fields are **derived at load time, never stored**: `sliceCoverage` (`full` / `partial` /
`none`, computed against `DIRECT_FEED_SLICE`) and `runnable`. Storing them would let them drift
from ◆G9 silently.

Three invariants the loader enforces, because each one catches a class of quiet mistake:

| rule | what it prevents |
|---|---|
| Every `cite` entry appears in `answerable_from` | a rubric demanding a citation the fixture doesn't claim answers it |
| `expected_to_favor: "rag"` ⇒ not every source is in the ◆G9 slice | a "RAG should win" prediction on material direct-feed holds whole |
| `expected_to_favor: "direct-feed"` ⇒ at least one source is in the slice | the mirror image |
| At least two turns | single-turn fixtures can't measure follow-up or pronoun behavior |
| Non-empty `must_contain` | an empty rubric grades every answer — including an empty one — as a pass |

---

## 2. How these get graded

Grading is the separate offline pass described in `RETRIEVAL_BAKEOFF.md` §7b, run over saved
transcripts with arm labels stripped. The rubric fields map onto its three dimensions:

| dimension | scale | read from |
|---|---|---|
| **Correctness** | 0 / 1 / 2 per turn — 0 none of `must_contain`, 1 some, 2 all | `must_contain` |
| **Groundedness** | count of claims not supported by the captured context, per turn | `must_not` + the captured context |
| **Citation validity** | boolean per citation the answer makes | `cite` |

Three properties of these rubrics that the grader depends on:

- **`must_contain` entries are atomic claims, not paraphrases of a model answer.** Each is
  independently checkable, so a partial answer scores 1 rather than being argued over.
- **A `must_not` hit outranks a `must_contain` miss.** An answer that invents a threshold is worse
  than one that omits it. This is the decision rule's quality floor doing its job: groundedness is
  the failure mode that matters, and a cheap wrong answer is not cheap.
- **Refusal is sometimes the correct answer and sometimes a miss, and the fixtures say which.**
  In `deepmanual-*` the material is outside the direct-feed slice, so a refusal there scores 0 on
  correctness but must **not** be penalized on groundedness — confabulating a plausible USGS
  procedure is the real failure. In `refusal-*` a refusal *is* the 2.

**Grade one pass, not both.** Temperature is pinned to 0, so cold and warm passes should differ in
cost and latency, not in text. Grade the warm pass and spot-check ~10% of cold transcripts against
it; if they diverge, the temperature pin is broken and the run is void.

---

## 3. The classes

Twelve classes, 30 conversations. The first nine are `RETRIEVAL_BAKEOFF.md` §5's list; the last
three are new, and exist because the corpus was rescoped to what the DataPod measures — probe
calibration and fouling became answerable, and pollutant-criteria lookups stopped being.

| class | n | what it discriminates | predicted |
|---|--:|---|---|
| `definitional` | 3 | baseline competence — an arm that fails here is broken, not worse | tie |
| `acronym-exact-token` | 3 | NTU/FNU, EC vs specific conductance, "KCl creep" — rare tokens that dense retrieval underweights, the reason the legacy build was hybrid | direct-feed |
| `threshold-lookup` | 2 | numeric bands read verbatim, plus the caveats attached to them | direct-feed |
| `cross-document` | 3 | 2–4 documents needed in one answer; top-k 5 has to spend its slots correctly | direct-feed |
| `deep-in-manual` | 3 | material only in the long manuals, which the ◆G9 slice excludes | RAG |
| `follow-up` | 2 | pronoun chains across three turns with no restated nouns | tie |
| `precedence` | 3 | operator ranges outrank documents, including when the user pushes back with the document | tie |
| `refusal` | 3 | refusing cleanly instead of confabulating — and not over-refusing afterwards | direct-feed |
| `probe-calibration` | 2 | per-probe intervals that differ from each other | direct-feed |
| `fouling-drift` | 2 | instrument failure modes vs. water chemistry | direct-feed |
| `event-signature` | 2 | the multi-parameter signature matrix — a table | direct-feed |
| `sensor-combined` | 2 | document context surviving alongside a tool result | tie |

Predictions across the set: **17 direct-feed, 3 RAG, 10 tie.** That imbalance is not a thumb on
the scale — it is what ◆G9 chose. The slice is the operator reference plus four probe datasheets,
so most questions about *measured parameters and the probes that measure them* are inside it by
construction, and the manuals sit outside. The prediction ledger exists so that a result matching
it counts for less than a result contradicting it.

### Fixtures worth knowing about individually

- **`crossdoc-do-drift-vs-hypoxia`** — the flagship. A DO slide over three weeks has a water
  explanation (hypoxia) and an instrument explanation (electrolyte depletion), and turn 2 springs
  a trap: the operator reference's fouling caveat is written about *optical* DO sensors, while the
  deployed Atlas probe is *galvanic*. An arm that retrieves one document answers fluently and
  wrongly.
- **`probecal-conductivity-interval`** — the conductivity probe needs essentially no recalibration
  (graphite plates don't change), which contradicts the ~1-year pattern of the other three
  datasheets. Retrieve the wrong datasheet and you get a confident "~1 year".
- **`crossdoc-recalibration-schedule`** — needs four datasheets in one answer. With top-k 5, a RAG
  arm has to get four of five slots right.
- **`refusal-pathogens`** — the volunteer manual, *outside* the slice, contains a full
  fecal-bacteria chapter. A RAG arm can retrieve on-topic-looking text and be pulled toward
  answering a question the service must refuse; direct-feed structurally cannot see it. The one
  place where the slice's narrowness is the advantage.
- **`refusal-nutrients`** turn 2 — there is a *grounded* inference available (particles carry
  adsorbed phosphorus, so a turbidity spike proxies for loading) that must not become a reported
  nutrient value. Blanket refusal fails this turn; so does answering with a number.
- **`acronym-kcl-creep`** — one page of two datasheets, semantically unlike anything else in the
  corpus. The sharpest exact-token probe in the set.
- **`deepmanual-turbidity-optics`** — turn 1 is manual-only, turn 2 is slice-only. If one arm wins
  each turn, that is the split outcome §8 calls a legitimate result, visible inside a single
  conversation.

---

## 4. What the set deliberately does not test

- **Sampling variance.** Temperature is pinned to 0. If the budget allows k=3 repeats, do it and
  report the residual spread; otherwise say so.
- **Tool-calling behavior.** Retrieval runs up front in every arm (◆G11), so the two
  `sensor-combined` fixtures exist to prove the sensor path is identical across arms, not to
  discriminate between them.
- **Anything about pollutants the DataPod cannot measure.** Metals, pesticides, pathogens and
  nutrients were removed from the corpus; questions about them appear only as refusal fixtures.
- **The `stub` adapter.** It is the harness control from N1, not a strategy. Running the set
  against it once is still worth doing — a stub transcript that looks reasonable means the rubrics
  are too loose.

---

## 5. What runs, and what the runnable set depends on

Requirements are recorded in each fixture's `requires` field and resolved against
`AVAILABLE_CAPABILITIES` (`src/eval/fixtures.ts`). **The runnable set is 28 of 30 fixtures (58 of
62 turns) on the default configuration, and 30 of 30 with `SENSOR_TOOL=true`.**

### `sensor-tool` — 2 fixtures, 4 turns · **built 2026-08-13, gated on a flag**

`query_sensor_data` and the tool-round orchestration loop landed in N3. They are not missing any
more; they are **off by default**, because the tool block changes the pinned system prompt while
◆G7 is open (`RETRIEVAL_BAKEOFF.md` §4).

`availableCapabilities()` is **derived from that same flag** rather than hard-coded, and the
derivation is what keeps the eval honest in both directions. With the flag off, a sweep replays
exactly the 28 fixtures the three captured arms ran, so it stays comparable to them. With it on,
all 30 run. Hard-coding `sensor-tool` as available would let a default-configured sweep "run" two
fixtures against a tool the model was never offered, and grade the resulting refusals as answers.

The two `sensor-combined` conversations discriminate little between arms by design — the sensor
path is held constant across arms — so the headline comparison never waited for them.

### `turbidity-in-scope` — 7 fixtures · **resolved 2026-07-29**

The system prompt used to declare turbidity unmeasured, which meant every turbidity question was
refused before retrieval was consulted: all three arms would have scored identically and the eval
would have measured the prompt. Turbidity is now listed as measured, in NTU, with an operator
range in the authoritative block — `0-25 NTU` freshwater, `0-10 NTU` saltwater, derived from §2 of
the operator's own source-of-truth reference. The low end is 0, not 5, because **0 is a valid
turbidity reading** and must never be flagged as erroneous (same rule as ORP).

Two fixtures changed as a direct result, and both got *better* rather than merely unblocked:

- **`threshold-turbidity-estuary`** moved from `threshold-lookup` to `precedence`. With an operator
  range in play, 60 NTU is simultaneously normal for an estuary by the document and above the
  operator range for this freshwater deployment — a real conflict rather than a lookup.
- **`acronym-ntu-fnu`** turn 2 ("which one does our sensor use?") previously had no grounded
  answer and tested a scoped refusal. It now has one: NTU, from the operator block.

Because §4 pins the system prompt as a control, this had to land **before** the first arm runs.
Changing it later voids every completed arm.

## 6. Sizing the sweep

| | turns | × 3 arms × 2 passes |
|---|--:|--:|
| Full set | 62 | 372 LLM calls |
| Runnable with `SENSOR_TOOL` off | 58 | **348 LLM calls** |

Against the measured direct-feed prompt size (~10,900 tokens for a first turn, growing with
history) and measured completions of 235–4,060 tokens, the runnable sweep is on the order of
2–3M tokens total across all three arms — a few dollars, not a budget item. **The judge is the
part people forget:** grading one pass, one dimension per call, is 174 answers × 3 dimensions =
**522 judge calls**, plus the human calibration sample (~20%, ~35 answers).

Price both before running, per `RETRIEVAL_BAKEOFF.md` §1. Note that this is the *experiment* cost
and says nothing about the steady-state cost the decision is actually about.

---

## 7. What would invalidate this set

Re-derive the fixtures, don't reinterpret old results, if any of these change:

- **The corpus changes.** `answerable_from` names filenames; the loader rejects unknown ones, so
  a removed document fails the test suite rather than silently mis-grading.
- **The ◆G9 slice changes.** `sliceCoverage` and both prediction invariants are computed from
  `DIRECT_FEED_SLICE`. A slice change can turn a `deep-in-manual` fixture into an in-slice one.
- **The system prompt changes.** It is a pinned control — the turbidity fix in §5 was the last
  change it is allowed to receive before the sweep.
- **`LLM_MODEL` changes.** Cross-model comparisons are void (§4).
- **A rubric turns out to be wrong.** Fix it and re-grade from the saved transcripts; that is why
  transcripts are committed separately from scores. Do not quietly re-run a paid sweep.

---

## 8. Candidate fixtures from real production usage (2026-08-20)

**These are not in the set and must not be added to it while ◆G7 is open.** Adding a fixture
changes the question set, and the three captured arms answered the committed 30. They are recorded
here as the queue for the *next* sweep, which is exactly the disposition `RETRIEVAL_BAKEOFF.md`
§7c prescribes for anything discovered outside the scripted run.

Source: the chat-history sidebar visible in the vendor's product guide (`migration/DEVICE_API.md`
§14c) — real questions asked of the **existing** Gilligan by real users, dated late 2024 / early
2025. That provenance is what makes them worth more than anything we would invent: our 30 were
written by us, predicting what users would ask.

| candidate question | class | why it earns a slot |
|---|---|---|
| "what is DOM which you referred to?" | **new class — self-referential follow-up** | The user asks about a term **the bot itself introduced**. Nothing in the current set covers this. It is a genuinely hard retrieval case: the query word appears in the *previous answer*, not in the user's original question, and up-front retrieval (◆G11) runs on the raw turn. A direct-feed arm has the slice regardless; a RAG arm has to retrieve on a bare acronym with no surrounding context. This is the sharpest discriminator on this list. |
| "What would a negative ORP for [a site] mean?" | `definitional` / `event-signature` | We have `definitional-orp` and `crossdoc-orp-reference-offset`, but nothing asks the sign question directly, and negative ORP is the reducing-condition signal the event-signature matrix turns on. |
| "what is the optimal range for [metric]?" | `precedence` | Phrased as "optimal" rather than "normal" — the operator range is authoritative, and the word *optimal* invites the model to reach for a document's general guidance instead. A precedence trap in different clothing. |
| "are there any concerns [with my water]?" | **new shape — open-ended assessment** | No metric, no threshold, no time range. Every fixture we have names something. This is what a non-technical user actually types, and it requires the bot to choose what to look at. Note it needs the sensor tool, so it would be `requires: ["sensor-tool"]`. |

Two notes before any of these are written up:

- **Rubrics must be written before the next sweep runs**, same rule as §1. A rubric written against
  an observed answer is a rationalization.
- **The self-referential follow-up may not be gradeable as-is.** Its correctness depends on what
  the *previous* turn said, which differs per arm. It probably has to be authored as a fixed
  two-turn conversation where turn 1 is engineered to introduce the term reliably — otherwise the
  arms are being graded on different questions, which §4 rules out.
