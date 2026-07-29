# Eval fixtures — the Phase N2 bake-off question set

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
| `threshold-lookup` | 3 | numeric bands read verbatim, plus the caveats attached to them | direct-feed |
| `cross-document` | 3 | 2–4 documents needed in one answer; top-k 5 has to spend its slots correctly | direct-feed |
| `deep-in-manual` | 3 | material only in the long manuals, which the ◆G9 slice excludes | RAG |
| `follow-up` | 2 | pronoun chains across three turns with no restated nouns | tie |
| `precedence` | 2 | operator ranges outrank documents, including when the user pushes back with the document | tie |
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

## 5. Two blockers: what cannot run today

Both are recorded in `requires` on the affected fixtures, and both make an arm's score reflect
something other than retrieval if ignored. `AVAILABLE_CAPABILITIES` in `src/eval/fixtures.ts` is
empty, so **22 of 30 fixtures (46 of 62 turns) are runnable today.**

### `turbidity-in-scope` — 7 fixtures, 14 turns

The system prompt (`src/prompt/systemPrompt.ts`) still says:

> The sensor measures dissolved oxygen, ORP, pH, conductivity, and temperature. It does NOT
> measure pathogens, bacteria, chemicals, or turbidity.

That is stale. Turbidity is one of the six measured parameters, the corpus was rescoped around it,
and ◆G9's slice covers it. As written, **every turbidity question is refused before retrieval is
consulted** — all three arms score identically, and the eval measures the system prompt.

The fix is Phase N4's "system-prompt range block" item, pulled forward: move turbidity out of the
NOT-measured list, add it to the in-scope list, and add an operator normal range for it. The range
is the blocking part — it needs a person, not code, and the corpus gives only general guidance
(freshwater <5–25 NTU, estuarine 5–100+ NTU). `threshold-turbidity-estuary` deliberately checks
that no arm invents one.

Because §4 pins the system prompt as a control, this has to be settled **before** the first arm
runs. Changing it mid-experiment voids every completed arm.

### `sensor-tool` — 2 fixtures, 4 turns

`query_sensor_data` and the tool-round orchestration loop land in N3. Until then the two
`sensor-combined` conversations are committed but unrunnable. They discriminate little between
arms by design, so the headline comparison does not wait on them.

---

## 6. Sizing the sweep

| | turns | × 3 arms × 2 passes |
|---|--:|--:|
| Full set | 62 | 372 LLM calls |
| Runnable today | 46 | **276 LLM calls** |

Against the measured direct-feed prompt size (~10,900 tokens for a first turn, growing with
history) and measured completions of 235–4,060 tokens, the runnable sweep is on the order of
2–3M tokens total across all three arms — a few dollars, not a budget item. **The judge is the
part people forget:** grading one pass, one dimension per call, is 138 answers × 3 dimensions =
**414 judge calls**, plus the human calibration sample (~20%, ~28 answers).

Price both before running, per `RETRIEVAL_BAKEOFF.md` §1. Note that this is the *experiment* cost
and says nothing about the steady-state cost the decision is actually about.

---

## 7. What would invalidate this set

Re-derive the fixtures, don't reinterpret old results, if any of these change:

- **The corpus changes.** `answerable_from` names filenames; the loader rejects unknown ones, so
  a removed document fails the test suite rather than silently mis-grading.
- **The ◆G9 slice changes.** `sliceCoverage` and both prediction invariants are computed from
  `DIRECT_FEED_SLICE`. A slice change can turn a `deep-in-manual` fixture into an in-slice one.
- **The system prompt changes** — including the turbidity fix above. It is a pinned control.
- **`LLM_MODEL` changes.** Cross-model comparisons are void (§4).
- **A rubric turns out to be wrong.** Fix it and re-grade from the saved transcripts; that is why
  transcripts are committed separately from scores. Do not quietly re-run a paid sweep.
