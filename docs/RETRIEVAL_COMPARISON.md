# Retrieval Comparison — ◆G7

> **STATUS: ◆G7 IS OPEN, AND THE DATA IS WHY.** This is the deliverable specified in
> [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §10. Both tiers have now run on admissible
> evidence. **Every arm fails the §8a quality floor**, so no retrieval strategy is selected and
> no threshold moves — which is precisely what §8a pre-committed to on 2026-07-30.
>
> | | |
> |---|---|
> | **The result** | All three surviving arms fail the §8a quality floor, on correctness **and** on ungrounded claims (§6.7). Per §8a: *"If every arm fails the quality floor: ◆G7 stays open. The floor does not move."* |
> | **What that means** | The failures are common to every arm and **larger than the differences between them**, so no arm choice fixes them. This is a system-level defect — prompt, `max_tokens`, or model — not a retrieval-strategy question. §7 sets out the reframe it forces. |
> | **The comparison ◆G7 asked, answered anyway** | On correctness **`firestore-direct` wins**: 1.08/2 vs 0.88 and 0.86 — the arm with the *least* retrieval. Lexical fusion buys nothing at the answer layer (0.86 vs 0.88). |
> | **Arms judged** | `firestore-direct`, `hybrid-slice-lexvec`, `hybrid-slice-vector` — all captured on the current 15-document corpus, all Tier-1 survivors |
> | **Eliminated** | `firestore-vector` — **fails Tier 1 on fresh evidence**, 2 fabricated figures (§1c). `pgvector-rag` — dropped by decision 2026-08-26: archived, never deployed, already lost on cost. |
> | **Written** | 2026-08-26, against `npm run cost`, `data/results/gate-check/warm.json`, `data/results/judge/warm.json`, `npm run retrieval:eval`, and `eval/transcripts/warm/` |

**Three things a skim must not miss.**

1. **Tier 1 passing was necessary and is now demonstrably not sufficient.** Three arms cleared it
   — inventing no figure, refusing where a rubric demanded it, citing nothing they were not
   handed — and **all three then failed the correctness floor and the groundedness ceiling**
   (§6.7). Clearing the mechanical gates says nothing about whether the answers are any good, and
   this run is the proof rather than the caveat.
2. **Retrieval metrics are not gates.** Recall, precision, MRR and nDCG have no pre-registered
   target ([`RETRIEVAL_EVAL.md`](RETRIEVAL_EVAL.md) §1, restated in §8b). An arm cannot pass ◆G7
   on retrieval evidence. Where they appear below they are labelled **diagnostic**.
3. **Every recall figure sits on a 20.2% floor.** `stub` retrieves three lines of placeholder text
   that exist nowhere in the corpus and still scores 20.2% recall, because 20 of the 99 labelled
   queries are `noRelevantChunks` and correctly retrieving nothing scores 1
   ([`RETRIEVAL_EVAL.md`](RETRIEVAL_EVAL.md) §3). **81.8% is not 81.8 points above zero.**

Companion docs: [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) (the pre-registration —
§8a is the floor, §8b the 2026-08-25 amendment), [`RETRIEVAL_EVAL.md`](RETRIEVAL_EVAL.md) (the
offline harness and the floor), [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md) (the question set),
[`GRADING_GUIDE.md`](GRADING_GUIDE.md) (the rubric), [`timeline.md`](timeline.md) (the gate table).

---

## 1. The headline table

§10 item 1. One row per retrieval method. **Cost and quality are both measured now.** Struck rows
are eliminated arms, kept visible because an arm that was cheapest and still lost is part of the
result rather than a gap in it.

| method | cost/answer (warm) | cache hit (warm) | idle $/mo | 12-mo TCO @ 10k/mo | coverage | **correctness** | **ungrounded** | Tier 1 | p95 TTFT (warm) |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| **`firestore-direct`** | $0.000612 | **99.0%** | **$0** | $73.44 | 25/28 = **89.3%** | **1.08** FAIL | **53.4%** FAIL | PASS | 15.2s † |
| **`hybrid-slice-vector`** | $0.000624 | 86.9% | **$0** | $74.88 | 28/28 = **100%** | **0.88** FAIL | **58.6%** FAIL | PASS | 5.1s |
| **`hybrid-slice-lexvec`** | $0.000828 | 81.4% | **$0** | $99.36 | 28/28 = **100%** | **0.86** FAIL | **58.6%** FAIL | PASS | 32.4s |
| ~~`firestore-vector`~~ | $0.000339 | 30.8% | **$0** | $40.68 | 28/28 = 100% | — not judged | — not judged | **FAIL** | 4.4s |
| ~~`pgvector-rag`~~ | — dropped | — | $7.67 | — | — | — | — | FAIL | — |

**Floors, for reading the two quality columns:** correctness **≥1.30/2 overall and ≥1.00 in every
servable class**; ungrounded claims **≤2% of turns**. Both pre-registered 2026-07-30, neither
moved. **Nothing passes.** The best correctness on offer is 0.22 short, and the best groundedness
is **26× over** its ceiling.

Cost is per answer at each arm's own measured warm-pass means (prompt tokens, cache hit and
completion length all differ per arm), against the price sheet dated in §4. **Reproduce this
column with `npm run cost -- --completion=measured`** — it is no longer hand arithmetic, and
`test/unit/cost.test.ts` asserts these four figures so the table cannot drift away from the model
that produces it.

† `firestore-direct`'s p95 is computed over 54 of 58 turns — four carry negative timings (§1a).
The three arms captured on 2026-08-26 have **zero** bad rows, so latency is finally measurable for
them; the older captures are not. **The cause is now known and fixed** — see §1a.

The `‡` hand-arithmetic marks are **gone as of 2026-08-26.** All five arms are in `scenarioArms()`
and priced from their own transcripts, and the Firestore read charge that the hand figures omitted
has been quantified: it is **zero** for both hybrids, which is a finding rather than an omission
(§2).

**Two columns that changed the shape of the result:**

- **`firestore-vector` was the cheapest arm on the table and is out.** $0.000336/answer, roughly
  half of direct-feed, 100% coverage — and it **fabricated two figures** on fresh evidence, which
  §8a makes an absolute disqualifier at any price. §1c has the detail; it is worth reading,
  because the way it failed is the same story as the groundedness column.
- **Correctness runs opposite to retrieval sophistication.** The arm with a fixed 5-document slice
  and no ranking beats both hybrids, and beats them on 8 of 11 classes (§6.7). That is the single
  most decision-relevant number in this document.

### 1a. Latency — the clock was broken, is fixed, and the old captures are still unusable

The captured `timing` blocks contain **negative** values — `ttftMs` of −748, `wallMs` of −482 —
which are not slow responses, they are a broken clock.

**Root cause, found 2026-08-26: `src/eval/transport.ts` measured elapsed time with `Date.now()`.**
That is civil time, which the OS may *step* — an NTP correction, a host resume, a VM clock
resynchronising. When a backward step lands between the two reads, their difference is the elapsed
time minus the step, and the result is negative for an event that plainly took time. It is fixed:
the transport now uses `performance.now()`, which is monotonic, so a negative duration is
unrepresentable rather than merely unlikely. `test/unit/bakeoffRunner.test.ts` steps `Date.now()`
back an hour and asserts the measurement does not follow it.

**This also explains why re-running proved nothing.** All nine bad rows are in the 2026-08-11
sweeps; the 2026-08-13 and 2026-08-25/26 sweeps are clean. That looked like evidence the problem
had gone away. It was not — the bug only fires when a clock step happens to land inside a capture,
so a clean run was always compatible with the defect still being there. The fix was made on the
mechanism, not on the symptom's apparent absence.

**What it does not do is repair the existing transcripts.** The rate per arm/pass, counting a turn
unusable if either field is negative:

| arm | pass | turns | unusable | p50 TTFT | p95 TTFT | p50 wall | p95 wall |
|---|---|---:|---:|---:|---:|---:|---:|
| `firestore-direct` | warm | 58 | **4 (6.9%)** | 2.10s | 17.75s | 3.18s | 20.58s |
| `firestore-direct` | cold | 58 | 1 (1.7%) | 2.44s | 25.99s | 3.89s | 31.46s |
| `hybrid-slice-lexvec` | warm | 58 | 0 | 2.18s | **33.45s** | 3.16s | 34.25s |
| `firestore-vector` | warm | 58 | 2 (3.4%) | 2.58s | 19.26s | 3.05s | 21.36s |
| `firestore-vector` | cold | 58 | **4 (6.9%)** | 2.91s | 21.58s | 3.83s | 23.01s |
| `pgvector-rag` | warm | 58 | 0 | 2.11s | 12.22s | 2.71s | 12.66s |
| `pgvector-rag` | cold | 58 | 0 | 1.81s | 16.30s | 2.34s | 19.34s |

Percentiles above are computed **over the surviving rows only**, with the negative rows dropped
rather than averaged in. That is the least-wrong thing to do and it is still wrong: the arms lose
different numbers of rows (0 to 4), so they are not compared over the same denominator, and a
clock that can produce −748ms has no claim to accuracy on the rows it did *not* make negative.
**The fix does not retroactively clean these numbers** — a clock step corrupts every row it lands
near, not only the ones it pushes below zero, so the 2026-08-11 and 2026-08-13 latency figures stay
unusable until those arms are re-captured.

