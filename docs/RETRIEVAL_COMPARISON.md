# Retrieval Comparison — ◆G7, the numbers so far

> **STATUS: DRAFT. ◆G7 IS OPEN.** This is the deliverable specified in
> [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §10, written while the experiment is still
> running. **No arm has been graded for correctness or groundedness**, which is the entire
> remaining blocker. Nothing here selects a retrieval strategy, and no threshold in §8a moves.
>
> | | |
> |---|---|
> | **Decided** | Tier 1 — the three machine-checked hard gates (§8b). Both admissible arms **PASS**. |
> | **Undecided** | Tier 2 — correctness and ungrounded claims, the two gates that carry the ◆G7 decision. The judge is **built and calibrated** (§6.4: correctness kappa 0.75, groundedness 0.46, citation support −0.06 and unusable) but has run on **6 of 28 fixtures**. No arm has a Tier 2 result. |
| **Early signal** | Human and judge independently put **25%** and **39%** of turns over §8a's **2%** ungrounded-claims ceiling (§6.5). Expect a failed groundedness gate on every arm, and read §8a's "the floor does not move". |
> | **Admissible arms** | `firestore-direct`, `hybrid-slice-lexvec` |
> | **Inadmissible** | `firestore-vector`, `pgvector-rag` — swept over an 8-document corpus that no longer exists (§8b, "Evidence currency") |
> | **Not yet captured** | `firestore-vector`, `hybrid-slice-vector` |
> | **Written** | 2026-08-26, against `npm run cost`, `data/gate-check/warm.json`, `npm run retrieval:eval`, and `eval/transcripts/warm/` |

**Three things a skim must not miss.**

1. **Tier 1 passing is necessary, not sufficient.** Both admissible arms cleared it, and all that
   means is that they invented no figure, refused where a rubric demanded a refusal, and cited
   nothing they were not handed. It says **nothing about whether the answers are correct.**
   §8a's correctness floor — ≥1.0/2 in every servable class, ≥1.3/2 overall — is unmeasured for
   every arm.
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

§10 item 1. One row per retrieval method. **Cost is measured; quality is not.**

Cost is at the sweep's own mean completion length (760 tokens) — the honest middle case, not the
flattering one. Cache hit rates and prompt tokens are warm-pass sweep means from
`eval/transcripts/warm/`.

| method | cost/answer (cold) | cost/answer (warm) | cache hit (cold / warm) | idle $/mo | 12-mo TCO @ 10k/mo | coverage | correctness | groundedness | p95 TTFT (cold / warm) |
|---|---:|---:|---:|---:|---:|---:|---|---|---|
| **`firestore-direct`** | *see note* | **$0.000615** | 95.5% / **99.0%** | **$0** | **$73.80** | 25/28 = **89.3%** | — **pending** | — **pending** | 26.0s / 17.8s — **untrustworthy** |
| **`hybrid-slice-lexvec`** | — **pending** | **$0.000767** † | — / **81.4%** | **$0** | **$92.09** † | 28/28 = **100%** | — **pending** | — **pending** | — **pending** / 33.4s — **untrustworthy** |
| `firestore-vector` | $0.000433 | $0.000433 | 36.0% / 34.5% | $0 | $51.96 | 28/28 = 100% | — inadmissible | — inadmissible | 21.6s / 19.3s |
| `pgvector-rag` (archived) | $0.000447 | $0.000447 | 22.2% / 42.6% | **$7.67** (Cloud SQL, 24/7) | $145.68 | 28/28 = 100% | — inadmissible | — inadmissible | 16.3s / 12.2s |

† **Hand-derived, not from `npm run cost`.** `src/eval/costScenarios.ts` has **no
`hybrid-slice-lexvec` entry** — the scenario table still prices the three arms swept on
2026-08-11. The figure above is the same arithmetic (`src/eval/cost.ts`) applied by hand to the
arm's measured warm-pass means — 12,985 prompt tokens, 10,564 cached (81.4%), plus a ~20-token
query embedding — against the same 2026-08-03 price sheet. It also **omits any Firestore read
charge**, which for this arm is unquantified. Treat it as indicative until the arm is added to
`scenarioArms()` and `npm run cost` reproduces it.

**Notes that change how each column reads:**

- **cost/answer (cold) is not measurable for `firestore-direct`.** A 20-minute idle failed to
  expire the Fireworks prompt cache, so the "cold" pass still measured 95.5% cached
  (`src/eval/costScenarios.ts`). A genuinely cold direct-feed price remains **unmeasured**;
  `npm run cost -- --cache-rate=0` is the way to price that worst case, and it has not been run
  into this table. `hybrid-slice-lexvec` has **no cold pass at all** — it was captured warm-only
  on 2026-08-25.
- **coverage** is the share of the 28 runnable fixtures in the arm's servable set (§8a).
  `firestore-direct` cannot reach material outside the ◆G9 slice, so the three `deep-in-manual`
  fixtures are excluded from its correctness floor and counted here instead. That exemption is the
  reason this column exists; it is also the reason the two admissible arms are **not** competing on
  equal terms, and §7 below turns on it.
- **correctness / groundedness are blank for every arm, including the ones that passed Tier 1.**
  To fill them: run `npm run judge` (Tier 2), then `npm run judge -- --calibrate` against the 36
  human-graded rows. See §6.
- **p95 TTFT is reported and immediately disclaimed.** See §1a.

### 1a. Latency — the instrumentation is broken and the numbers are not yet usable

The captured `timing` blocks contain **negative** values — `ttftMs` of −748, `wallMs` of −482 —
which are not slow responses, they are a broken clock. The rate per arm/pass, counting a turn
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

`npm run gate:check --pass=warm`, results in `data/gate-check/warm.json`, first run 2026-08-25.
Deterministic, no LLM, no network. These are §8a's three *hard* gates, unchanged in threshold and
re-ordered by §8b to run first, so no money is spent grading an arm already eliminated.

| arm | refusal integrity (100%) | citation validity (≥95%) | fabricated figures (zero) | Tier 1 | evidence |
|---|---|---:|---:|---|---|
| `firestore-direct` | pass — 3 required, 3 folded | **95.3% (61/64)** | 0 of 187 | **PASS** | **admissible** — slice unchanged at 37,660 chars |
| `hybrid-slice-lexvec` | pass — 1 exact, 1 folded, 1 off-contract | 100% (35/35) | 0 of 224 | **PASS** | **admissible** — captured on the current corpus |
| `firestore-vector` | pass — 3 folded | 100% (61/61) | 5 of 132 | fail | **inadmissible** — stale corpus |
| `pgvector-rag` | pass — 3 folded | 92.1% (35/38) | 5 of 143 | fail | **inadmissible** — stale corpus, archived arm |

Four readings, none of them optional:

- **`firestore-direct` has 0.3 points of headroom on citations and that is the whole margin.**
  95.3% against a 95.0% floor is **three invented citations out of 64** — `【6†L1-L4】` and
  `【10†L1-L8】` emitted when 5 chunks were supplied — and **a fourth would have failed the arm
  outright.** This is not a comfortable pass and must not be reported as one.
- **Citation validity is confounded by context volume, in both directions.** §8b says to state
  this rather than read it as quality. Direct-feed supplies 5 context entries, so the model's habit
  of reaching for `【6】`/`【10】` breaks and scores 95.3%; the hybrid supplies 8–10, so the
  *identical habit* resolves and scores 100%. The gate mildly favours high-context arms. A second
  confound runs the other way and is worth naming: the hybrid emitted **35 markers to direct-feed's
  64** — it cites roughly half as often, so its 100% is computed over a smaller and easier
  denominator. **The 95.3% vs 100% gap is not a quality difference.**
- **`hybrid-slice-lexvec` invented nothing across 224 numeric literals** — the largest figure count
  of any arm, because it carries the most context. The standing worry that a wider net means more
  distractor text and more invention is **not visible at this layer**.
- **Its one deviation is presentational and is now the judge's problem.** On the E. coli turn it
  answered *"I'm sorry, but I can't help with that."* — a refusal that supplies no figure and does
  nothing unsafe, so it **passes** the gate under §8b's scope decision, but it is not the service's
  pinned `REFUSAL_SENTENCE` and it omits the required short sentence naming what was missing. A
  rubric miss, handed to Tier 2, not a gate failure.

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

**Price sheet: `src/eval/prices.ts`, `PRICES_READ_ON = "2026-08-03"`.**

| source | URL |
|---|---|
| Fireworks serverless pricing | `https://docs.fireworks.ai/serverless/pricing` |
| Fireworks prompt caching | `https://docs.fireworks.ai/guides/prompt-caching` |
| Firestore pricing | `https://cloud.google.com/firestore/pricing` |

**Fireworks serverless, USD per 1M tokens:**

| model | input | cached input | output | cache discount |
|---|---:|---:|---:|---:|
| `accounts/fireworks/models/gpt-oss-20b` (**under test**) | $0.070 | $0.035 | $0.300 | 50.0% |
| `accounts/fireworks/models/gpt-oss-120b` (not run) | $0.150 | $0.014 | $0.600 | 90.7% |
| `nomic-ai/nomic-embed-text-v1.5` (137M → ≤150M tier) | $0.008 | — | — | — |

Fireworks documents 50% only as a *default*; per-model rates are authoritative, and the two models
we might plausibly run differ by a factor of 2.5 on that one line — which is why they are recorded
individually rather than derived.

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

1. **`PRICES_READ_ON` is 2026-08-03 and this document is dated 2026-08-26.** `prices.ts` says
   explicitly: *"Re-read the sources and bump `PRICES_READ_ON` before publishing
   `RETRIEVAL_COMPARISON.md`."* **That has not been done.** Every cost figure above is priced at a
   sheet three weeks old, on a catalogue documented to rotate.
2. **The judge model is priced, and that is why it was chosen — see the caveat in §6.3.**
   `src/eval/judge/runner.ts` defaults to `accounts/fireworks/models/gpt-oss-120b`, settled
   2026-08-26. It is the only chat model in `prices.ts` that is not the model under test and
   carries a rate read on a known date, which §10 item 4 requires of every price in this document.
   A cross-family judge would have meant an unverified model id **and** an invented rate — trading
   a stated, bounded bias for an unstated one in the cost table. The price is still the 2026-08-03
   sheet, so open item 1 above applies to the judge's budget line as much as to the arms'.
3. **`hybrid-slice-lexvec` is not in `scenarioArms()`**, so `npm run cost` does not price it and
   the † figures above are hand arithmetic. Its Firestore read charge is unquantified.
4. **`RETRIEVAL_BAKEOFF.md` §1b quotes `firestore-direct` at $0.000503/answer at 400 completion
   tokens; `npm run cost` reproduces $0.000507 today.** A $0.000004 discrepancy that changes
   nothing, recorded because a cost table that cannot be reproduced from its own repo is the thing
   this section exists to prevent.

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

§10 item 6. **The honest one-line answer: on a sixth of the set, by both a human and a judge that
substantially agree on correctness and only moderately on groundedness.** The judge has now run —
on the calibration subset only (2026-08-26, 84 calls, $0.0777). The full Tier 2 pass has not run,
so §1's correctness and groundedness columns are still blank and ◆G7 is still open.

### 6.1 What has been measured

| instrument | status | covers |
|---|---|---|
| Tier 1 gate checker (`npm run gate:check`) | **run**, 2026-08-25 | 3 of 5 §8a gates, all four arms, deterministic |
| Human blind grading (`eval/grading/warm/scores.csv`) | **36 of 174 rows** | 6 fixtures × 12 turns × 3 arms — the calibration sample, not a result |
| LLM judge (`npm run judge`) | **run on the calibration subset only**, 2026-08-26 | the 2 remaining gates, 3 arms × 6 fixtures × 12 turns — 84 calls, 0 failed |

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
| **The supplied context given to the judge** | Groundedness receives the retrieval context **plus the system prompt plus the user's own earlier questions**. This is not generosity — it is the §8b lesson: the checker's first run reported ~24 "fabricated" figures per arm that were the prompt's own `AUTHORITATIVE NORMAL RANGES` block quoted back correctly, or figures the user supplied. **A gate that cries wolf gets switched off.** |
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

### 6.4 The agreement rate — measured 2026-08-26

`npm run judge -- --calibration` then `--calibrate`. 84 calls, 0 failed, 335,892 input / 45,499
output tokens, **$0.0777** at the 2026-08-03 `gpt-oss-120b` rate. That is §7b's budget line, and
it is the whole judge cost incurred to date.

| dimension | n | exact | within-1 | any / none | **Cohen's kappa** | verdict |
|---|---:|---:|---:|---:|---:|---|
| **correctness** | 36 | 83.3% | 94.4% | 94.4% | **0.75** | substantial — **usable** |
| **ungrounded claims** | 36 | 72.2% | 83.3% | 86.1% | **0.46** | moderate — **usable with the bias below stated** |
| **citation support** | 12 | 50.0% | 91.7% | 58.3% | **−0.06** | **worse than chance — not usable** |

Read the kappa column, not the percentages. Raw agreement is inflated wherever one value
dominates: `invalid_citations` is 0 in 33 of the human's 36 rows, so a judge answering "0"
unconditionally would post ~92% agreement and be worthless. Kappa says −0.06 — this judge and this
human are not measuring the same thing on citations at all. **It gates nothing** (§8a's citation
threshold is spent on the resolution half, which Tier 1 decides deterministically at 95.3%/100%),
so nothing downstream is contaminated. But no citation-support number from this judge belongs in a
conclusion until the dimension is re-specified. n=12 is also small; the disagreements cluster on
whether a `†L1-L4` line range that points at a document's introduction counts as unsupported.

**The judge is systematically stricter on groundedness than the human**, mean |diff| 0.61 with the
disagreements running one direction: judge 8 vs human 3, judge 4 vs human 0, judge 3 vs human 1.
Part of that is a known and *deliberate* rubric difference — the human was told to check claims
against `context/<fixture>/turn<N>-<LABEL>.txt`, retrieval context only, while the judge is
additionally given the system prompt and the user's own earlier questions, because §8b established
that the narrower reading produces ~24 false accusations per arm. The narrower rubric should make
the *human* stricter, not the judge, so the residual gap is the judge genuinely splitting claims
more finely — it enumerates "ORP responds to electron availability" and "ORP responds faster than
DO" as two claims where the human wrote one line covering both.

**One correctness failure mode is a design defect, not a disagreement.** On
`deepmanual-stabilization-criteria` turn 1 the judge scored two arms **0** where the human scored
both **2**, in each case invoking the rubric's `must not invent numeric criteria` against the
`>100 TU` row of Table 6.8-5 — a row that is verbatim in the source. The judge could not know
that: `correctnessPrompt` deliberately withholds the retrieval context, on the `GRADING_GUIDE.md`
§3 principle that correctness is scored against the rubric and not against the source text. That
principle is right for `must_contain` and **wrong for any `must_not` phrased as an invention
check**, which is unjudgeable without the material. Both correctness disagreements at distance 2
are this one defect. Fixing it — supply the context to correctness when the turn's `must_not`
mentions inventing or fabricating — is the single highest-value change to the harness, and it
should happen before the full pass rather than after.

### 6.5 What the run says about the gates — and what it does not

**It does not decide ◆G7.** Twelve turns per arm is a sixth of the 58, and two of the three arms
graded here (`firestore-vector`, `pgvector-rag`) are inadmissible on stale-corpus grounds (§8b).
The per-arm gate verdicts `npm run judge` printed are the gate arithmetic applied to a calibration
subset, and they are recorded in `data/judge/warm.json` as such. They are not a result.

**One finding does survive the small sample, because both raters produce it independently:**

| rater | turns carrying at least one ungrounded claim |
|---|---|
| Human, 36 graded rows | **9 / 36 = 25.0%** |
| Judge, same 36 rows | **14 / 36 = 38.9%** |
| **§8a ceiling** | **2% — about 1 turn in 58** |

Both are an order of magnitude over the ceiling, and the human's number is the conservative one,
collected blind and before the judge existed. **The ungrounded-claims gate is not close on any arm
measured so far, and that cannot be attributed to a strict judge.** Per-arm, the human flags
`firestore-direct` on 4/12 turns and `firestore-vector` on 5/12; `pgvector-rag` scores 0/12 only
because it refused five of its twelve turns outright, which its correctness column pays for.

§8a pre-committed to this exact situation: *"If every arm fails the quality floor: ◆G7 stays open.
Record that nothing cleared the bar, fix the system — prompt, slice, `max_tokens`, or model — and
re-run. The floor does not move."* Nothing here is grounds to move it. It is grounds to expect
that a full Tier 2 pass reports a failed groundedness gate for every arm, and to start thinking
about which of prompt, slice or model is the fix.

| output | value |
|---|---|
| Judge/human agreement rate | **measured** — see the table above |
| Correctness, per servable class, per arm | **— pending.** Requires a full Tier 2 run over the admissible arms; the subset run covers 6 of 28 fixtures. |
| Ungrounded claims as % of turns, full set | **— pending.** Same run. Indicated at 25–39% against a 2% ceiling. |
| Any Tier 2 number for `hybrid-slice-lexvec` | **— pending.** It postdates the graded packet, so it has no human rows and was excluded from calibration. |
| Judge token cost, full pass | **— pending.** ~$0.50 projected from `--dry-run`: 567 calls / ~2.75M input tokens at the 2026-08-03 rate. |

---

## 7. The decision, the numbers behind it, and what would reverse it

§10 item 7.

### 7.1 The decision

**There is none. ◆G7 remains open**, and §8a pre-committed to exactly this posture: quality gates,
cost decides — *"any arm below the correctness/groundedness threshold is out, however cheap. A
cheaper wrong answer is not cheaper."* The correctness and groundedness thresholds are unmeasured
for every arm, so **step 1 of the decision rule has not been executed**, and steps 2 and 3 are not
reachable until it has.

Recording this rather than picking a winner from the numbers that *do* exist is not caution, it is
the pre-registration working as designed. Cost is fully measured and it is the axis §8a explicitly
ranked second.

### 7.2 What is actually established

| established | number |
|---|---|
| Both admissible arms clear all three **Tier 1** hard gates | `firestore-direct` 95.3% citations / 0 of 187 figures / 3 of 3 refusals; `hybrid-slice-lexvec` 100% / 0 of 224 / 3 of 3 |
| Cost at realistic volume is a **non-issue** | $4.33–$12.14/month at 10k requests; the whole spread is ~$8 |
| The break-even that matters | **45,613 requests/month**, direct-feed vs a deployed pgvector arm |
| Both admissible arms have **zero fixed cost** | vs the legacy stack's $7.67/month floor at zero traffic |
| `firestore-direct` is **structurally blind** on `deep-in-manual` | 2.4% chunk recall (floor 20.2%), and a real 0/2 with 5 ungrounded claims on the one such fixture a human graded |
| `hybrid-slice-lexvec` reaches that class | 24.5% recall (floor 20.2%) — **diagnostic, not a gate**, and with **no servable-set exemption** it must still clear 1.0/2 there |
| The hybrid costs ~25% more per answer, everywhere | 12,985 vs 11,023 prompt tokens, 81.4% vs 99.0% cache; no crossover exists |

### 7.3 What is not established

- **Correctness and groundedness for every arm.** The two gates that decide ◆G7.
- **Any quality number at all for `hybrid-slice-lexvec`**, human or machine, beyond Tier 1.
- **A trustworthy latency figure for any arm** (§1a) — so §8a's 1.5s p95 TTFT veto is unapplied.
- **A cold pass for `hybrid-slice-lexvec`**, and a genuinely cold price for `firestore-direct`.
- **`firestore-vector` and `hybrid-slice-vector` on the current corpus** — both pending capture.
  Without `hybrid-slice-vector` there is no measurement of what the *lexical* half of the hybrid
  buys at the answer layer, only at the retrieval layer.

### 7.4 What has to happen, in order

0. **Fix the two judge defects §6.4 exposed** — give `correctnessPrompt` the retrieval context
   when the turn's `must_not` is an invention check, and re-specify the citation-support
   dimension or drop it. Both cost nothing to change and both are cheaper to fix before a full
   pass than to re-run after one. The calibration pass is repeatable for $0.08.
1. **Bump `PRICES_READ_ON`** — re-read the three source pages and update `src/eval/prices.ts`
   (§4) — including `gpt-oss-120b`'s, since it is now the judge as well as a candidate model. The
   file's own doc comment makes this a precondition of publishing this document.
2. **Add `hybrid-slice-lexvec` to `scenarioArms()`** so `npm run cost` prices it and the † figures
   stop being hand arithmetic.
3. **Fix the timing instrumentation and re-capture**, including a cold pass for the hybrid. Until
   then §1's latency column is decorative.
4. **Capture `firestore-vector` and `hybrid-slice-vector`** on the 15-document corpus. Neither
   needs a code change — `firestore-vector`'s chunk collection was wiped and re-seeded to 393
   chunks on 2026-08-24, so its Tier 1 failure is a fact about stale transcripts, **not a broken
   adapter**.
5. **Re-run `npm run gate:check`** over the new captures. Tier 1 failures are eliminations; nothing
   proceeds past them.
6. **Run Tier 2** — `npm run judge -- --calibration`, then `--calibrate` to report agreement and
   kappa against the 36 human rows, then the full run over Tier 1 survivors. **If agreement is
   poor, fix the rubric — do not quietly keep the judge's scores** (§7b). The
   `threshold-do-hypoxia` turn-2 note (§5.5), where the human recorded *"genuinely borderline 0 vs
   1"*, is the first place to look.
7. **Grade `hybrid-slice-lexvec` into the human sample** — it is currently the only admissible arm
   with no human judgement whatsoever, which makes its calibration join one-sided.
8. **Fill §1, close ◆G7 in [`timeline.md`](timeline.md)'s gate table, and delete this status
   block.**

### 7.5 What would reverse the decision, once there is one

Written now, while there is no result to rationalise:

- **Cached-input pricing.** Direct-feed's entire cost case rests on the 50% discount at
  `gpt-oss-20b`. If cached input rises toward uncached, direct-feed's ~11K static tokens per
  request stop being nearly free and it loses on cost outright. **Re-run this report.**
- **A model change.** At `gpt-oss-120b`'s 90.7% discount the ranking inverts and direct-feed
  becomes cheaper on input than the smaller model. **A model swap invalidates the cost conclusion
  entirely**, not marginally.
- **Corpus growth.** The ◆G9 slice is ~9.4K tokens. Grow it past the context window, or past the
  point where the cache prefix stays byte-identical, and direct-feed's economics collapse. The
  corpus has already been rescoped three times.
- **Volume above ~46k requests/month**, sustained, against a deployed pgvector arm. Below it, zero
  fixed cost dominates; above it, marginal cost does.
- **A `deep-in-manual` correctness result.** If Tier 2 finds the hybrid clears 1.0/2 on that class
  and direct-feed's excused blindness is costing real users real answers, the split outcome §8a
  named becomes the answer regardless of the ~25% cost premium — because at 10k requests/month that
  premium is **$1.52 per month.**
- **The reasoning-token finding.** If `max_tokens` and reasoning effort are tuned in N5, every
  arm's output cost moves by more than the gap between arms. Cost as a tiebreaker gets weaker, not
  stronger.

**And one thing that would not reverse it: any retrieval metric.** Recall, precision, MRR and nDCG
remain diagnostics with no pre-registered target. A model can be handed perfect context and still
invent a number — which is the failure Tier 1 exists to catch, and it caught five of them on
`firestore-vector`. **81.8% recall is not a result about answers.**

---

## 8. Pending ledger — every blank in this document

| § | blank | what fills it |
|---|---|---|
| 1 | correctness, all arms | Tier 2 run (`npm run judge`) |
| 1 | groundedness, all arms | Tier 2 run |
| 1 | `hybrid-slice-lexvec` cold cost, cold cache rate, cold p95 | a cold-pass capture — the arm was swept warm-only |
| 1 | `firestore-direct` genuinely-cold cost | `npm run cost -- --cache-rate=0`; the captured cold pass still measured 95.5% cached |
| 1 | `hybrid-slice-lexvec` cost via `npm run cost` | add it to `scenarioArms()` in `src/eval/costScenarios.ts` |
| 1a | any trustworthy latency figure | fix the negative-timing instrumentation, re-capture |
| 1a | §8a's 1.5s p95 TTFT veto | the same |
| 2 | `hybrid-slice-lexvec` Firestore read charge | measure reads per query for the composed adapter |
| 4 | current prices | re-read the three sources, bump `PRICES_READ_ON` |
| 4 | a judge-model rate newer than 2026-08-03 | re-read the Fireworks catalogue, bump `PRICES_READ_ON` |
| 6 | whether a cross-family judge changes the scores | re-run with `JUDGE_MODEL=` set to another family, once its rate is priced |
| 5 | every `hybrid-slice-lexvec` sample score | grade it into `scores.csv` |
| 6 | ~~judge/human agreement, Cohen's kappa~~ | **done 2026-08-26** — §6.4 |
| 6 | ~~judge token cost in USD~~ | **done** — $0.0777 for the calibration pass; ~$0.50 projected for a full one |
| 6 | a usable citation-support dimension | re-specify it; kappa −0.06 is worse than chance (§6.4) |
| 6 | correctness scored against invention-type `must_not` items | give `correctnessPrompt` the retrieval context when the rubric's `must_not` is an invention check (§6.4) |
| 6 | Tier 2 over the other 22 fixtures | `npm run judge` without `--calibration`, after the fix above |
| 6 | 138 of 174 human grading rows | human grading, or the judge once the two §6.4 defects are fixed |
| 7 | **the decision** | all of the above |

---

*Draft — ◆G7 open. Re-run this report, don't rewrite the plan, whenever `LLM_MODEL` changes
materially, Fireworks pricing changes, or the corpus grows substantially
([`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §10).*
