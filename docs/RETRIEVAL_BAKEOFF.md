# Retrieval Bake-off — Direct-Feed vs RAG

The experiment design for comparing a **direct-feeding brain** (put the source text in the prompt,
let the model read it) against a **RAG brain** (embed, search, inject only the top matches) for the
Clean Earth chatbot.

This resolves ◆G7 by **measurement instead of argument**. It is planned as
[Phase N2](timeline.md#phase-n2--retrieval-bake-off-direct-feed-vs-rag) and depends on the Phase N1
retrieval seam existing first.

Companion docs: [`timeline.md`](timeline.md) (phases + gates), [`SPECS.md`](SPECS.md) (what's built),
[`migration/MIGRATION_SPEC.md`](migration/MIGRATION_SPEC.md) (legacy RAG behavior, the parity target).

---

## 1. Why this exists: cost

**Cost is the reason we are running this comparison at all.** The two strategies have structurally
different cost shapes, and which one is cheaper for *this* corpus at *our* query volume is not
knowable from first principles — it depends on numbers we have to go measure.

> For this corpus and these questions, does retrieving beat just showing the model the material —
> and what does each one cost per answer?

RAG exists to fit a corpus that won't fit in context, at the cost of a retrieval step that can miss.
Direct feeding can't miss — but it pays input tokens on every request and is bounded by the context
window. The corpus here is small enough that the answer is genuinely not obvious.

### The cost shapes

| | direct-feed | RAG |
|---|---|---|
| **Per request** | Large, ~constant input (the whole slice) + output | Small input (top-k chunks) + output + one query embedding |
| **One-time / amortized** | none | Embed the corpus (~490 chunks, ~339K tokens), build the index |
| **Ongoing infra** | none | Vector index storage; a Postgres instance if pgvector wins |
| **On a corpus change** | nothing — next request just reads the new text | Re-chunk, re-embed, re-index the changed documents |
| **Cost predictability** | Flat and easy to forecast: cost ≈ requests × slice size | Low marginal cost, but an infra tail that exists at zero traffic |

### The per-answer model

Fill the prices in from the Fireworks pricing page **at run time** — the serverless catalogue and its
rates rotate, so no number is hard-coded here.

```
direct_feed = (S_sys + S_slice) × P_in + O × P_out
rag         = (S_sys + k × C)   × P_in + O × P_out + Q × P_embed
              + amortized( corpus_tokens × P_embed + index_storage_per_month )

  S_slice ≈ 21K tokens (small tier, ◆G9)     k × C ≈ 5 × ~800 = ~4K tokens (top-k 5 @ 3200 chars)
```

So direct-feed carries roughly **5× the document-context tokens per request** — before caching. That
"before caching" is the crux:

- **Prompt caching is what decides this.** The slice is byte-identical on every request, so it is the
  ideal cache target — which is precisely why the static-first prompt ordering (§4) is mandatory and
  not a style preference. If cached input bills at a steep discount and hit rates are high, the 5×
  largely collapses and direct-feed may be **cheaper in total** once RAG's embedding and infra costs
  are counted. If hit rates are poor, direct-feed loses on cost outright.
- **RAG's cost isn't only tokens.** A Postgres instance or a vector index bills whether or not anyone
  asks a question, and every corpus edit re-runs embedding. Direct-feed has no such tail.

### Break-even

Compute where the two cross, and report it as a chart in the deliverable (§10):

```
requests_per_month × (direct_feed − rag_marginal) = rag_fixed_per_month
```

Below break-even, direct-feed's zero fixed cost wins; above it, RAG's cheaper marginal cost wins.
**Locating that crossover against our realistic traffic is the single most decision-relevant number
this experiment produces** — more so than any individual quality score.

---

### Planning inputs (supplied 2026-07)

| input | value | status |
|---|---|---|
| Projected volume | **100,000 requests/month**, as a soft capacity ceiling. Realistic expectation is "tens of thousands." | Given |
| Fireworks cost | Assumed to fall inside free/trial credits unless our usage exceeds them | **Assumption — must be verified against the volumes below** |
| Firestore | Assumed inside the Always Free daily quota | Assumption — verify, incl. the `(default)`-database caveat |

**Run the arithmetic before trusting the free-tier assumption.** At the ceiling:

| | context tokens/request | **input tokens/month @ 100k** |
|---|---:|---:|
| direct-feed (21K slice + ~0.7K system) | ~21,700 | **~2.17 billion** |
| RAG (5 chunks ≈ 4K + ~0.7K system) | ~4,700 | **~0.47 billion** |
| difference | ~17,000 | **~1.7 billion** |

Plus completion tokens. Measured live at C4/C5: **258–349 completion tokens for one-sentence
answers**, because gpt-oss emits reasoning tokens before visible output. At 100k requests that is
~30M completion tokens/month, and it means **cost per answer cannot be estimated from answer
length** — a four-word reply is not a cheap reply.

Two consequences worth stating plainly:

1. **A ~2.17-billion-token month is very unlikely to sit inside any free tier.** Free/trial credits
   are the right assumption for *development and the bake-off itself* — a few thousand requests — but
   not for the projected ceiling. Price it before committing to direct-feed.
2. **This volume may invert the break-even conclusion.** Earlier reasoning in this doc leaned on
   direct-feed's zero fixed cost winning at low traffic. At 100k requests/month the extra ~1.7B input
   tokens plausibly dwarf an always-on database instance, which would favor RAG. Whether prompt
   caching closes that gap is exactly what the experiment must measure — cached input is typically
   discounted steeply, and the slice is byte-identical every request, so the potential is large. But
   "potential" is not a number.

At realistic traffic (say 10k/month), the same figures are ~217M vs ~47M input tokens — a materially
different conversation. **Report the break-even curve across the range 1k → 100k rather than a single
figure**, so the decision survives the traffic estimate being wrong.

---

### Standing / upkeep costs — count these, not just tokens

Token cost is the visible half. The other half is **what each option costs to keep alive at zero
traffic**, and it is where the arms differ most sharply. Two separate figures matter and must not be
conflated:

- **Experiment cost** — what we pay to *run* the bake-off (mostly local Docker + a few dollars of
  inference). Small.
- **Steady-state cost** — what we'd pay to *operate* the winner for a year. This is what the decision
  is actually about. The pgvector sidecar runs locally for free during the experiment; that tells us
  nothing about what it costs deployed, so the report must price the deployed counterfactual.

| Cost line | direct-feed | `firestore-vector` | `pgvector-rag` (deployed counterfactual) | Verify |
|---|---|---|---|---|
| **Datastore idle** | Firestore — serverless, **no idle charge**; pay per read/write/storage | Same, plus vector-index storage | **Cloud SQL bills per hour regardless of traffic — no scale-to-zero.** Even the smallest instance is a 24/7 line item, and it typically dominates everything else at our volume | GCP pricing calc |
| **Free tier** | Firestore has an "Always Free" daily quota (reads/writes/deletes/storage) — plausibly covers a demo entirely | Same quota, but vector search consumes reads faster and the index adds storage | None. Cloud SQL has no free tier | **Confirm the current quota numbers, and confirm they apply to the `(default)` database — named databases have historically billed differently.** Our config defaults to `(default)` (`FIRESTORE_DATABASE_ID`) |
| **Compute (the app)** | Cloud Run, scale-to-zero, shared by all arms | same | same, **plus** the DB instance | Constant across arms → cancels out of the comparison, but include it in the absolute figure |
| **LLM inference** | Fireworks serverless: per-token, **no idle cost** | same | same | Note if a dedicated deployment is ever considered — that bills by GPU-hour and changes the shape completely |
| **Embeddings** | **none — this arm needs no embedding model at all** | Corpus embedding once (~339K tokens) + one query embedding per request + re-embed on corpus change | Same | Fireworks embedding rate |
| **Index/storage** | Document text only | Vectors + index | Vectors + index + WAL/backups | — |
| **Ops burden** | Nothing to run, patch, back up, or monitor | Managed | **A database to run, patch, back up, monitor, and pay for** — the cost that doesn't appear on any invoice line | Estimate honestly |

**The structural point, stated plainly:** direct-feed's fixed cost is genuinely **zero** — no index,
no embedding model, no database beyond the Firestore we already run. `pgvector-rag` deployed means an
always-on database instance. At low query volume that single fact is likely to outweigh every
per-token difference in this document, which is exactly why the break-even curve, not the per-answer
price, is the deliverable's headline.

**Also price the experiment itself** before running it: ~25–30 conversations × N arms × 2 (cold/warm)
× (avg turns) inference calls, plus the judge's calls if an LLM grades (§7). Small, but it should be a
known number rather than a surprise.

**And price the legacy baseline honestly.** The old stack was FastAPI + Postgres/pgvector — a
container *and* a database, both always on. That's the cost floor we migrated away from; the report
should state it so "what did this migration save?" is answerable with a number.

**Scope: document context only.** Sensor data is out of scope — it reaches the model through the
backend-mediated `query_sensor_data` tool call in *every* arm, unchanged. Holding it constant is
what makes the arms comparable.

---

## 2. The arms

All arms implement the same Phase N1 interface — `getContext(query, opts?) => Promise<Chunk[]>`
returning `Chunk = { id, text, source, score? }` — and register under a mode name selected by
`DEFAULT_RETRIEVAL`, overridable per request when `DEBUG_RETRIEVAL=true`. That override is the
switch the bake-off runs on: same server, same session, one field different.

| mode | what it does | `score` | infra added |
|---|---|---|---|
| `stub` | fixed fake chunks (N1 control — proves the harness, not the strategy) | none | none |
| `firestore-direct` | **direct feed.** Reads the configured corpus slice from Firestore and returns it whole, in a stable document order. No embedding, no ranking, no top-k. | none | none |
| `pgvector-rag` | **legacy-parity RAG.** Hybrid dense (cosine) + Postgres full-text (BM25-ish), fused with RRF (`RRF_K=60`), top-k 5 of 20 fetched per branch — exactly `MIGRATION_SPEC.md` §7. | fused RRF | Postgres + pgvector sidecar (**dev-only**) |
| `firestore-vector` | RAG on Firestore native vector search (`findNearest`), dense-only unless a lexical path is added | cosine | Firestore vector index |

### On the `pgvector-rag` arm

Standing this arm up **re-introduces the stack ◆G1 resolved away from**. That is deliberate and
narrow: it is the only honest baseline for "what we had before," and a bake-off against a
reimplementation-from-memory proves nothing. Constraints:

- Dev/experiment only — a `docker-compose.bakeoff.yml` sidecar, never in the deployed image, never
  in the Cloud Run path.
- It is a **measuring stick, not a migration reversal.** If it wins, the follow-up decision is
  whether to port its *technique* (hybrid + RRF) onto the production store — not to move back.
- Delete the sidecar once ◆G7 is resolved.

### On the `firestore-vector` arm — ◆G10 **RESOLVED → included**

All three arms run. Including it answers "is Firestore's vector search good
enough?" directly; excluding it keeps the experiment to two arms and one week. Note that
**Firestore has no full-text search**, so this arm is dense-only unless a lexical path is built
(keyword-token field + `array-contains`, or an external text-search service) — which is exactly the
weakness the legacy hybrid was built to fix, and one the direct-feed arm doesn't have.

---

## 3. The hard constraint: the corpus doesn't fit

From `MIGRATION_SPEC.md` §10.1 — 9 authoritative documents, ~1.357M characters, **~339K tokens**:

| slice | ~tokens | direct-feed viable? |
|---|---:|---|
| Full corpus (9 docs) | ~339K | **No** — exceeds mainstream context windows |
| Largest single doc (`volunteer_stream_monitoring…`) | ~117K | Borderline; one doc consumes the whole window |
| Mid tier (`rwqc2012` + `tm9a6.2` + `tm9a6.8`) | ~102K | Borderline |
| **Small tier** (`aquatic-life-criteria-table.md` + USGS DO + factsheet) | **~21K** | **Yes** — cheap, cacheable |

**Confirm the configured model's actual context limit before fixing the slice** — `LLM_MODEL`
defaults to `accounts/fireworks/models/gpt-oss-20b`, and the serverless catalogue rotates, so treat
the limit as a config-time fact to verify, not a constant.

So "direct feeding" is not "feed everything." It needs a defined slice — ◆G9.

### ◆ G9 — direct-feed corpus slice — **RESOLVED → small tier (~21K tokens)**

Selected: `aquatic-life-criteria-table.md` + `Dissolved Oxygen and Water _ U.S. Geological Survey.pdf`
+ `nutrient-lakes-reservoirs-factsheet-final.pdf`. The long manuals are out of reach for this arm;
questions that need them are expected to fail here, and that gap is part of what the eval measures.

| option | tokens/request | trade-off |
|---|---:|---|
| **Small tier only** (recommended start) | ~21K | Fits comfortably, caches well, and is the *authoritative* material (criteria tables) most questions actually need. Long manuals become unanswerable. |
| Whole-doc selection | ~4–117K | A cheap classifier/metadata filter picks 1–2 docs, then feeds them whole. Reintroduces a selection step that can miss — a weaker claim to "can't miss." |
| Distilled corpus | ~20–40K | Pre-summarize the long manuals into a compact reference. Highest quality-per-token, but the distillation itself becomes a build artifact to maintain and validate. |

Recommendation: **start with the small tier.** It's the fastest arm to stand up and it isolates the
variable — if direct feeding can't win on the material that *does* fit, the slice question is moot.

---

## 4. Controls

The arms differ in one thing: how document text reaches the prompt. Everything else is pinned.

- Same `LLM_MODEL`, same temperature, same generous `max_tokens` (gpt-oss emits reasoning tokens
  before visible output and truncates to empty if starved).
- Same system prompt and the same **static-first prompt ordering** (system instructions → document
  context → user question last). Required for Fireworks prompt caching; do not interleave. This
  ordering matters far more to the direct-feed arm — see §6.
- Same `user` field per request for serverless cache affinity.
- Same sensor tool path, same corpus source files, same chunking where chunking applies
  (3200 chars / 400 overlap, quality filter, OCR for the scanned PDF).
- Same eval set, run in the same order, against a fixed model snapshot. Re-run all arms if
  `LLM_MODEL` changes mid-experiment — cross-model comparisons are void.

---

## 5. Eval set — fixed conversations, not loose questions

~25–30 **conversations**, fixed and version-controlled, each replayed turn-by-turn in a set order
against every arm. Multi-turn is not optional: follow-up and pronoun-resolution behavior only shows
up across turns, and it's where a thin retrieval context tends to fail.

Each fixture is a committed file:

```jsonc
{
  "id": "threshold-lookup-trout-do",
  "class": "threshold-lookup",
  "turns": [
    { "role": "user", "content": "what DO level is unsafe for trout?" },
    { "role": "user", "content": "and how does that compare to what our pod is reading?" }
  ],
  "rubric": {
    "must_contain": ["numeric threshold with units", "cites the criteria source"],
    "must_not": ["invents a threshold", "cites a document that lacks it"],
    "notes": "turn 2 requires a query_sensor_data call — tests doc + sensor in one conversation"
  }
}
```

Rubrics are written **before any arm runs**. Classes below; each is realized as one or more
conversations. Drawn from the N8 acceptance conversations plus the cases that discriminate between
the strategies:

| class | why it's in the set | expected to favor |
|---|---|---|
| Definitional ("what is ORP?") | baseline competence | tie |
| **Acronym / exact-token** ("ORP", "NTU", "CFU/100mL") | dense retrieval underweights rare tokens — the reason the legacy build was hybrid | direct-feed, `pgvector-rag` |
| Threshold lookup ("what DO level is unsafe for trout?") | needs the criteria table verbatim | direct-feed |
| Cross-document synthesis | needs material from 2+ sources at once | direct-feed |
| Deep-in-manual detail | material only in the long docs | RAG (the slice excludes them) |
| Follow-up / pronoun resolution | multi-turn context handling | tie |
| Precedence (operator range vs. document) | operator ranges are authoritative over documents | tie |
| Out-of-scope refusal | must refuse cleanly, not confabulate | tie |
| Sensor + document combined | both paths in one answer; needs the tool-round cap raised | tie |

---

## 6. Metrics

Per question, per arm. **Cost is the deciding axis; quality is a floor** — see §8.

**Cost** (the deciding axis)
- **Input / output tokens per answer**, split **cached vs. uncached input** — the split, not the
  total, is what determines direct-feed's viability.
- **Cost per answer**, cold and warm, priced at run-time rates.
- **Prompt-cache hit rate.** Pivotal. Direct-feed sends ~21K static input tokens every request; its
  economics live or die on those being cached. Report cold and warm separately, never blended.
- **RAG fixed costs:** one-time corpus embedding, index storage per month, and re-embedding cost per
  corpus change.
- **Break-even request volume** (§1), plotted against realistic traffic.

**Quality** (the floor — an arm that fails here is disqualified regardless of price)
- Correctness against the rubric — 0/1/2, graded blind to arm.
- **Groundedness** — every factual claim traceable to provided text. Ungrounded claims are the
  failure mode that matters; count them.
- **Citation validity** — cited source actually contains the claim.
- **Retrieval miss rate** (RAG arms only) — the needed passage wasn't in the returned chunks. This
  is structurally 0 for direct-feed within its slice, and that asymmetry is the whole point.

**Latency**
- Time-to-first-token and total wall time, p50 and p95, cold and warm.

**Operational / upkeep** (per §1 — these are per-arm, not per-question)
- **Idle cost**: what the arm bills at zero traffic. Direct-feed: nothing. `pgvector-rag` deployed: a
  full always-on database instance.
- Whether the arm fits inside Firestore's free-tier daily quota at projected volume, or blows past it.
- Index build/refresh time and cost; what a document add/change triggers (direct-feed: nothing;
  RAG: re-chunk, re-embed, re-index).
- Ops burden — patching, backups, monitoring — stated even though it never appears on an invoice.

---

## 7. Protocol — programmatic capture, then separate grading

Two distinct phases. **Generation is automated; grading is a separate offline pass over saved
transcripts.** Keeping them separate is what makes blind grading and re-grading possible.

### 7a. Capture (scripted)

A runner script drives the real service over HTTP — no in-process shortcuts, so the measured latency
and token counts are the ones production would see.

```
npm run bakeoff -- --arm=firestore-direct --pass=cold
```

- **Replays each fixture in a fixed order**, one conversation at a time: fresh session per
  conversation, turns sent sequentially with prior turns as history, arm selected via the request's
  `retrieval` field (`DEBUG_RETRIEVAL=true`). Same server, same session, one field different between arms.
- **Pin temperature to 0** for the eval runs and record it. Sampling variance across arms would be
  measuring the sampler, not the strategy. If budget allows, repeat the set k=3 to quantify residual
  variance; if not, say so in the report.
- **Two passes: cold then warm** — cold caches for worst-case cost/latency, warm for steady-state.
  Never blend them.
- **Saves one transcript per (conversation × arm × pass)**, committed:

  | captured | why |
  |---|---|
  | Full conversation — every user turn and assistant response, verbatim | the graded artifact |
  | **The exact context supplied to the model** (chunks or slice, in order) | **groundedness cannot be graded without it** — this is the field most likely to be forgotten and the one that makes or breaks the eval |
  | Tool calls made and their results | sensor path must be identical across arms; this proves it |
  | Token usage **split cached vs. uncached input**, plus output | the cost numbers |
  | TTFT, total wall time, per turn | the latency numbers |
  | Arm, `LLM_MODEL`, embedding model, temperature, pass, timestamp, git SHA | reproducibility; results without these can't be re-derived later |

- Before collecting anything, spot-check each arm on three queries and eyeball the returned context.
  A misconfigured adapter that silently returns empty context will otherwise produce a clean-looking,
  completely meaningless dataset.

### 7b. Grading (human or LLM judge)

Runs over the saved transcripts, arms stripped.

- **Blind and shuffled.** Replace arm labels with opaque ids and randomize order before grading.
  Neither a human nor a judge model should be able to tell which strategy produced an answer.
- **Rubric-anchored scores**, not vibes: correctness 0/1/2 against the fixture's rubric, groundedness
  as a count of claims not supported by the captured context, citation validity as a boolean per citation.
- **If an LLM judges:**
  - Use a **different model than the one under test** — a model grading its own output has a
    documented self-preference bias.
  - Give the judge the question, the rubric, the answer, **and the context that was supplied** —
    groundedness is unjudgeable without the last one.
  - Judge one dimension per call. Combined "rate this answer 1–10" prompts collapse distinct failure
    modes into one uninformative number.
  - **Calibrate against a human on ~20% of transcripts** and report the agreement rate. If agreement
    is poor, fix the rubric — do not quietly keep the judge's scores.
  - Count the judge's own token cost in the experiment budget (§1).
- **Disagreements and edge cases go in the report**, not just the mean. A single catastrophic
  ungrounded answer matters more than a small average difference.

Transcripts and scores are both committed, so any conclusion can be re-checked — and re-graded with a
better rubric — without re-running a paid sweep.

---

## 8. Decision rule

Written before the data, so the result decides rather than the preference. **Quality gates,
cost decides:**

1. **Quality floor first.** Any arm below the correctness/groundedness threshold is out, however
   cheap. A cheaper wrong answer is not cheaper.
2. **Among arms that clear the floor, total cost of ownership at our projected volume wins** —
   per-answer cost at realistic cache hit rates, *plus* RAG's fixed infra and re-embedding costs, read
   off the break-even curve (§1).
3. **Latency ceiling is a veto**, not a tiebreaker.

Applied:

- **Direct-feed wins** if it clears the quality floor and sits on the cheap side of break-even at our
  volume. Then ◆G7 resolves to "no vector store," which deletes an entire subsystem — embeddings,
  index, re-index-on-change — from the roadmap and from the bill.
- **RAG wins** if direct-feed's slice can't cover the questions users actually ask (quality floor), or
  if cache economics don't hold and volume is above break-even. Then ◆G7 becomes the narrower choice
  between `firestore-vector` and porting the hybrid technique, and the lexical-arm problem (§2) must
  be solved explicitly.
- **Hybrid outcome is a real and likely result** — direct-feed the small authoritative tier (which
  every answer wants and which caches), RAG the long manuals. If the data says this, take it; the
  adapter registry composes without a rewrite.

Whatever wins, record the outcome and the numbers in `timeline.md`'s gate table and close ◆G7.

---

## 9. Exit criteria

- All selected arms registered and selectable by config; each verified on spot-check queries.
- **Conversation fixtures + rubrics committed** before any arm runs.
- **Capture runner built**, saving full transcripts *including the context supplied to the model* and
  the cached/uncached token split.
- Transcripts and grades committed; if an LLM judged, the human-agreement rate is recorded.
- **Standing/upkeep costs priced** for each arm's deployed counterfactual, not just token costs.
- **The comparison report (§10) written and committed** — this is the deliverable, not a by-product.
- ◆G7 resolved with the numbers that resolved it; ◆G9 and ◆G10 closed.
- The pgvector sidecar removed once the decision is recorded.

---

## 10. Deliverable: the comparison report

The experiment's output is a committed document — **`docs/RETRIEVAL_COMPARISON.md`** — not a verbal
conclusion. It exists so the retrieval decision, which is primarily a **spend** decision, can be
re-examined later when prices, models, corpus size, or traffic change. Every one of those moves the
answer, so the report must show the working, not just the verdict.

Required contents:

1. **The headline table** — one row per retrieval method:

   | method | cost/answer (cold) | cost/answer (warm) | cache hit rate | **idle $/mo** | **12-mo TCO @ projected volume** | correctness | groundedness | p95 latency |
   |---|---|---|---|---|---|---|---|---|
   | `firestore-direct` | | | | **$0** | | | | |
   | `pgvector-rag` | | | | (DB instance, 24/7) | | | | |
   | `firestore-vector` | | | | (index storage) | | | | |

2. **The upkeep breakdown** — the §1 standing-cost table filled in with real figures: datastore idle
   charge, whether we land inside or outside Firestore's free-tier quota, compute, embeddings, index
   storage, and ops burden. Include the **legacy FastAPI + pgvector cost floor** as a reference row,
   so "what did the migration save?" has a number.
3. **The break-even chart** — cost vs. requests/month per method, with our projected volume marked.
   The crossover point is the report's most reusable artifact.
4. **Prices, quotas, and model id used, with the date they were read.** Fireworks rates, the
   serverless catalogue, and GCP free-tier quotas all change; an undated cost table is worthless in
   six months.
5. **Sample outputs side by side** — the same 3–5 conversations answered by each arm, verbatim from
   the transcripts, so the quality difference is legible and not just a score. Include at least one
   case each arm loses.
6. **How quality was graded** — human, LLM judge, or both; which judge model; the human/judge
   agreement rate on the calibration sample. A quality claim without this is unfalsifiable.
7. **The decision, the numbers that drove it, and what would reverse it** — e.g. "if cached-input
   pricing rises above X, if the corpus grows past Y tokens, or if volume exceeds the break-even
   point, re-run this."

Re-run the report — don't rewrite the plan — whenever `LLM_MODEL` changes materially, Fireworks
pricing changes, or the corpus grows substantially.

---

## 11. When and where this runs — **not now, not on this branch**

**Deferred by decision.** This is planned work, not current work. The `migration` branch stays scoped
to what it already contains: the Node/Express + Firestore skeleton and these planning docs. Building
adapters, standing up a pgvector sidecar, and running a paid eval sweep all belong elsewhere.

- **Sequence:** finish and merge `migration` → build **Phase N1** (the retrieval seam + `POST /chat`
  on the stub) → *then* open the bake-off.
- **Branch:** its own — e.g. `feat/retrieval-bakeoff`, cut from `demo` after `migration` lands. The
  pgvector sidecar in particular must never appear in a branch headed for deploy.
- **Prerequisite:** Phase N1's adapter registry and `DEBUG_RETRIEVAL` override must exist first.
  There is nothing to compare until there is a seam to compare across, and no arm can be built before
  the interface is fixed.
- **Also needed before starting**, none of it code:
  - ~~Projected requests/month~~ — **supplied: 100,000/month soft ceiling** (§1).
  - **Current Fireworks pricing**, including the **cached-input** rate, checked against the ~2.17B
    tokens/month the ceiling implies (§1). The free-tier assumption is unverified and probably does
    not hold at that volume.
  - **Current Firestore free-tier quotas + GCP pricing**, and confirmation of whether the free quota
    applies to our `(default)` database.
  - **A Cloud SQL (or equivalent) quote** for the smallest instance that would host pgvector — the
    deployed counterfactual's dominant cost line.
  - **A decision on who grades**: human, LLM judge, or judge-with-human-calibration (§7b).

Until then this document is a plan of record. Nothing here should be implemented on `migration`.