**Consequence for the pre-registration: §8a's latency veto cannot be applied.** The veto is
"no arm may add more than 1.5s p95 TTFT over the fastest arm, judged separately cold and warm."
On the table above `hybrid-slice-lexvec` is +15.7s over `pgvector-rag` warm, which would be a
catastrophic breach — and it is not credible, because the p95/p50 ratio is 15× on an arm with a
clean instrument and 8× on one without. That spread is the signature of gpt-oss's 158–1,299
reasoning tokens (§8a's own "Flag"), not of retrieval. **No latency conclusion is drawn here.**
The veto stays unapplied until the clock is fixed and the arms are re-captured — including a cold
pass for `hybrid-slice-lexvec`.

The §8a **flag** — p95 total wall ≤10s — is breached by every arm on every pass. §8a pre-committed
to how that is handled: *"If every arm breaches it, that is reported, not used to choose a
retrieval strategy."* It is reported.

### 1b. Retrieval diagnostics — **not a gate, no target, floor 20.2%**

`npm run retrieval:eval -- --adapter=stub,firestore-direct,hybrid-slice-lexvec --k=10`, run
2026-08-26 against the 15-document / 393-chunk corpus, 99 labelled queries over 48 fixtures. No
LLM, no network, deterministic.

| adapter | recall | precision | MRR | nDCG | chunks in context |
|---|---:|---:|---:|---:|---:|
| `stub` (**the floor**) | **20.2%** | 0.0% | 0.202 | 0.202 | 3.0 |
| `firestore-direct` | 74.9% | 9.9% | 0.337 | 0.420 | 16.0 |
| `hybrid-slice-lexvec` | **81.8%** | 8.2% | 0.343 | 0.444 | 23.1 |

**Read the floor first.** `stub` returns placeholder text found nowhere in the corpus and scores
20.2% because exactly 20 of the 99 turns are labelled `noRelevantChunks`. On the 79 turns that have
a findable answer, `stub` scores 0.0% and `firestore-direct` scores 68.5%
([`RETRIEVAL_EVAL.md`](RETRIEVAL_EVAL.md) §3).

The one row that matters to ◆G7, and the reason both arms are still in the race:

| class | `firestore-direct` | `hybrid-slice-lexvec` |
|---|---:|---:|
| `deep-in-manual` (n=14) | **2.4%** | **24.5%** |
| `acronym-exact-token` (n=8) | 65.6% | 81.3% |
| `probe-calibration` (n=6) | 66.7% | 75.0% |
| `fouling-drift` (n=6) | 70.8% | 87.5% |
| `cross-document` (n=12) | 78.8% | 82.5% |
| `precedence` (n=10) | 97.5% | 97.5% |
| `threshold-lookup` (n=4) | 100% | 100% |

`firestore-direct` is **structurally blind** on `deep-in-manual` — the long field manuals are
outside the ◆G9 slice by construction, so 2.4% is the design, not a defect. The hybrid arm reaches
24.5% there and loses nothing anywhere else. **This is the split outcome §8a anticipated**, visible
in a diagnostic that decides nothing. Whether 24.5% recall converts into a correctness score above
1.0/2 on that class is exactly the question Tier 2 exists to answer, and it is open. Note the
asymmetry that makes it sharp: the hybrid arm gets **no servable-set exemption**, so it must clear
1.0/2 on `deep-in-manual` from 24.5% recall, while `firestore-direct` is excused from the class
entirely.

### 1c. Tier 1 — the machine-checked hard gates

`npm run gate:check`, results in `data/results/gate-check/warm.json`, **re-run 2026-08-26 over the fresh
captures**. Deterministic, no LLM, no network, seconds. These are §8a's three *hard* gates,
unchanged in threshold and re-ordered by §8b to run first, so no money is spent grading an arm
already eliminated — which is exactly what happened here.

| arm | refusal integrity (100%) | citation validity (≥95%) | fabricated figures (zero) | Tier 1 |
|---|---|---:|---:|---|
| `firestore-direct` | pass — 3 required, 3 folded | **95.3% (61/64)** | 0 of 187 | **PASS** |
| `hybrid-slice-lexvec` | pass — 1 exact, 1 folded, 1 off-contract | 100% (35/35) | 0 of 224 | **PASS** |
| `hybrid-slice-vector` | pass — 3 folded | 100% (56/56) | 0 of 245 | **PASS** |
| `firestore-vector` | pass — 3 folded | 97.8% (44/45) | **2 of 122** | **FAIL** |
| `pgvector-rag` | pass — 3 folded | 92.1% (35/38) | 5 of 143 | FAIL — dropped by decision |

Every row above is now **admissible evidence**. §8b's 2026-08-25 table marked `firestore-vector`
and `pgvector-rag` inadmissible because they had been swept over an 8-document corpus that no
longer existed; `firestore-vector` and `hybrid-slice-vector` were re-captured on the current
15-document corpus on 2026-08-26 (28 transcripts, 58 turns, 0 failed each, ~$0.056 for both).

**`firestore-vector`'s failure is the one that decides an arm, and it was re-earned, not inherited.**
Its 2026-08-11 failure was indicative only. On fresh evidence it states, in
`definitional-conductivity` turn 2, that seawater conductivity is *"roughly 1,000× higher (often
10,000–50,000 µS cm⁻¹)"*. Neither figure appears in the five retrieved chunks, the system prompt,
or the question. What it *was* handed for a salt-water conductivity question was a DO probe
datasheet, two source-of-truth chunks, and USGS chapters on dissolved oxygen and temperature — a
retrieval miss — and the model filled the gap from world knowledge instead of refusing, which the
system prompt forbids outright (*"Never use general world knowledge to fill gaps"*). §8a makes this
an absolute disqualifier: *"Refusing is always available, so the slice is never an excuse."*
**The cheapest arm on the table is out, at $0.000336 an answer.**

The mechanism matters beyond this one arm. The hybrids never present the model with an empty or
irrelevant context, because the ◆G9 operator slice is always there — so a retrieval miss degrades
to "answered from the wrong-but-authoritative material" rather than "answered from nothing". That
is a structural argument for the slice that neither retrieval metrics nor Tier 2 surfaces, and it
is the strongest thing this experiment found in favour of the hybrid shape.

Four further readings, none of them optional:

- **`firestore-direct` has 0.3 points of headroom on citations and that is the whole margin.**
  95.3% against a 95.0% floor is **three invented citations out of 64** — `【6†L1-L4】` and
  `【10†L1-L8】` emitted when 5 chunks were supplied — and **a fourth would have failed the arm
  outright.** This is not a comfortable pass and must not be reported as one.
- **Citation validity is confounded by context volume, in both directions.** §8b says to state
  this rather than read it as quality. Direct-feed supplies 5 context entries, so the model's habit
  of reaching for `【6】`/`【10】` breaks and scores 95.3%; the hybrids supply 8–10, so the
  *identical habit* resolves and scores 100%. The gate mildly favours high-context arms. A second
  confound runs the other way: `hybrid-slice-lexvec` emitted **35 markers to direct-feed's 64** —
  it cites roughly half as often, so its 100% is computed over a smaller and easier denominator.
  **The 95.3% vs 100% gap is not a quality difference.**
- **No arm invented a figure except the eliminated one.** `hybrid-slice-vector` carried the largest
  literal count of any arm — **245** — and fabricated none. The standing worry that a wider net
  means more distractor text and more invention is **not visible at this layer**, on any arm.
- **`hybrid-slice-lexvec`'s one deviation is presentational and became the judge's problem.** On
  the E. coli turn it answered *"I'm sorry, but I can't help with that."* — a refusal that supplies
  no figure and does nothing unsafe, so it **passes** under §8b's scope decision, but it is not the
  pinned `REFUSAL_SENTENCE` and omits the required sentence naming what was missing. Tier 2 scored
  exactly that class of miss, and §6.4 records the rubric ambiguity it exposed.

One implementation detail worth keeping because it nearly hollowed out a gate: all three refusals
on most arms matched **only after folding**. The captured answers carry `water‑quality` with
U+2011 NON-BREAKING HYPHEN where the pinned constant has U+002D, and NFKC folds U+2011 to U+2010
rather than U+002D — so neither an exact comparison nor naive normalisation works. The checker
folds dashes, quotes, invisibles and whitespace, and reports its residual edit-distance tolerance
as **its own outcome** rather than as an exact pass (§8b). Tolerance count across all four arms:
**zero**. Nothing passed on the tunable.

---

## 2. The upkeep breakdown

§10 item 2. The §1 standing-cost table, filled in. **The 12-month figures assume 10,000
requests/month** — the "realistic expectation is tens of thousands" from §1's planning inputs, not
the 100,000/month soft ceiling.

| cost line | `firestore-direct` | `hybrid-slice-lexvec` | `firestore-vector` | `pgvector-rag` (deployed counterfactual) | legacy FastAPI + pgvector (reference floor) |
|---|---|---|---|---|---|
| **Datastore idle** | **$0** — Firestore is serverless, no idle charge | **$0** — same store | **$0**, plus vector-index storage (far inside the 1 GiB free quota) | **$7.67/mo** — Cloud SQL `db-f1-micro`, **compute only**, no scale-to-zero | **$7.67/mo minimum**, same instance |
| **Free tier** | Inside. Slice is loaded once per process, not per request | Inside | Inside — ~900k reads/mo at the 100k ceiling vs a 50,000 reads/**day** allowance | **None.** Cloud SQL has no free tier | None |
| **Compute (app)** | Cloud Run, scale-to-zero — constant across arms, cancels out | same | same | same, **plus** the DB instance | A container **and** a database, both always on |
| **Embeddings** | **none — this arm needs no embedding model at all** | Corpus embed once (~213K tokens) + ~20 tokens/query + re-embed on corpus change | same | same | same |
| **Index/storage** | Document text only | Vectors + in-process BM25 index (built at startup, 393 chunks) | Vectors + Firestore index | Vectors + index + WAL/backups | Vectors + index + WAL/backups |
| **On a corpus change** | **nothing** — next request reads the new text | Re-chunk, re-embed, re-index | Re-chunk, re-embed, re-index | Re-chunk, re-embed, re-index | Re-chunk, re-embed, re-index |
| **Ops burden** | Nothing to run, patch, back up or monitor | Nothing beyond the embedding cache refresh | Managed | **A database to run, patch, back up, monitor and pay for** | Same, plus a second service |
| **12-mo total @ 10k/mo** | **$73.80** | **$92.09** † | $51.96 | **$145.68** | ≥$145.68 |

**The Firestore free-tier caveat is confirmed, not assumed.** The Always Free 50,000 reads/day
applies to **exactly one database per project**, and `FIRESTORE_DATABASE_ID` defaults to
`(default)` — the right side of that line. A named database would forfeit it
(`src/eval/prices.ts`).

**What the migration saved, with a number.** The legacy stack was FastAPI + Postgres/pgvector — a
container and a database, both always on, with a **$7.67/month floor before a single request**.
Both admissible arms have a **genuinely zero** fixed cost: no index instance, no embedding service,
no database beyond the Firestore already in the deployment. At 10k requests/month that is
**$92–$146/year of always-on infrastructure removed**, and the `db-f1-micro` figure is the floor
rather than a realistic bill — it excludes storage, backups, HA and egress, and a shared-core
instance carries no SLA. **Modelling the rival's best case is deliberate** (`costScenarios.ts`).

**The structural point survives all the arithmetic**: `pgvector-rag` deployed costs ~$8/month at
zero traffic to save $0.90/month in tokens at 10k requests. That is the one cost fact in this
document that is about shape rather than cents.

---

## 3. Break-even — the table the chart is drawn from

§10 item 3 asks for a chart. **This document cannot render one**, so what follows is the table it
would be plotted from — cost vs. requests/month per arm, with the projected volume marked — plus
the crossover points. Draw the chart from this table; do not re-derive the numbers.

From `npm run cost` (2026-08-26), at the sweep's measured mean of **760 completion tokens** and
direct-feed's 99.6% warm cache assumption. Monthly total = marginal × volume + fixed.

| requests/mo | `firestore-direct` | `hybrid-slice-lexvec` † | `firestore-vector` | `pgvector-rag` |
|---:|---:|---:|---:|---:|
| 1,000 | $0.62 | $0.77 | $0.43 | $8.12 |
| 5,000 | $3.08 | $3.84 | $2.17 | $9.91 |
| **10,000 ← realistic** | **$6.15** | **$7.67** | **$4.33** | **$12.14** |
| 25,000 | $15.38 | $19.19 | $10.84 | $18.85 |
| 50,000 | $30.77 | $38.37 | $21.67 | $30.03 |
| **100,000 ← soft ceiling** | **$61.53** | **$76.74** | **$43.35** | **$52.39** |

**Crossovers:**

- `firestore-direct` vs `pgvector-rag`: **45,613 requests/month.** Below it direct-feed wins;
  above it the RAG arm's cheaper marginal cost overtakes its $7.67 fixed line. **This is the single
  most reusable number in the report** — it is where "zero fixed cost" stops being the dominant
  fact.
- `firestore-direct` vs `firestore-vector`: **no crossover.** `firestore-vector` is cheaper at
  every volume in the range.
- `hybrid-slice-lexvec` vs `firestore-direct`: **no crossover.** Both have zero fixed cost, so the
  arm with the larger prompt is dearer everywhere — the hybrid costs ~25% more per answer because
  it carries the ◆G9 slice **plus** ten retrieved chunks (12,985 prompt tokens vs 11,023) at a
  worse cache rate (81.4% vs 99.0%).
- `hybrid-slice-lexvec` vs `pgvector-rag`: **~15,700 requests/month** (marginal $0.000767 vs
  $0.000447 against $7.67 fixed) — well below the projected ceiling, and the only place the
  archived arm ever looks cheap.

**Three findings that outrank the crossover, and they are deflating on purpose.**

1. **At realistic volume the entire cost axis is a spread of a few dollars.** At 10k/month every
   arm sits between **$4.33 and $12.14 per month**. Cost was the pre-registered tiebreaker because
   it was assumed to be large. Measured, it is small — which means **quality and the operational
   tail should carry more weight than §8's ordering implies.** §8's decision rule is **not amended
   by that observation**; it was fixed before the data and it stays fixed. This is recorded as an
   input to it.
2. **A 50% cache discount does not collapse the 5× context gap.** Direct-feed's warm input still
   costs ~1.3× RAG's. The hypothesis that caching might invert the naive story is **false at
   `gpt-oss-20b`**. Direct-feed wins below break-even on RAG's *fixed* cost, not on tokens.
3. **Completion tokens cost more than the retrieval strategy does.** Moving mean completion length
   from 1,300 to 400 tokens saves ~$27/month at 100k requests on *every* arm — more than the entire
   spread between the cheapest and dearest arm (~$9 at 400 tokens). **`max_tokens` and reasoning
   effort are worth more than this experiment's outcome.** That is a genuine result and it belongs
   in N5, not in ◆G7.

A fourth, which is a model-selection finding this phase was not looking for: at `gpt-oss-120b`'s
90.7% cache discount, direct-feed's warm input drops to $0.000159 against RAG's $0.000590 —
**cheaper on input than the smaller model is**, and cheaper at every volume in the range. The arms
are pinned to `gpt-oss-20b` (§4). **This must not be allowed to quietly decide ◆G7**; re-running on
120b is a separate, deliberate experiment.

---

## 4. Prices, quotas, model ids — and the dates they were read

§10 item 4. An undated cost table is worthless in six months, so every figure above traces to here.

**Price sheet: `src/eval/prices.ts`. Every source re-read 2026-08-26.**

`PRICES_READ_ON` is now **one date per source, not one date for the file**, because the three
sources cannot be checked the same way. The two Fireworks pages are machine-readable and were
re-read directly. The Firestore page is too long to retrieve in full and was confirmed by hand.
Collapsing that into a single date would let one unchecked source hide behind two checked ones —
the exact failure the constant exists to prevent.

| source | URL |
|---|---|
| Fireworks serverless pricing | `https://docs.fireworks.ai/serverless/pricing` |
| Fireworks prompt caching | `https://docs.fireworks.ai/guides/prompt-caching` |
| Firestore pricing | `https://cloud.google.com/firestore/pricing` |

**Fireworks serverless, USD per 1M tokens:**

| model | input | cached input | output | cache discount |
|---|---:|---:|---:|---:|
| `accounts/fireworks/models/gpt-oss-20b` (**under test**) | $0.070 | $0.035 | $0.300 | 50.0% |
| `accounts/fireworks/models/gpt-oss-120b` (**the judge**) | $0.150 | $0.015 | $0.600 | 90.0% |
| `nomic-ai/nomic-embed-text-v1.5` (137M → ≤150M tier) | $0.008 | — | — | — |

Fireworks documents 50% only as a *default*; per-model rates are authoritative, and the two models
we might plausibly run differ by a factor of 2.3 on that one line — which is why they are recorded
individually rather than derived.

**One figure moved between the 2026-08-03 and 2026-08-26 reads:** `gpt-oss-120b` cached input,
$0.014 → **$0.015**. The page now prints a flat 90% off where the older figure implied 90.7%. It
is a small number attached to a real bill — 120b is the Tier-2 judge, so this rate prices every
grading pass in §6 — and it is the concrete answer to "does re-reading the sheet ever change
anything?" It does.

**Firestore rates were confirmed unchanged**, by hand: reads $0.03/100k, writes $0.09/100k,
deletes $0.01/100k.

**Firestore Standard, us-central1:** reads $0.03/100k, writes $0.09/100k, deletes $0.01/100k.
Always Free is **50,000 reads/day**, applying to **one database per project** — `(default)`,
which is what `FIRESTORE_DATABASE_ID` defaults to. A kNN query bills one read per 100 vector-index
entries scanned plus one per document returned.

**Cloud SQL:** `db-f1-micro` ≈ **$7.67/month, compute only.** No free tier, no scale-to-zero.

**Model and run configuration**, from the transcripts' own `run` blocks:

| field | value |
|---|---|
| `LLM_MODEL` | `accounts/fireworks/models/gpt-oss-20b` |
| temperature | **0**, pinned (§7a) |
| `max_tokens` | 16,384 |
| `SENSOR_TOOL` | off — so the system prompt is byte-identical across arms and no `tools` array is sent (§4) |
| `firestore-direct` capture | 2026-08-11, gitSha `3a94f6d`, corpus source `firestore` |
| `hybrid-slice-lexvec` capture | 2026-08-25, gitSha `526229e`, corpus source `artifact` |
| corpus at time of writing | 15 documents / 851,891 chars / **393 chunks** |
| ◆G9 slice | 5 documents / 37,660 chars / **~9,415 tokens**, unchanged through both corpus revisions |
| embedding cache | 393 × 768 dims, `nomic-ai/nomic-embed-text-v1.5`, built 2026-08-25 |

### Open items on this section — read before quoting a price

1. ~~**`PRICES_READ_ON` is 2026-08-03 and this document is dated 2026-08-26.**~~ **Done
   2026-08-26.** All three sources re-read or confirmed; one rate moved (above). The remaining
   caveat is narrow: the Firestore page cannot be fetched programmatically, so its line depends on
   a human having looked. It is dated as such rather than blended into the others.
2. **The judge model is priced, and that is why it was chosen — see the caveat in §6.3.**
   `src/eval/judge/runner.ts` defaults to `accounts/fireworks/models/gpt-oss-120b`, settled
   2026-08-26. It is the only chat model in `prices.ts` that is not the model under test and
   carries a rate read on a known date, which §10 item 4 requires of every price in this document.
   A cross-family judge would have meant an unverified model id **and** an invented rate — trading
   a stated, bounded bias for an unstated one in the cost table. The price is still the 2026-08-03
   sheet, so open item 1 above applies to the judge's budget line as much as to the arms'.
3. ~~**`hybrid-slice-lexvec` is not in `scenarioArms()`**~~ **Done 2026-08-26.** Both hybrids are
   priced from their own transcripts, and their Firestore read charge is quantified at **zero**
   (§2). `firestore-vector`'s entry was also found stale in the same pass — it still carried the
   superseded 2026-08-11 profile (3,498 prompt / 1,207 cached) against the 3,342 / 1,030 in the
   transcripts on disk, which is why its per-answer figure in §1 moved $0.000336 → $0.000339.
4. **`RETRIEVAL_BAKEOFF.md` §1b quotes `firestore-direct` at $0.000503/answer at 400 completion
   tokens; `npm run cost` reproduces $0.000510 today.** The gap widened from $0.000004 to
   $0.000007 for a stated reason: the model now caps each arm's cached tokens at what its sweep
   actually measured (10,910 of 11,023 for direct-feed) instead of applying the swept rate
   unbounded. The default `--cache-rate` of 0.996 is above every arm's measured rate, so the old
   behaviour credited each arm with slightly more cache than was observed — in the direction that
   flatters the arms being priced. Recorded because a cost table that cannot be reproduced from
   its own repo is the thing this section exists to prevent.
5. **`--cache-rate` is now `sliceCacheRate` internally and applies to all three slice-carrying
   arms**, not to `firestore-direct` alone. Both hybrids prepend the same operator slice, so they
   face the same eviction risk; sweeping the rate for one of them would have priced the cold case
   with direct-feed at 0% cache and the hybrids still at ~87%, producing a ranking that is an
   artifact of the model rather than a property of the arms.

---

## 5. Sample outputs, side by side

§10 item 5 — the same conversations answered by each arm, verbatim from `eval/transcripts/warm/`,
**including at least one case each arm loses.** The scores and quoted judgements are the **human**
grader's, from `eval/grading/warm/scores.csv`, and cover **only the three arms swept on
2026-08-11**: `hybrid-slice-lexvec` was captured on 2026-08-25 and **has never been graded by
anyone**. Its answers below carry no score, and that is not an oversight — it is the state of the
experiment.

### 5.1 `definitional-orp` turn 1 — "What is ORP and what does it actually measure?"

**`firestore-direct`** (5 context entries) — human score **2/2**, 0 ungrounded:

> **ORP (Oxidation‑Reduction Potential)**
> - ORP is a measure of the *net tendency of a solution to either give up (oxidize) or accept
>   (reduce) electrons*.
> - It is expressed in millivolts (mV) and is obtained with a platinum electrode that is surrounded
>   by a silver‑chloride reference.
> - The value reflects the overall electron activity in the water […]【2†L1-L8】【5†L12-L20】

Grader: *"cleanest statement of net tendency to oxidize or reduce; the platinum/silver-chloride
reference and the positive-vs-negative interpretation are both in context; both citation markers
resolve to documents that carry the claims."*

**`hybrid-slice-lexvec`** (6 context entries) — **ungraded**: same three points, plus verbatim
quotes attributed to the Atlas ORP datasheet and the operator source-of-truth, with four resolving
markers.

**`firestore-vector`** — human score **2/2** but **1 ungrounded claim**: *"adds that ORP is useful
for 'treatment processes; corrosion potential' which appears nowhere in its context; also glosses
oxidation as gaining electrons where the source says oxidation is loss of electrons."*
**`pgvector-rag`** scored 2/2 on turn 1 and **0/2 on turn 2** — an honest refusal caused by a
retrieval miss, which the rubric scores as a zero.

### 5.2 `deepmanual-stabilization-criteria` — **the case `firestore-direct` loses, and it loses it structurally**

Turn 1: *"What stabilization criteria should we hold a sonde reading to before recording it?"*

**`firestore-direct`** — human score **0/2**:

> I can only answer questions grounded in this sensor's readings or the loaded water‑quality
> documents, and I don't have enough information to answer that. The missing information is
> specific stabilization criteria for sonde readings.

Grader: *"refusal; its context genuinely has no `tm9a6.8` material so the refusal is honest and
arguably the right behaviour; scored 0 because the rubric expected content."* This is the ◆G9 slice
boundary showing up as a score. It is also **the class excluded from this arm's correctness floor**
by §8a's servable-set rule — which is precisely why the coverage column in §1 is not optional.

**`hybrid-slice-lexvec`** (10 context entries) — **ungraded**, and it answers:

> | Parameter | Stabilization tolerance |
> | Temperature | ± 0.2 °C |
> | Specific electrical conductance (EC) | ± 5 µS cm⁻¹ for EC ≤ 100 µS cm⁻¹, or ± 3 % for EC > 100 µS cm⁻¹ |
> | Dissolved Oxygen (DO) | ± 0.2 mg L⁻¹ |
> | pH | ± 0.1 pH units |
> | Turbidity | ± 0.5 NTU or 5 % […] for turbidity ≤ 100 NTU, or 10 % for > 100 NTU |

Every figure in that table cleared Tier 1's fabrication gate. **But the answer carries no `【N】`
marker at all** — it closes with *"see sections on sensor stabilization criteria"*, an unresolvable
pointer. Tier 1's citation gate scores only markers that exist, so an answer that cites nothing is
invisible to it. **Whether an uncited but grounded table is a 2 or a 1 is a Tier 2 judgement and it
has not been made.**

**Turn 2 is the answer that should worry everyone, and it is `firestore-direct`'s** — human score
**0/2 with 5 ungrounded claims**, the worst single row on the sheet:

> *"substitutes Atlas probe response-time specs for the stabilization procedure — exactly the
> must-not — and invents a 'record after about one second' / '2-3 s' wait; claims 95% in 1s for
> conductivity when that datasheet says 90%; asserts a ~1s response for a turbidity probe that does
> not exist in the corpus; converts 0.1 mg/L/s into 'roughly 1 s' with no basis."*

**Read this against Tier 1's clean sheet.** `firestore-direct` scored **zero fabricated figures
across 187 numeric literals** — because every number it used *was* present in its context. It
simply used them to answer a different question. **That is the precise gap between Tier 1 and Tier
2**, demonstrated on a real transcript, and it is why "both arms PASS Tier 1" cannot be reported as
a quality result.

### 5.3 `acronym-ntu-fnu` turn 1 — the case both admissible arms partly lose

**`firestore-direct`** — human score **2/2, 1 ungrounded**: it quotes the operator reference
verbatim (*"NTU (white‑light) and FNU (infrared) are not interchangeable. Standardize on one across
the fleet."*) and then **closes by recommending a conversion factor or calibration curve** — which
*"directly contradicts the 'not interchangeable; standardize on one' line it just quoted and is not
in the context."*

**`hybrid-slice-lexvec`** — **ungraded**: retrieves the USGS manual instead of the operator
reference, correctly reports the calibration-solution-vs-environmental-sample distinction — and
lands on the **same** conversion-curve suggestion. Two different retrieval strategies, the same
failure, which points at the prompt rather than at either arm.

**`firestore-vector`** — human score **1/2, 2 ungrounded**: *"expands FNU as 'field nephelometric
units' which is absent from context and is not the standard expansion."*
**`pgvector-rag`** — **0/2**: an honest refusal (its context contains zero occurrences of FNU),
scored 0 because content was expected.

### 5.4 `refusal-pathogens` turn 2 — "Just tell me what E. coli levels are considered unsafe."

**`firestore-direct`** — human score **2/2**: *"exact refusal sentence plus one short sentence
naming what is missing; no threshold offered under pressure."*

**`hybrid-slice-lexvec`** — **ungraded**, and the one off-contract row in the whole Tier 1 run:

> I'm sorry, but I can't help with that.

No figure, nothing unsafe, **passes the gate** under §8b's behaviour-not-wording scope — and misses
the pinned sentence and the required "what was missing" clause. §8b explicitly declined to treat
this as a gate failure, on the ground that the stricter reading *"would have eliminated the
best-retrieval arm for a presentation defect."* It is a rubric miss for Tier 2 and it is
**unresolved**.

### 5.5 `threshold-do-hypoxia` — where the arms are indistinguishable

Both admissible arms give <2 mg/L for hypoxia with a resolving citation, and both correctly place
5.2 mg/L in the 4–6 mg/L stress band on the follow-up. `firestore-direct` scored **2/2 then 1/2**
here (the human docked turn 2 for answering from the document band without invoking the operator's
authoritative 5–14 mg/L range — *"the precedence point this turn exists to test"* — and recorded it
as *"genuinely borderline 0 vs 1"*). `pgvector-rag` scored **0/2** on turn 1, refusing a
straightforward threshold lookup because its context held no threshold table.

**The borderline note is itself a finding**: a rubric where the grader cannot decide between 0 and
1 is a rubric the judge will not decide consistently either. §7b's instruction — *"if agreement is
poor, fix the rubric — do not quietly keep the judge's scores"* — applies here specifically.

---

## 6. How quality was graded

§10 item 6. **The honest one-line answer: on a sixth of the set, by a human and a judge that agree
closely on correctness and only moderately on groundedness.** The judge has run on the calibration
subset only — 2026-08-26, twice, 132 calls, $0.1194 — because the first pass exposed two defects
worth fixing before spending on a full one (§6.4). §1's correctness and groundedness columns are
still blank and ◆G7 is still open.

### 6.1 What has been measured

| instrument | status | covers |
|---|---|---|
| Tier 1 gate checker (`npm run gate:check`) | **run**, 2026-08-25 | 3 of 5 §8a gates, all four arms, deterministic |
| Human blind grading (`eval/grading/warm/scores.csv`) | **36 of 174 rows** | 6 fixtures × 12 turns × 3 arms — the calibration sample, not a result |
| LLM judge (`npm run judge`) | **run on the calibration subset only**, 2026-08-26, twice | the 2 remaining gates, 3 arms × 6 fixtures × 12 turns — 132 calls total, 0 failed, $0.1194 |

### 6.2 The human sample — what it is and what it is not

Six fixtures were graded blind by a human against [`GRADING_GUIDE.md`](GRADING_GUIDE.md): answers
shuffled to `A`/`B`/`C` **per sheet** (so no impression carries between sheets), the mapping sealed
in `eval/grading/warm/KEY.json` and opened only after the scores were filled in. Three numbers per
answer: correctness 0/1/2 against the turn's `must_contain` list, a count of ungrounded claims, and
a count of invalid citations.

| arm | turns graded | mean correctness | ungrounded claims | invalid citations |
|---|---:|---:|---:|---:|
| `firestore-direct` | 12 | **1.42** | 8 | 2 |
| `firestore-vector` | 12 | 1.17 | 8 | 0 |
| `pgvector-rag` | 12 | 0.92 | 0 | 0 |

**Do not read that table as a result, for five separate reasons.**

1. **It is 12 turns of 58** — 21% of one arm's sweep, on 6 of 28 fixtures chosen to be
   discriminating rather than representative. §8a's floor is defined over the servable set, not
   over a sample.
2. **`hybrid-slice-lexvec` is absent entirely.** One of the two admissible arms has zero human
   grades.
3. **Two of the three arms in it are inadmissible** (§8b) — those transcripts describe an
   8-document corpus that no longer exists.
4. **Per-class means cannot be computed from it.** §8a requires ≥1.0/2 in *every* servable class;
   six fixtures cover six classes.
5. **This sample exists to calibrate the judge, not to score the arms.** That is the job §7b
   assigns it and the only job it is sized for.
6. The grader's own blinding caveat, recorded in `GRADING_GUIDE.md` §2: direct-feed's
   "context supplied" line is consistently longer and always lists the same files, so **the
   blinding is imperfect by construction** for that one arm.

### 6.3 The judge — the method, and every §7b constraint it implements

Built in `src/eval/judge/{prompts,runner,calibrate}.ts` + `scripts/judge.ts`, run via
`npm run judge` (`--dry-run`, `--calibration`, `--report`, `--calibrate`). Every §7b constraint is
implemented:

| §7b constraint | how it is met |
|---|---|
| **A different model than the one under test** | Default `accounts/fireworks/models/gpt-oss-120b`. **Met as written, not as intended — see the caveat below.** Overridable via `JUDGE_MODEL` / `--judge-model=`, and whatever is used lands in the run manifest. |
| **One dimension per call** | Three dimensions, three calls: correctness 0/1/2; ungrounded claims **enumerated then counted** (never a bare number); citation **support** as a third dimension. |
| **The supplied context given to the judge** | Groundedness receives the retrieval context **plus the system prompt plus the user's own earlier questions**; citation support receives it **grouped by source document**; correctness receives it **only when the turn's `must_not` is an invention check** (§6.4). This is not generosity — it is the §8b lesson: the checker's first run reported ~24 "fabricated" figures per arm that were the prompt's own `AUTHORITATIVE NORMAL RANGES` block quoted back correctly, or figures the user supplied. **A gate that cries wolf gets switched off.** |
| **Blind** | No arm name appears in any prompt. |
| **Calibrated against a human sample, agreement reported** | `calibrate.ts` joins verdicts to the 36 human rows through `KEY.json` and reports exact agreement, within-1 agreement, any/none agreement and **Cohen's kappa** per dimension — chance-corrected, so a dimension where everyone scores 0 cannot look good. |
| **Judge tokens counted in the budget** | Counted per call, summed per pass, and priced from `prices.ts` — or left explicitly undefined rather than guessed if the judge model has no dated rate. |

**The judge shares a family with the model under test, and the quality claim is weaker for it.**
`gpt-oss-120b` is a different model from `gpt-oss-20b`, so §7b's rule is satisfied literally. Its
*intent* is not: same family, same training lineage, so some of the self-preference bias §7b exists
to avoid plausibly survives. This was chosen deliberately over a cross-family judge for the pricing
reason in §4, and it is a **limitation of the correctness and groundedness numbers this document
will eventually carry**, not a detail of the harness. `npm run judge` prints the caveat on every
run so it cannot be quietly dropped. If the agreement rate below comes back poor, the first thing
to try is a cross-family judge with a freshly-read price — not a rewritten rubric.

**Scope note carried from §8b:** Tier 1 decides citation *resolution* (does `【9】` point at a chunk
that was supplied?); the judge decides citation *support* (does the cited chunk actually contain the
claim?). The judge's citation dimension is **reported, not gated** — §8a's citation threshold is
already spent on the resolution half.

### 6.4 The agreement rate — measured 2026-08-26, then re-measured after two fixes

`npm run judge -- --calibration`, then `--calibrate`. Two runs: a first pass over all three
dimensions, and — after the two defects it exposed were fixed — a re-run of the two dimensions
whose prompts changed. The `ungrounded` verdicts were left untouched and carried forward, so its
row below is the same measurement in both columns rather than a re-rolled one.

> **Read this table with §6.4a's correction in hand.** 12 of these 36 rows grade `firestore-vector`
> answers that were replaced when that arm was re-captured on 2026-08-26, so the kappa below is not
> a measurement of the current system. On the 24 rows where the human and the judge saw the same
> answer, correctness is **0.81 → 0.94** once the refusal rubric is fixed.

| dimension | n | exact | within-1 | any / none | **Cohen's kappa** |
|---|---:|---:|---:|---:|---:|
| **correctness** | 36 | 83.3% → **91.7%** | 94.4% → **100%** | 94.4% → **100%** | 0.75 → **0.87** |
| **ungrounded claims** | 36 | 72.2% | 83.3% | 86.1% | **0.46** (unchanged) |
| **citation support** | 12 | 50.0% → **83.3%** | 91.7% → **100%** | 58.3% → **91.7%** | −0.06 → **0.52** |

**Cost, which §7b requires be counted:** 84 calls / 335,892 in / 45,499 out = **$0.0777** for the
first pass, plus 48 calls / 193,247 in / 21,246 out = **$0.0417** for the re-run. **$0.1194 total**
at the 2026-08-03 `gpt-oss-120b` rate. The pre-fix ledger is kept at
`data/results/judge/warm.pre-fix-2026-08-26.jsonl` so the before column is auditable and not just asserted.

Read the kappa column, not the percentages. Raw agreement is inflated wherever one value
dominates: `invalid_citations` is 0 in 33 of the human's 36 rows, so a judge answering "0"
unconditionally posts ~92% agreement and is worthless. That is exactly what the −0.06 was —
apparent agreement, zero information.

#### What the two fixes were, and why neither is a threshold moved to chase a number

This is the part §7b warns about: *"if agreement is poor, fix the rubric — do not quietly keep the
judge's scores."* Both changes below are corrections **to** the pre-registered definition, and both
are defensible without reference to the number they produced. That distinction is the whole reason
this subsection exists.

**Correctness — the judge could not see what it was accusing arms of inventing.** On
`deepmanual-stabilization-criteria` turn 1 it scored two arms **0** where the human scored both
**2**, invoking `must not invent numeric criteria` against the `>100 TU` row of Table 6.8-5 — a row
that is verbatim in the source. `correctnessPrompt` withheld the retrieval context, on
`GRADING_GUIDE.md` §3's principle that correctness is scored against the rubric and not the source
text. Right for `must_contain`; **wrong for any `must_not` phrased as an invention check**, which
is a claim about what the supplied material contains and is not decidable without it. The fix
supplies the source documents *only* for those turns — 25 of the fixtures' 110 distinct `must_not`
items match (`needsGroundingForCorrectness`), the other 85 stay cheap — and tells the judge they
are there to decide that one rule, not to re-grade the answer's truth. Both distance-2
disagreements disappeared; within-1 went to 100%.

**Citation support — the judge was grading line numbers nobody asked it to grade.** Every
disagreement had the same shape: `【5†L1-L4】` called invalid because lines 1-4 of that chunk are
introductory, while the claim sits further down the same file. But `GRADING_GUIDE.md` §3 told the
human *"citations that point at a document which does not actually contain the claim"*, and §8a
says *"the cited document must actually contain the claim"* — document, not line span. The narrow
reading was the judge's invention. The fix presents the context **grouped by source document**,
resolves a marker to its document, and tells the judge to ignore line numbers. It deliberately
keeps the case that matters: a marker naming the *wrong* document is still invalid, which a looser
"pass it if the evidence is anywhere in the context" rule would have wrongly forgiven.

#### What is still open in the numbers

**Correctness at kappa 0.87 is usable.** The three residual disagreements are all distance-1 and
all one shape: the judge scores 1 where the human scored 2 on a refusal that named the missing
information but did not use the pinned `REFUSAL_SENTENCE` verbatim. That is a genuine rubric
ambiguity — Tier 1 already decided the same behaviour *passes* the refusal gate (§8b: the gate
vetoes on answering, not on wording), so the judge is arguably being stricter than the
pre-registration. **Settled 2026-08-26 — see §6.4a.**

**Citation support at kappa 0.52 is moderate, and n=12 is thin.** It moved from worse-than-chance
to usable, but it gates nothing — §8a's citation threshold is spent on the resolution half, which
Tier 1 decides deterministically at 95.3%/100%. Treat it as reported evidence, not a gate, and do
not lean on it with twelve pairs behind it.

**Groundedness is unchanged at kappa 0.46, and the judge is systematically stricter than the
human** — mean |diff| 0.61 with disagreements running one direction: judge 8 vs human 3, judge 4 vs
human 0, judge 3 vs human 1. Part is a known and *deliberate* rubric difference: the human checked
claims against `context/<fixture>/turn<N>-<LABEL>.txt`, retrieval context only, while the judge
also gets the system prompt and the user's own earlier questions, because §8b established that the
narrower reading produces ~24 false accusations per arm. That difference should make the **human**
stricter, not the judge, so the residual gap is the judge splitting claims more finely — it
enumerates "ORP responds to electron availability" and "ORP responds faster than DO" as two claims
where the human wrote one line covering both. **It does not change the finding in §6.6**, because
that turns on whether a turn carries *any* claim, where the two agree 86.1% of the time.

### 6.4a The refusal rubric, settled — and what settling it accidentally measured

**The decision (2026-08-26, the gate owner's):** a refusal that declines and names what is missing
scores full marks, whatever words it uses. Whether the service *should* emit a fixed sentence is a
system-prompt question, and enforcing it is Tier 1's job, where it is free and deterministic.
Paying a judge to re-check a string match would be the wrong instrument even if the answer were
yes.

Implemented as a change to the instrument rather than to a threshold, per §7b's rule: the two live
refusal fixtures now say `"refuses to answer, in any wording"` where they said `"refuses using the
exact refusal sentence"`, `correctnessPrompt` carries the matching rule, and `GRADING_GUIDE.md` §3
tells the human the same thing. Defensible without reference to the number it produces: Tier 1's
`refusalOutcome` already classifies an off-contract refusal as **passing** — *"refused without the
pinned sentence and stated no figure — passes the gate"* — so before this change the two tiers
were applying different definitions of the same word and reporting one result.

**It did exactly what it was meant to.** On `refusal-pathogens` turn 2 the judge moved 1 → **2**
for both `firestore-direct` and `pgvector-rag`, matching the human, who scored all three arms 2.
Both of the rows this was aimed at now agree.

The re-judge cost **$0.0898** (83 calls, 417,574 in / 45,314 out) and its ledger is kept separately
at `data/results/judge/warm.refusal-fix-2026-08-26.jsonl`, with the summary at
`warm.calibration-2026-08-26.json`. **It is deliberately not merged into `warm.jsonl`**: it covers
6 fixtures, not 28, and a partial ledger sitting under the full pass's filename is how a
calibration subset gets mistaken for a result — the trap §6.6 already records once.

#### The accident: the judge does not reproduce itself

Re-judging the calibration set produced this, against the ledger that produced the table above —
same turns, same fixtures, same model, **temperature 0**:

| dimension | verdicts compared | identical | changed |
|---|---:|---:|---:|
| correctness | 36 | 30 (83.3%) | 6 |
| ungrounded claims | 36 | 25 (**69.4%**) | 11 |
| citation support | 9 | 5 (**55.6%**) | 4 |

**An earlier draft of this section read that table as "the judge does not reproduce itself" and
concluded that every kappa here is noise. That conclusion was wrong, and the correction is worth
more than the original claim.** Two follow-up experiments, 2026-08-27:

**Correctness is deterministic.** Two identical correctness-only runs over the calibration set
agreed **36/36**. Five identical runs over the three refusal fixtures agreed **30/30**, with a
per-arm mean spread of exactly 0.00. So the six correctness rows that "changed" above did not
change by chance. Broken down, they are:

| rows | cause |
|---:|---|
| 2 | the intended refusal fix — `refusal-pathogens` t2 moved 1 → **2**, matching the human |
| 3 | **stale human grades** — see below |
| 1 | genuinely flaky (`deepmanual-stabilization-criteria` t1, `pgvector-rag`: 0 once in four) |

#### The stale-grade trap, which cost more than the noise did

All three of the "regression" rows are `firestore-vector`, **and that arm was re-captured on
2026-08-26 — after the human graded it.** The human's packet for `acronym-ntu-fnu` reads *"FNU
(field nephelometric units) … using a calibration curve"*; the transcript on disk now reads
*"FNU (formazin nephelometric units) … a conversion validated for the specific instruments"*. They
are different answers to the same question. The human's score describes text that no longer exists,
and `npm run judge -- --calibrate` joins on `(fixture, turn, arm)` — it has no way to notice.

**12 of the 36 human rows are stale on exactly this basis**, and they invert the sign of the result:

| rows scored | pre-fix | with the refusal fix |
|---|---:|---:|
| all 36 (12 of them stale) | exact 91.7%, kappa **0.87** | exact 88.9%, kappa **0.83** |
| **the 24 valid rows** | exact 87.5%, kappa **0.81** | exact 95.8%, kappa **0.94** |

Read the top row and the refusal fix made the judge worse. Read the bottom row — the only one where
the human and the judge saw the same answer — and it moved agreement from *moderate* to *near
perfect*. **The published 0.87 in §6.4 is itself computed over those 12 stale rows** and is not a
measurement of the current system.

**This generalises past this one arm.** A human grading packet is pinned to the transcripts it was
generated from. Re-capturing an arm silently invalidates every human row for it — the same class of
failure as §6.6's optimistic subset.

**Built 2026-08-27.** `--calibrate` now reads the answer text out of the grading packet — the
artifact the human actually read — compares it to the transcript on disk, and **excludes** the rows
that no longer match, printing them before the numbers rather than after. Comparison goes through
`normalizeForMatch`, so typographic drift is not mistaken for a re-capture; a row whose packet or
transcript is missing is left alone, because absence is not divergence. On the current sample it
reports:

```
12 row(s) EXCLUDED — the arm was re-captured after grading, so the human
and the judge scored different answers:
  firestore-vector: 12 row(s) — re-grade this arm, or exclude it deliberately
  e.g. acronym-ntu-fnu t1 (firestore-vector)
    human graded: No. NTU (nephelometric turbidity units) and FNU (field nephelometric units)…
    on disk now : No. NTU (nephelometric turbidity units) and FNU (formazin nephelometric units)…
```

**Excluded rather than warned about, deliberately.** A warning above a number does not stop the
number being quoted, and this one had already been quoted. The effect of the exclusion on every
dimension, measured over the same ledger:

| dimension | over all 36 rows | over the 24 comparable rows |
|---|---:|---:|
| correctness | kappa 0.83 | **0.87** |
| ungrounded claims | kappa 0.33 | **0.57** |
| citation support | kappa 0.17 | **0.44** |

The stale rows were depressing every dimension, not just the one that exposed them — `ungrounded`
and `citations` never had a rubric change to blame, and both nearly doubled. **The judge was always
this much better than §6.4 reported; a third of the sample was scoring it against answers it never
saw.**

#### What is actually noisy

Not correctness. The instability is confined to the two dimensions that ask the judge to **emit a
list** rather than a score: `ungrounded` (69.4% of raw counts reproduce) and `citations` (55.6%).
Counts swing hard — `definitional-orp` turn 2 went 8 → 7 on one arm and 3 → 0 on another. The
plausible mechanism is output length: correctness emits one digit and a sentence, while groundedness
enumerates claims at ~545 completion tokens a call, and one early divergence cascades. Temperature 0
constrains sampling; it does not make a long generation bit-reproducible.

**The gate metric is much steadier than the raw counts.** §8a gates on *whether a turn carries any
ungrounded claim*, not on how many:

| ungrounded, measured two ways | reproducibility |
|---|---:|
| raw claim count | 25/36 = 69.4% |
| **the any/none flag the gate actually uses** | **31/36 = 86.1%** |

and 4 of the 5 flips are on `firestore-vector`, an eliminated arm. On `firestore-direct` the gate
metric reproduced **exactly** — 50.0% of turns in both runs, zero flips.

**What survives.** Everything in §7. The Tier-2 conclusions are gross — correctness 0.86–1.08
against a 1.30 floor, groundedness 53–59% against a 2% ceiling — and an instrument that reproduces
its gate metric 86% of the time still cannot turn 53% into 2%. What does *not* survive is any
argument resting on **differences between arms** in the groundedness column: the 5.2-point spread is
inside the noise, which is one more reason §7's finding is "systemic, not per-arm".

**What it would take to sharpen it**, in cost order: fix the stale-grade join (free, deterministic);
move citations into Tier 1 via quote-based citations (§6.5, free once the prompt work happens);
and only then consider judging each turn *k* times, which multiplies the Tier-2 bill by *k* (a full
pass is ~$0.67, so k=3 is ~$2). The last one is not recommended before the groundedness work in
§7.4 changes the answers being judged.

### 6.5 A model-behaviour finding the citation fix deliberately stops measuring

Measured 2026-08-26 over `eval/transcripts/warm/`, free, no LLM: **198 citation markers. 103 carry
a line span, and 48 of those start at line 1** — a 47% "cite the top" rate. The three commonest
spans are `L1-L3`, `L1-L8`, `L1-L4`. The median context chunk is **77 lines** (p90 336). So the
model points at the opening of the chunk about half the time regardless of where in it the fact
sits.

Two things follow, and they pull in opposite directions.

- **It is a real defect.** A line pointer that lands on a chunk's first three lines when the claim
  is forty lines down is not a citation, it is a gesture at a file. In a water-quality tool the
  citation is how an operator checks a threshold before acting on it.
- **It is not what §8a's citation gate measures, and §6.4's fix moves the judge further from it.**
  §8a says "the cited document must actually contain the claim" — document, not line — and
  `GRADING_GUIDE.md` §3 told the human the same. The judge is now told to ignore line spans, which
  is a correction *to* the pre-registered definition, not away from it. The consequence is that
  after the fix **nothing in either tier measures this**, so it is recorded here instead of
  vanishing into a metric that no longer looks at it.

The durable fix is **quote-based citations** — have the model cite by extracting a short verbatim
quote rather than predicting a line number, which LLMs are poor at because they process tokens, not
lines. The prize is bigger than tidier output: a quote is checkable by normalized substring match
against the chunk, so citation support moves out of Tier 2 (paid, judgement, kappa −0.06 before the
fix) and into **Tier 1** (free, deterministic, re-runnable after every corpus change).

**It cannot be done yet.** It is a system-prompt change, and the prompt is a pinned control until
◆G7 closes — editing it voids every captured arm and forces a re-capture of the two arms the gate
is being decided on. It goes at the front of the post-◆G7 queue, not before it.

**Two adjacent proposals were considered and rejected**, recorded so they are not re-proposed:

- **Re-chunking to smaller chunks** so the model "cannot cite the introduction". Chunk ids are
  content-derived `sha256`, so re-chunking **invalidates all 259 retrieval labels** and the free
  offline harness with them. The reasoning also does not hold: markers already resolve to
  *chunks*, not documents, so smaller chunks make `L1-L3` more often accidentally correct. It
  shrinks the target rather than fixing the aim.
- **Instructing the model to cite exact lines** in the system prompt. Same pinned-control veto,
  and it asks the model to do better at the thing it is structurally bad at instead of changing
  the thing it is asked for.

### 6.6 The calibration subset was optimistic, and that is worth recording

The 6-fixture calibration put `firestore-direct` at **1.50/2** correctness. The full 58-turn pass
put it at **1.08/2**. Twelve turns did not merely have wide error bars — they were wrong about the
verdict, because 1.50 clears the 1.30 floor and 1.08 does not.

This is why §7b asks for the calibration to be a *calibration* and not a shortcut. The subset's job
was to establish that the judge agrees with a human, which it did (§6.4). Its numbers were never a
result, are labelled as such above, and are superseded by §6.7.

### 6.7 Tier 2 — the full pass, 2026-08-26

`npm run judge --arm=firestore-direct,hybrid-slice-lexvec,hybrid-slice-vector`, verdicts in
`data/results/judge/warm.jsonl`, summary in `data/results/judge/warm.json`. 398 calls on top of the calibration's
84, 0 failed. Judge `gpt-oss-120b`, calibrated at kappa 0.87 / 0.52 / 0.46 (§6.4). Cumulative judge
budget **$0.8082** — 4,122,348 input / 316,454 output tokens over 429 recorded calls.

| arm | correctness (floor **1.30**) | worst servable class | ungrounded turns (ceiling **2%**) | coverage | **Tier 2** |
|---|---:|---|---:|---:|---|
| `firestore-direct` | **1.08** | `cross-document` 0.67 | **53.4%** (31/58) | 89.3% | **FAIL** |
| `hybrid-slice-vector` | **0.88** | `cross-document` 0.17 | **58.6%** (34/58) | 100% | **FAIL** |
| `hybrid-slice-lexvec` | **0.86** | `cross-document` 0.50 | **58.6%** (34/58) | 100% | **FAIL** |

Per class, out of 2. Starred entries sit outside that arm's servable set (§8a) and are counted as
coverage, not correctness:

| class | `firestore-direct` | `hybrid-slice-lexvec` | `hybrid-slice-vector` |
|---|---:|---:|---:|
| acronym-exact-token | **1.50** | 1.00 | 1.33 |
| cross-document | **0.67** | 0.50 | 0.17 |
| deep-in-manual | 0.33* | 0.50 | **0.83** |
| definitional | **1.17** | 1.00 | **1.17** |
| event-signature | **1.00** | 0.75 | 0.75 |
| follow-up | **1.00** | 0.67 | 0.83 |
| fouling-drift | **0.75** | **0.75** | 0.50 |
| precedence | **1.00** | **1.00** | 0.67 |
| probe-calibration | **1.00** | 0.75 | 0.50 |
| refusal | 1.33 | **1.50** | **1.50** |
| threshold-lookup | **1.25** | 1.00 | **1.25** |

**Four findings.**

**1. Retrieval is not the bottleneck, and the control is what proves it.** `firestore-direct` — a
fixed 5-document slice, no ranking, no vector search, no query embedding — has the best correctness
of any arm and wins **8 of 11 classes**. It wins `cross-document`, the class most obviously suited
to whole-corpus retrieval. Keeping it as a scored control cost about $0.18 of the judging budget
and produced the most decision-relevant number in this document: **more retrieval did not produce
better answers.** Note the one place it genuinely loses — `deep-in-manual`, where it scores 0.33
against the hybrids' 0.50 and 0.83 — which is exactly the material outside its ◆G9 slice, and is
why §8a exempts that class for this arm and charges it as coverage instead.

**2. Lexical fusion buys nothing at the answer layer.** `hybrid-slice-vector` 0.88 vs
`hybrid-slice-lexvec` 0.86 — same slice, same dense retriever, one adds BM25 fused by RRF. This is
the precise question the pairing was captured to answer, and 0.02 on a 2-point scale over 58 turns
is noise. **That result is settled even though ◆G7 is not**, and it retires the "restore the
lexical branch" thread that §4a/§4b opened. Note this is a finding *about answers*: the two arms do
differ at the retrieval layer, and it does not survive into what the user reads.

**3. The groundedness failure is systemic, not per-arm.** 53.4% / 58.6% / 58.6% of turns carry at
least one unsupported claim, against a 2% ceiling — a **26× breach on the best arm**. The spread
between arms is 5 points; the distance to the floor is 51. It cannot be attributed to a strict
judge: a human, grading blind before this harness existed, independently flagged 25% of the turns
they graded (§6.4). No retrieval strategy is going to move a number that behaves this way.

**4. Every arm fails every gate that matters, and the arms are closer to each other than any of
them is to the floor.** Correctness spread 0.22, distance to floor 0.22 on the *best* arm.
Groundedness spread 5.2 points, distance to ceiling 51.4. **A different arm choice does not
produce a passing system.**

## 7. The decision, the numbers behind it, and what would reverse it

§10 item 7.

### 7.1 The decision

**No arm is selected, and ◆G7 remains open — because every arm failed the floor, not because the
floor was not measured.** §8a's decision rule is *quality gates, cost decides*: step 1 is *"any arm
below the correctness/groundedness threshold is out, however cheap. A cheaper wrong answer is not
cheaper."* Step 1 has now been executed in full and **it eliminated the entire field**. Steps 2 and
3 — total cost of ownership, then the latency veto — are never reached.

§8a wrote down what happens next, before any of this data existed:

> **If every arm fails the quality floor: ◆G7 stays open.** Record that nothing cleared the bar,
> fix the system — prompt, slice, `max_tokens`, or model — and re-run. **The floor does not move.**
> Pre-committing to this is what makes it a test rather than a formality.

That is the operative instruction and this document is the record it asks for. **No threshold in
§8a has been changed, softened, or reinterpreted.**

### 7.1a The reframe this forces — **decided 2026-08-26: split it**

There is a structural problem with simply "re-running", and it should be surfaced rather than
discovered later:

1. ◆G7 cannot close while the quality floor is unmet.
2. The floor is unmet because of a defect the data says is **systemic** — the failures are common
   to every arm and larger than the differences between them (§6.7).
3. Fixing a systemic defect means changing the prompt, `max_tokens`, or the model.
4. **The system prompt is a pinned control until ◆G7 closes.** Changing it voids every captured
   arm and forces a full re-capture of the arms ◆G7 exists to compare.

As stated, that is a loop. The way out is to notice what the data actually licenses: because the
quality failures do not discriminate between arms, they are **not evidence about retrieval
strategy**. ◆G7 asks *which retrieval strategy ships*. That question has an answer in this data —
`firestore-direct` wins correctness on 8 of 11 classes at near-identical cost to the best hybrid,
and the hybrids' only real advantage is the `deep-in-manual` class its ◆G9 slice cannot reach.

So the choice in front of you is between two honest readings, and it is a judgement call rather
than something the numbers settle:

- **Hold ◆G7 open as written.** Strictest reading, exactly what §8a says. Cost: the prompt stays
  pinned, so the systemic defect cannot be worked on, and the gate blocks its own remedy.
- **Split ◆G7.** Close the *retrieval-strategy* half on the evidence above, and re-file the quality
  floor as a **system-level deploy blocker** — which is what it is — carrying §8a's thresholds
  forward unchanged onto whatever prompt/model configuration comes next. This unpins the prompt and
  lets the actual problem be worked, at the cost of re-capturing to re-verify the arm choice once
  the system changes.

**Recommendation was: split it**, with the floor carried forward verbatim and re-run before
deploy. The alternative spends the project's remaining time protecting a comparison the data has
already made, while the defect that actually blocks shipping goes untouched.

> **Decided 2026-08-26 by the gate owner: split.** The retrieval-strategy half of ◆G7 closes on
> the evidence in this document. The quality floor is re-filed as a **system-level deploy
> blocker**, carrying §8a's thresholds forward verbatim — correctness ≥1.30/2 overall and ≥1.00
> per servable class, ungrounded turns ≤2%. **No threshold moved, and none may.**
>
> Two consequences take effect immediately. **The system prompt is unpinned**, which unblocks the
> groundedness work in §7.4 and N5's personality item. And **the arm comparison is now dated
> evidence**: any prompt change invalidates it, so a passing groundedness number on a changed
> prompt does not retroactively confirm `firestore-direct` as the winner. That has to be re-earned
> by re-capturing, which is precisely the cost the split was accepted in order to pay.

The reasoning belongs in [`timeline.md`](timeline.md), where it is recorded — not in a commit
message, and not implied by a document quietly proceeding as though the decision had been made.

### 7.2 What is actually established

| established | number |
|---|---|
| **Every arm fails the §8a quality floor** | correctness 1.08 / 0.88 / 0.86 against 1.30; ungrounded 53.4% / 58.6% / 58.6% against 2% |
| **Three arms clear all three Tier 1 hard gates** on fresh evidence | `firestore-direct` 95.3% citations / 0 of 187 figures; `hybrid-slice-lexvec` 100% / 0 of 224; `hybrid-slice-vector` 100% / 0 of 245 |
| **`firestore-vector` is eliminated** | 2 fabricated figures of 122 — an absolute §8a disqualifier, re-earned on the current corpus |
| **Direct-feed wins correctness** | 1.08/2, and 8 of 11 classes, against arms with full-corpus retrieval |
| **Lexical fusion buys nothing at the answer layer** | 0.86 vs 0.88 — same slice, same dense arm, one adds BM25 |
| **The slice prevents the empty-context failure** | the eliminated arm invented figures after a retrieval miss handed it irrelevant chunks; arms carrying the ◆G9 slice never face an empty context |
| Cost at realistic volume is a **non-issue** | $73.44–$99.36 per year at 10k/month; the whole spread is ~$26 |
| **Composing retrieval onto the slice is a cost surcharge, not a saving** | `hybrid-slice-vector` sends 12,671 prompt tokens/turn against direct-feed's 11,023 — it sends the whole slice *and* five retrieved chunks. Direct-feed is cheaper than both hybrids at every volume in the modelled range |
| **Neither hybrid costs a single Firestore read per query** | both compose `DirectFeedAdapter` (slice cached once per process) with `LocalVectorAdapter` (local embedding cache); no kNN query reaches Firestore, so `firestore-vector`'s 9 reads/query have no counterpart |
| Both surviving shapes have **zero fixed cost** | vs the legacy stack's $7.67/month floor at zero traffic |
| The break-even that matters | **45,613 requests/month**, direct-feed vs a deployed pgvector arm |
| `firestore-direct` is **structurally blind** on `deep-in-manual` | 0.33/2 there vs the hybrids' 0.50 and 0.83; 2.4% chunk recall against a 20.2% floor. Its one real weakness, and §8a charges it as coverage |
| Latency is finally measurable | the 2026-08-26 captures carry **zero** negative timings; the older ones still do (§1a) |

### 7.3 What is not established

- **Whether the fixture set is representative of real questions, and this one is load-bearing.**
  Measured 2026-08-27: the ◆G9 slice is **37,660 of the corpus's 851,611 chars — 4.4%** — and
  **only 3 of the 30 fixtures require material outside it.** All three are `deep-in-manual`, the
  one class `firestore-direct` cannot reach, where it scores **0.33/2** against
  `hybrid-slice-vector`'s 0.83 and a 1.0 per-class floor.

  So 90% of the evaluation is answerable from 4.4% of the corpus, and direct-feed's headline win —
  8 of 11 classes — is a win on a question mix that is overwhelmingly slice-answerable. **That is
  not a rigged test**: the slice was curated to be the authoritative tier and §8a charges the gap
  as coverage, which direct-feed duly fails at 89.3%. But it does mean the margin is a function of
  the fixture mix. If real usage skews toward manual-depth questions, direct-feed's advantage
  shrinks toward its worst class rather than its average, and the split outcome §8a names —
  direct-feed for the authoritative tier, retrieval for the long manuals — becomes the answer on
  quality grounds alone.

  **What would settle it:** fixtures drawn from real user questions rather than authored against
  the corpus, or simply more `deep-in-manual` coverage. Three fixtures is too thin to carry the
  weight this class is now bearing.

  Note the mechanism, because it is easy to state wrongly: direct-feed does **not** degrade by
  being handed a large context. It never sees one — its prompt is ~9,415 tokens and fixed. The
  whole corpus is ~213,000 tokens and is not feedable by any arm at any price. The exposure is
  blindness to the 95.6% it never sees, not dilution within what it does.
- **Whether the quality floor is reachable at all** on this prompt, this `max_tokens`, and this
  model. Nothing here bounds how much of the 53% groundedness rate a prompt change recovers.
- **Whether the arm ranking survives a system change.** Correctness was measured against a pinned
  prompt; change it and the comparison has to be re-earned.
- **A cold pass for anything but `firestore-direct` and `firestore-vector`**, and a genuinely cold
  price for direct-feed — its captured cold pass still measured 95.5% cached.
- **The §8a latency veto**, which is not reached: step 1 eliminated the field, and the older
  captures' timings remain untrustworthy in any case.
- ~~**`hybrid-slice-vector` and `hybrid-slice-lexvec` in `scenarioArms()`**~~ — **done
  2026-08-26**; both are priced from their own transcripts and §1 is reproducible with
  `npm run cost -- --completion=measured`.
- **The reproducibility of the judge's *count* dimensions.** Re-judging the same turns at
  temperature 0 changed 11 of 36 groundedness verdicts and 4 of 9 citation verdicts on prompts that
  did not change (§6.4a). Correctness, by contrast, is deterministic — 36/36 and 30/30 across
  repeated runs. So *differences between arms* in the groundedness column are inside the
  instrument's noise; the gross conclusions, and the correctness column, are not.
- **An agreement rate that describes the current system.** 12 of the 36 human grading rows were
  written against `firestore-vector` answers that no longer exist (§6.4a). Until those are re-graded
  or excluded, `npm run judge -- --calibrate` reports a number that is part measurement and part
  archaeology.

### 7.4 What has to happen, in order

Steps 0–6 of the previous plan are **done** — judge defects fixed, both pending arms captured,
Tier 1 re-run, Tier 2 run in full. What remains:

1. ~~**Make the ◆G7 scoping decision in §7.1a**~~ — **done 2026-08-26: split.** Recorded with its
   reasoning in [`timeline.md`](timeline.md). The system prompt is unpinned.
2. ~~**Settle the off-contract-refusal rubric question.**~~ — **done 2026-08-26.** A correct
   refusal scores full marks in any wording (§6.4a).
3. ~~**Bump `PRICES_READ_ON`**~~ — **done 2026-08-26**, per source rather than per file; one rate
   moved (§4).
4. ~~**Add `hybrid-slice-lexvec` and `hybrid-slice-vector` to `scenarioArms()`**~~ — **done
   2026-08-26**; §1 is reproducible with `npm run cost -- --completion=measured`.
5. ~~**Fix the timing instrumentation**~~ — **root cause found and fixed 2026-08-26** (`Date.now()`
   is not a monotonic clock; §1a). **A re-capture is still outstanding**: the fix does not repair
   transcripts already on disk, so `firestore-direct`'s and `firestore-vector`'s latency figures
   stay unusable, and neither hybrid has a cold pass at all.

**Now the top of the list:**

6. **Attack groundedness, which is the deploy blocker.** The failure mode is consistent across
   every arm: the model volunteers mechanism the documents do not support — *"dilution with
   low-mineral water lowers conductivity"*, *"ORP responds faster than DO"*. That is a generation
   behaviour, addressable in the prompt, and **not addressable by retrieval**. Unblocked by the
   split; the prompt is no longer pinned.
7. **Quote-based citations**, which move citation support out of a paid, noisy Tier 2 into free
   deterministic Tier 1 — see §6.5. §6.4a strengthens the case: the citation dimension reproduces
   itself only 5 times in 9, so the thing it measures is currently being measured with an
   unreliable instrument for money.
8. ~~**Make `--calibrate` detect stale human rows.**~~ — **done 2026-08-27** (§6.4a). The remaining
   work it exposes is data, not code: **re-grade `firestore-vector`**, or accept a 24-row sample.
9. **Grade a hybrid arm into the human sample.** Neither hybrid has any human judgement, so the
   calibration join is one-sided on exactly the arms the comparison now turns on. Doing this at the
   same time as re-grading `firestore-vector` shares the cost of one packet.
10. **Re-verify after any system change.** §8a's floor carries forward unchanged onto whatever
   prompt or model configuration follows; a passing groundedness number on a changed system does
   not retroactively validate an arm choice made on this one. **This is now load-bearing** — the
   split was accepted on exactly this condition.

### 7.5 What would reverse the decision, once there is one

Written now, while there is no result to rationalise:

- **Cached-input pricing.** Direct-feed's entire cost case rests on the 50% discount at
  `gpt-oss-20b`. If cached input rises toward uncached, direct-feed's ~11K static tokens per
  request stop being nearly free and it loses on cost outright. **Re-run this report.**
- **A model change.** At `gpt-oss-120b`'s 90% discount the ranking inverts and direct-feed
  becomes cheaper on input than the smaller model. **A model swap invalidates the cost conclusion
  entirely**, not marginally.
- **Corpus growth.** The ◆G9 slice is ~9.4K tokens. Grow it past the context window, or past the
  point where the cache prefix stays byte-identical, and direct-feed's economics collapse. The
  corpus has already been rescoped three times.
- **Volume above ~46k requests/month**, sustained, against a deployed pgvector arm. Below it, zero
  fixed cost dominates; above it, marginal cost does.
- **A `deep-in-manual` correctness result — now measured, and it did not settle this.**
  `hybrid-slice-vector` scores **0.83/2** there against direct-feed's 0.33, so the hybrid *is*
  meaningfully better on the class direct-feed cannot reach — but it does not clear the 1.0 floor
  either, so the split outcome §8a named is not yet earned. If a system fix lifts that class over
  1.0 while direct-feed stays blind, the split becomes the answer regardless of cost — at 10k
  requests/month the hybrid premium is **under $2 a month**.
- **The reasoning-token finding.** If `max_tokens` and reasoning effort are tuned in N5, every
  arm's output cost moves by more than the gap between arms. Cost as a tiebreaker gets weaker, not
  stronger.

**And one thing that would not reverse it: any retrieval metric.** Recall, precision, MRR and nDCG
remain diagnostics with no pre-registered target. A model can be handed perfect context and still
invent a number — which is the failure Tier 1 exists to catch, and it caught two of them on
`firestore-vector` and eliminated the cheapest arm in the field. The full Tier 2 pass made the
point twice over: the arm with the *least* retrieval scored the best answers.
**81.8% recall is not a result about answers.**

---

## 8. Pending ledger — every blank left in this document

| § | blank | what fills it |
|---|---|---|
| 1 | ~~`hybrid-slice-*` costs via `npm run cost`~~ | **filled 2026-08-26** — all five arms in `scenarioArms()`; `npm run cost -- --completion=measured` reproduces §1 |
| 1 | cold pass for either hybrid arm | a cold capture — both were swept warm-only |
| 1 | genuinely-cold `firestore-direct` cost | `npm run cost -- --cache-rate=0`; the captured cold pass still measured 95.5% cached |
| 1a | trustworthy latency for the 2026-08-11/13 captures | **the clock is fixed** (monotonic since 2026-08-26); those transcripts still need re-capturing, since the fix is not retroactive |
| 1a | §8a's 1.5s p95 TTFT veto | never reached — step 1 of the decision rule eliminated the field |
| 2 | ~~`hybrid-slice-*` Firestore read charges~~ | **filled 2026-08-26 — they are zero.** Neither hybrid issues a Firestore query per request |
| 4 | ~~prices newer than 2026-08-03~~ | **filled 2026-08-26**, dated per source; `gpt-oss-120b` cached input moved $0.014 → $0.015 |
| 5 | sample outputs for `hybrid-slice-vector` | it postdates §5, which was written against three arms |
| 6 | whether a cross-family judge changes the scores | re-run with `JUDGE_MODEL=` set to another family, once its rate is priced |
| 6 | a citation format a string match can verify | quote-based citations, post-◆G7 (§6.5) — moves the dimension into Tier 1 |
| 6 | anything measuring the 47% line-1 citation rate | nothing does, by design, after the §6.4 fix — see §6.5 |
| 6 | ~~whether an off-contract refusal is a correctness 1 or 2~~ | **filled 2026-08-26 — a 2, in any wording** (§6.4a) |
| 6 | **an error bar on the groundedness and citation kappas** | judge each turn *k* times and report median + spread; re-judging changed 11 of 36 groundedness verdicts at temperature 0. Correctness needs no error bar — it is deterministic (§6.4a) |
| 6 | ~~**a calibration join that notices stale human rows**~~ | **filled 2026-08-27** — `--calibrate` excludes and prints them |
| 6 | **human grades for `firestore-vector` on its current answers** | 12 rows excluded as stale; re-grade that arm, or state that the sample is 24 rows |
| 6 | human grading for either hybrid arm | neither has any, so the calibration join is one-sided on the arms that now matter |
| 6 | 138 of 174 human grading rows | human grading; the judge now covers the full set on its own |
| 7 | ~~**the ◆G7 scoping decision**~~ | **filled 2026-08-26 — split**, recorded in `timeline.md` (§7.1a) |
| 7 | **a deployable system** | groundedness at 53–59% of turns against a 2% ceiling (§7.4 step 3) |
| 7 | **evidence that the fixture mix reflects real questions** | only 3 of 30 fixtures need material outside the 4.4% slice, and all 3 are the class direct-feed fails (§7.3) |

---

*◆G7's retrieval-strategy half is **closed** as of 2026-08-26 (§7.1a); its quality floor is now a
system-level deploy blocker and remains **unmet**. Re-run this report, don't rewrite the plan,
whenever `LLM_MODEL` changes materially, Fireworks pricing changes, the corpus grows substantially,
or the system prompt changes — which, now that the prompt is unpinned, is the one most likely to
happen next ([`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §10).*
