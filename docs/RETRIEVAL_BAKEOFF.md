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
| **One-time / amortized** | none | Embed the corpus (393 chunks, ~213K tokens since the 2026-08-24 trim; 305 chunks when the arms were swept), build the index |
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

> **`S_slice` was superseded before any arm ran.** ◆G9's original small tier was ~21K tokens; the
> 2026-07-29 revision (§3) replaced it with the operator reference plus the four probe datasheets,
> **~9.4K tokens — 11,023 prompt tokens as actually sent**. The 5× ratio below is therefore the
> pre-revision estimate; the measured numbers are in §1b and §4b. The shape of the argument is
> unchanged, which is why it is left standing.

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

### 1b. The prices — read 2026-08-03, and the cached-input rate resolved

The unknown this whole section was written around is now filled in. Recorded as data in
`src/eval/prices.ts` with the date and source URL attached, because the serverless catalogue
rotates and an undated price sheet makes a cost conclusion unauditable.

**Fireworks serverless, USD per 1M tokens** ([docs](https://docs.fireworks.ai/serverless/pricing)):

| model | input | cached input | output | cache discount |
|---|---:|---:|---:|---:|
| `gpt-oss-20b` (**ours**) | $0.07 | **$0.035** | $0.30 | **50%** |
| `gpt-oss-120b` | $0.15 | **$0.014** | $0.60 | **90.7%** |
| `nomic-embed-text-v1.5` (137M → ≤150M tier) | $0.008 | — | — | — |

Fireworks documents 50% only as a *default*; per-model rates are authoritative, and the two models
we might plausibly run differ by a factor of 2.5 on this one line.

**Firestore Standard, us-central1**: reads $0.03/100k, writes $0.09/100k, deletes $0.01/100k.
Always Free is **50,000 reads/day**, and — the caveat flagged below, now confirmed —
**exactly one database per project gets it**. Our `FIRESTORE_DATABASE_ID` default of `(default)`
is the right side of that. A kNN query bills **one read per 100 vector-index entries scanned plus
one per document returned**, so ~305 chunks at top-k 5 costs 9 reads, not 5.

**Cloud SQL** has no free tier and no scale-to-zero. `db-f1-micro` is ~$7.67/month **compute only**.

#### The answer: the discount is real but it is not enough — on this model

Run `npm run cost` to reproduce any figure below. At 400 completion tokens and the measured 99.6%
warm cache rate:

| arm | per answer | @10k/mo | @100k/mo |
|---|---:|---:|---:|
| `firestore-direct` | $0.000503 | $5.03 | $50.30 |
| `pgvector-rag` (deployed) | $0.000411 | $11.78 | $48.82 |
| `firestore-vector` (projected) | $0.000414 | $4.14 | $41.42 |

Three findings, in order of how much they change the decision:

1. **A 50% discount does not collapse the 5× gap.** Direct-feed's warm input costs $0.000383
   against RAG's $0.000291 — it is still **~1.3× dearer per answer**, not cheaper. The handoff's
   hypothesis that caching might invert the naive story is **false at `gpt-oss-20b`**. Direct-feed
   wins below ~84k requests/month anyway, but it wins on RAG's *fixed* cost, not on tokens.
2. **The discount inverts the story at `gpt-oss-120b`, decisively.** At 90.7% off, direct-feed's
   warm input drops to $0.000159 while RAG's rises to $0.000590 — direct-feed becomes **~3.7×
   cheaper on input and cheaper at every volume in the range**. Note what this means: for *this*
   workload the larger model is **cheaper on input than the smaller one** ($0.000159 vs $0.000383),
   because its cache discount is steeper. That is a model-selection finding for N5 that the phase
   was not looking for, and it should not be allowed to quietly decide ◆G7 — the arms are pinned to
   `gpt-oss-20b` (§4), and re-running them on 120b is a separate, deliberate experiment.
3. **Completion tokens cost more than the retrieval strategy does.** At 1,300 completion tokens the
   output line is $0.000390 — larger than direct-feed's entire input cost. The spread between the
   cheapest and dearest arm at 100k/month is ~$9; moving average completion tokens from 1,300 to
   400 saves ~$27/month on *every* arm. **`max_tokens` and reasoning effort are worth more than
   this experiment's outcome**, which is a genuine, slightly deflating result and belongs in the
   report.

#### What this does to the decision

The absolute numbers are small enough to be worth saying plainly: **at the realistic 10k/month,
every arm costs between $4 and $12 per month.** The cost axis that this entire phase was built to
measure resolves to a spread of a few dollars.

That does not make the phase wasted — it converts its own conclusion. Cost was the tiebreaker
because it was assumed to be large; measured, it is small, so **quality and the operational tail
should carry more weight than §8's ordering implies**. The one cost fact that still bites is
structural rather than marginal: `pgvector-rag` deployed costs ~$8/month at zero traffic, which at
10k/month is **more than doubling** the bill for a strategy that saves $0.90/month in tokens.

§8's decision rule is **not amended here** — it was fixed before the data and stays fixed. This is
recorded as an input to it, and the read-out belongs in `RETRIEVAL_COMPARISON.md`.

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
| **Embeddings** | **none — this arm needs no embedding model at all** | Corpus embedding once (~213K tokens at the current corpus) + one query embedding per request + re-embed on corpus change | Same | Fireworks embedding rate |
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
- ~~Delete the sidecar once ◆G7 is resolved.~~ **Archived 2026-08-19, ahead of ◆G7 and by
  decision — the gate did not close.** The runtime code (adapter, `rrf.ts`, seeder, schema, compose
  file, config, the `pg` dependency) is in `archive/pgvector-rag/` and the mode is unregistered;
  the **evidence is retained and live** — the 56 transcripts, `eval/grading/warm/KEY.json`, the
  arm's cost scenario, and its row in `scripts/gradePacket.ts`. So the arm is still graded and still
  priced here; what it can no longer do is **run**. Re-running or re-capturing it means restoring the
  archive first — and because the system prompt is a pinned control (§4), a re-capture voids the
  other two arms unless they are re-captured too. See `SPECS.md` §14.

### On the `firestore-vector` arm — ◆G10 **RESOLVED → included**

All three arms run. Including it answers "is Firestore's vector search good
enough?" directly; excluding it keeps the experiment to two arms and one week. Note that
**Firestore has no full-text search**, so this arm is dense-only unless a lexical path is built
(keyword-token field + `array-contains`, or an external text-search service) — which is exactly the
weakness the legacy hybrid was built to fix, and one the direct-feed arm doesn't have.

---

## 3. The hard constraint: the corpus doesn't fit

From `MIGRATION_SPEC.md` §10.1 — the **legacy** corpus, 9 authoritative documents, ~1.357M
characters, **~339K tokens**. It has been rescoped twice since (to 8 docs / ~179K tokens on
2026-07-29, expanded to 18 docs / ~1.25M chars / 558 chunks on 2026-08-21, then trimmed to
**15 docs / 851,891 chars / 393 chunks** on 2026-08-24 —
[`../documents/README.md`](../documents/README.md)). The conclusion is unchanged in every version:

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

### ◆ G9 — direct-feed corpus slice — **RESOLVED → operator reference + probe datasheets (~9.4K tokens)**

Selected: `water-quality-metrics-source-of-truth.pdf` + the four Atlas Scientific probe datasheets
(EC, ORP, pH, DO). Every entry is about a parameter the DataPod actually reads.

> **Revised 2026-07-29.** The original selection (criteria table + USGS DO + nutrient factsheet,
> ~20K tokens) was tested live and failed: **83% of the budget was the aquatic-life criteria table**,
> a pandoc grid table whose cells are shredded across 8-character columns — "Pollutant" split over
> four lines, data values likewise. It was unreadable by *any* arm, and it covered metals and
> pesticides this sensor cannot detect. A threshold-lookup probe returned a refusal. The replacement
> is less than half the size and answers the same class of question correctly, with citations.

The long field manuals remain out of reach for this arm; questions needing them are expected to fail
here, and that gap is part of what the eval measures.

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

> **How the N3 tool layer preserves both of those (2026-08-13).** `query_sensor_data` and the
> tool-round loop are built, but gated on **`SENSOR_TOOL`, default off**. With the flag off the
> system prompt is byte-identical to the one all three arms ran against, and **no `tools` array is
> attached to the request at all** — `tools: []` is not sent either, since an empty array still
> perturbs the cacheable prefix. So both pinned controls hold and the captured arms remain valid
> and comparable while ◆G7 is open.
>
> Three things enforce this rather than leaving it to discipline. `test/unit/prompt.test.ts` pins
> the flag-off prompt by **SHA-256** for both water types — a stray newline reads as identical in
> review and produces a different cache prefix. The eval's `sensor-tool` capability is **derived
> from the same flag**, so a default-configured sweep replays exactly the 28 fixtures the arms ran
> rather than "running" two more against a tool the model was never offered. And turning the flag
> on **logs a warning at every startup**, because a capture run made with it on is not comparable
> to the captured three.
>
> **If an arm is ever re-run with `SENSOR_TOOL=on`, re-run all three** — and say so here.
- **One parse, one artifact.** `npm run ingest` parses `documents/` once into
  `data/corpus/corpus.json`, and every arm loads from it. If each arm parsed the PDFs itself,
  extraction differences would surface as answer-quality differences and be misread as one
  strategy beating another.

> **Deliberate deviation from legacy parity — the alpha-ratio filter.** The legacy quality filter
> (`MIGRATION_SPEC.md` §5.1 step 4) drops chunks whose alphabetic-character ratio is below 0.5. That
> rule cannot distinguish OCR noise from a **table**: markdown tables in this corpus score 0.07–0.14,
> so the legacy filter discarded **15 of 23 chunks** of `aquatic-life-criteria-table.md` — the
> corpus's most authoritative source of numeric thresholds.
>
> Left alone this would have **invalidated the experiment**, not merely lost data. Direct-feed
> consumes whole documents and keeps the table; the vector arms embed chunks and would lose most of
> it. Threshold-lookup questions — already in the eval set — would be won by direct-feed because of a
> filter bug rather than because feeding beats retrieving, and nothing in the final numbers would
> reveal it.
>
> The ratio test is therefore **skipped for `.md`/`.txt`**, where a low ratio means structure, and
> **kept for extracted and OCR'd PDF text**, which is what it was built for. Length and boilerplate
> filters are unchanged for all sources. This means `pgvector-rag` is a faithful reproduction of the
> legacy system *except* here — state that in the report.
- Same eval set, run in the same order, against a fixed model snapshot. Re-run all arms if
  `LLM_MODEL` changes mid-experiment — cross-model comparisons are void.

---

### 4a. Validity threat found in the captured sweep — the lexical branch is dead (2026-08-12)

**`pgvector-rag`'s lexical branch returns nothing for 78% of the eval's questions** (36 of 46
distinct turns), measured directly against the seeded sidecar. The arm is therefore running as
**dense-only** for most of the sweep — which means it is not the legacy-parity hybrid it exists to
represent, and its results cannot be read as "hybrid RAG performs like this".

Cause: `websearch_to_tsquery('english', …)` **ANDs** every non-stopword term. §7 step 4 of
`MIGRATION_SPEC.md` specifies exactly that function, so the SQL is a faithful port — the input is
not. The legacy service exposed retrieval as a `search_documents` **tool**, so the model supplied
short search terms ("ORP definition"). Here retrieval runs **up front on the raw user question**
(the ◆G11 decision recorded in `timeline.md` N1), so the query becomes the whole sentence and the
AND finds no chunk containing every content word:

```
websearch_to_tsquery('english', 'What is ORP and what does it actually measure?')  -> 0 chunks
websearch_to_tsquery('english', 'ORP')                                            -> 16 chunks
```

Corroborating evidence in the transcripts: fused RRF scores run `1/61, 1/62, 1/63, 1/64, 1/65` —
a single branch's consecutive ranks. Genuine fusion of two non-overlapping branches produces
**paired** scores (`1/61, 1/61, 1/62, 1/62, …`), which appears on only a minority of turns. The arm
also averages **1.74 source documents per turn** against `firestore-vector`'s 2.48, and draws all
five chunks from a single document on 23 of 58 turns.

**This is the failure this document warned about in §14 of `SPECS.md`** — "a subtly wrong fusion
returns plausible-but-worse chunks, which would read as 'RAG loses' rather than as a bug." It is
not a coding error; it is an **interaction between the up-front-retrieval architecture and the
legacy lexical query**, and it was invisible until the sweep was analysed.

Consequences, and none of them are optional:

- **`pgvector-rag`'s quality numbers do not measure hybrid retrieval** and must not be reported as
  if they do. Its 58.9% retrieval-miss rate and 13 over-refusals are substantially artefacts of the
  dead branch.
- **The `acronym-exact-token` class is void for this arm.** That class exists precisely to expose
  dense retrieval's weakness on rare tokens, and the hybrid was the arm expected to win it. It
  cannot win it with no lexical branch.
- **`firestore-direct` and `firestore-vector` are unaffected.** Neither uses a lexical path —
  Firestore has none — so the comparison between those two is clean and remains gradeable.
- **This is a real ◆G11 finding, not only a bug report.** It quantifies a cost of up-front
  retrieval that §11 of `timeline.md` anticipated qualitatively: keyword-shaped retrieval degrades
  when the model no longer composes the query. Any future hybrid arm must either receive
  model-generated search terms or OR/keyword-extract the user's question.

### 4b. Repaired and re-run — and the arm still loses (2026-08-12)

**Resolution chosen: repair the lexical query and re-run `pgvector-rag` alone.** The other two arms
touch no lexical path, so their transcripts stayed valid and were not re-captured.

The repair ORs the query's lexemes instead of ANDing them, deriving them with `to_tsvector` so
Postgres' own stemming and stopword list still do the splitting, and ranking with `ts_rank_cd` so a
chunk matching more of the query still outranks one matching a single common term:

```sql
WITH q AS (
  SELECT to_tsquery('english', string_agg(lexeme, ' | ')) AS tsq
  FROM unnest(to_tsvector('english', $1))
)
... WHERE q.tsq IS NOT NULL AND c.content_tsv @@ q.tsq
    ORDER BY ts_rank_cd(c.content_tsv, q.tsq) DESC
```

**State this in the report: the arm is no longer a strict legacy port.** `MIGRATION_SPEC.md` §7
step 4 specifies `websearch_to_tsquery`, and this is not that. It is also **not BM25** — Postgres'
`ts_rank_cd` is a weaker ranker, so "the legacy hybrid" is approximated, not restored.

The lexical branch is now alive on every question that has content words. The arm's numbers moved,
and **not by enough to change its standing**:

| | before (dense-only) | after repair | firestore-vector |
|---|---:|---:|---:|
| Retrieval miss rate | 58.9% | **53.6%** | 33.9% |
| Over-refusals (of 58 turns) | 13 | **11** | 1 |
| Source documents per turn | 1.74 | **1.95** | 2.48 |
| Turns drawing from one document | 23 | **14** | 6 |
| Prompt tokens per turn | 3,584 | **3,976** | 3,498 |
| Cost per answer | $0.000431 | **$0.000447** | $0.000433 |

Three conclusions, now on valid data:

1. **The arm genuinely underperforms — it was not merely broken.** A working lexical branch bought
   ~5 points of retrieval hit rate and left it far behind a dense-only Firestore arm. The bug was
   real and worth fixing, but it was not the explanation.
2. **Repair moved cost the way the bug predicted it would: up.** A live branch contributes
   candidates the dense branch did not, so fusion returns more text. `firestore-vector` is now
   cheaper at **every** volume in the range, where before the two crossed at ~2.96M requests/month.
   The dead branch had been flattering this arm on price.
3. **The `acronym-exact-token` class is gradeable again**, which was the point of repairing rather
   than caveating — that class exists to expose dense retrieval's weakness on rare tokens. The arm
   now hits 50% on it against `firestore-vector`'s 67% and direct-feed's 100%.

Per-class retrieval hit rate, all three arms, warm pass:

| class | firestore-direct | pgvector-rag | firestore-vector |
|---|---:|---:|---:|
| acronym-exact-token | 100% | 50% | 67% |
| cross-document | 100% | 50% | 33% |
| **deep-in-manual** | **33%** | 67% | **83%** |
| definitional | 100% | 17% | 100% |
| event-signature | 100% | 100% | 100% |
| follow-up | 100% | 17% | 50% |
| fouling-drift | 100% | 25% | 50% |
| precedence | 100% | 33% | 33% |
| probe-calibration | 100% | 50% | 75% |
| refusal | 100% | 75% | 75% |
| threshold-lookup | 100% | 50% | 75% |

`deep-in-manual` is the row that matters most: it is the only class where direct-feed loses, and it
loses structurally — the ◆G9 slice excludes the long manuals by design. **That single row is the
entire case for keeping a RAG arm**, and it is what makes the split outcome §8 anticipated
(direct-feed the authoritative tier, RAG the manuals) the most likely honest reading of this
experiment.

Caveat that still stands: retrieval hit rate is **not** answer quality. It measures whether the
document the fixture nominates reached the prompt, not whether the answer was right. An arm can
retrieve the right document and still answer badly, or answer well from a document the fixture did
not nominate. Grading is still required.

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
- **Prompt-cache hit rate.** Pivotal. Direct-feed sends ~11K static input tokens every request; its
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

### 7c. Human testing through the frontend

Alongside the scripted sweep, **non-technical testers exercise the arms through the chat UI**. This
is not a replacement for §7a — it is how the human calibration sample (§7b) gets collected without
anyone hand-driving `curl`, and how failure modes the fixtures never imagined get found.

The seam already exists: the per-request `retrieval` field, honored when `DEBUG_RETRIEVAL=true`.
What's missing is a way to reach it from a browser.

**Two modes, and the distinction is load-bearing:**

| mode | arm shown as | output is |
|---|---|---|
| **Blind** (default) | opaque `A` / `B` / `C`, **shuffled per session** | eval data — gradeable, usable for judge calibration |
| **Labeled** | real mode names | exploration only — never mixed into scores |

A tester who can see `pgvector-rag` on the label is no longer grading blind, and §7b's whole point
is that neither a human nor a judge model can tell which strategy produced an answer. Labeled mode
exists for debugging; its transcripts are tagged so they cannot be counted as eval data by mistake.

**Free-form questions do not replace the fixture set.** Different testers ask different questions,
so arms stop being comparable and you end up measuring question difficulty. Two distinct uses:

- **Seeded** — the tester is handed fixture questions to ask. Gradeable against the committed
  rubrics, comparable across arms, and the cheapest route to the ~20% human calibration sample.
- **Roaming** — the tester asks whatever they like. Qualitative only, and genuinely valuable: it
  is how you discover the question class nobody thought to write a fixture for. Anything it turns
  up becomes a *new fixture*, added before the next sweep — never a score in this one.

**Build items:**

- `GET /api/v1/retrieval/modes` — lists registered arms. **Gated on `DEBUG_RETRIEVAL`**, 404
  otherwise, so a real deployment cannot enumerate or select strategies.
- Arm selector in `frontend/index.html`, blind by default, with the session's shuffle held
  server-side so the mapping isn't sitting in the page source where a curious tester will find it.
- **Session capture** writing the same transcript shape as the runner — including the exact context
  supplied to the model — into `eval/transcripts/human/`. A human session that captures only the
  answer is ungradeable for groundedness, exactly as a scripted one would be.
- A per-session cost cap. Direct-feed bills ~11K input tokens per turn, and testers are not
  rate-limited by a script.

**This does not change the arms' fate.** The losing arms still come out once ◆G7 closes (§2) — and
`pgvector-rag` came out early, archived on 2026-08-19 ahead of the gate. The selector goes with
them, and the frontend keeps calling `POST /chat` and getting whatever `DEFAULT_RETRIEVAL` resolves
to. Nothing here reverses the rule that a caller does not get to choose the cost of their own
request. Note the consequence for this section: a blind harness built now can offer only the two
live arms, so any human calibration sample covering `pgvector-rag` has to be graded from its
**captured transcripts**, which is what the offline packet (§7b) already does.

---

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

### 8a. The actual numbers — fixed 2026-07-30, before any arm ran

Thresholds set after the numbers exist are not a test. These are committed now, while the only
measurement in hand is a direct-feed spot-check (disclosed rather than pretended away: TTFT
7.8-9.3s, wall 9.5-11.6s, warm cache hit 99.4-99.9%, one fixture failing its turn-1 rubric).

**Servable set.** An arm is judged on the fixtures it can reach. `firestore-direct` cannot reach
material outside the ◆G9 slice, so the three `deep-in-manual` fixtures are **excluded from its
correctness floor** and counted instead as *coverage*. The RAG arms index the whole corpus, so
every class is servable and they get no such exemption. Coverage (% of the 28 runnable fixtures in
an arm's servable set) is a headline-table column and a direct input to the split-outcome decision.

**Quality floor — hard gates, applied to all 28 fixtures regardless of servable set:**

| gate | threshold | why absolute |
|---|---|---|
| **Fabricated figures** | **Zero.** No invented numeric value, threshold, range or sensor reading stated as fact | Refusing is always available, so the slice is never an excuse. A made-up threshold in a water-quality tool is the failure mode that matters |
| **Other ungrounded claims** | ≤2% of turns (≈1 of 58) | Tolerates a loose paraphrase; does not tolerate a pattern |
| **Refusal integrity** | **100%** — every turn whose rubric requires a refusal must refuse | An arm that answers "what is the E. coli level" is out at any price |
| **Citation validity** | ≥95% of citations | The cited document must actually contain the claim |

**Quality floor — correctness (0/1/2 per turn), on the servable set:**

- **Mean ≥1.0 / 2 in every servable class.** Per-class, not global, so an arm cannot pass by being
  excellent at eight classes and useless at one.
- **Mean ≥1.3 / 2 overall.**

**Latency — two numbers doing different jobs:**

- **Veto (retrieval-attributable):** no arm may add **more than 1.5s p95 TTFT** over the fastest
  arm, judged **separately cold and warm**. This is the only latency difference this experiment can
  legitimately attribute to retrieval — an embedding round-trip and vector query for RAG, prompt
  processing on ~11K mostly-cached tokens for direct-feed.
- **Flag (absolute, not a veto):** **p95 total wall ≤10s**. Today's measurements sit at the edge of
  this, and the cause is gpt-oss emitting 400-1,300 reasoning tokens before the first visible word —
  a model and `max_tokens` finding for N5. **If every arm breaches it, that is reported, not used to
  choose a retrieval strategy**, because an absolute ceiling here would veto all three arms for a
  reason unrelated to what is being compared.

**If every arm fails the quality floor: ◆G7 stays open.** Record that nothing cleared the bar, fix
the system — prompt, slice, `max_tokens`, or model — and re-run. **The floor does not move.**
Pre-committing to this is what makes it a test rather than a formality.

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

### 8b. Amendment — 2026-08-25: machine-checked gates first

**No threshold in §8a moves.** This amendment changes the *order* the gates are applied in, the
*instrument* used for three of them, and which captured evidence is admissible. It is recorded here
rather than edited into §8a because §8a is a pre-registration, and silently rewriting one is how a
test becomes a formality.

**What prompted it.** The corpus changed twice after the arms were swept — expanded 2026-08-21,
trimmed 2026-08-24 — and four new arms were added on 2026-08-24/25. The 2026-08-11/12 packet
therefore grades a system that no longer exists, for most of it (see "Evidence currency" below).
Separately, the offline retrieval harness (`RETRIEVAL_EVAL.md`) demonstrated that a deterministic
labelled check turns an afternoon of grading into ten seconds, and three of §8a's five gates are
mechanically decidable in exactly that way.

**Tier 1 — machine-checked, deterministic, run first.** These are §8a's three *hard* gates. They
are absolute: an arm that fails one is out at any price, so deciding them cheaply and first means
never paying to grade an arm that was already eliminated.

| gate (§8a, unchanged) | decided by |
|---|---|
| **Fabricated figures — zero** | Every numeric literal in `answer` must appear in that turn's captured `context` or in a `tool_calls` result. Requires a unit normalizer (the decoder converts °C→°F) and a whitelist for values the tool computed, or conversions and legitimate statistics read as fabrications. |
| **Refusal integrity — 100%** | **The gate vetoes on *answering*, not on wording** — scope settled 2026-08-25 against §8a's own text, *"every turn whose rubric requires a refusal must refuse"*. A turn that refuses in different words ("I'm sorry, but I can't help with that") supplies no figure, does nothing unsafe, and passes; it is reported and handed to the judge as a rubric miss. Only a turn that states a figure where a refusal was required disqualifies an arm. This is not a loosening of the floor — the stricter reading was never what §8a said, and it would have eliminated the best-retrieval arm for a presentation defect. Match against `REFUSAL_SENTENCE` (`src/prompt/systemPrompt.ts`, a pinned constant) on every turn whose rubric requires a refusal — 3 of the 62 turns, 2 of them demanding the sentence verbatim. **An exact comparison is wrong here and was measured to be wrong:** the captured answers contain `water‑quality` with U+2011 NON-BREAKING HYPHEN where the constant has U+002D, and NFKC folds U+2011 to U+2010 rather than U+002D, so normalising without an explicit dash class does not fix it either. The check folds dashes, quotes, invisibles and whitespace, then compares; a residual edit-distance tolerance (default 2) is reported as **its own outcome** and never counted as an exact pass, because a tunable threshold silently deciding an absolute pre-registered gate would hollow the gate out. |
| **Citation validity — ≥95%** | Each `【N】` / `【N†Lx-Ly】` marker must resolve to a context chunk that was actually supplied, and to a line range that chunk actually has. 168 of the 348 captured turns carry at least one marker. **Scope correction, same day:** this decides *resolution*, not *support*. §8a's wording — "the cited document must actually contain the claim" — has a judgement half that no string match settles, and that half moves to Tier 2. What stays here is unambiguous: `【9】` when five chunks were supplied is an invented source whatever the sentence around it says. |

**Tier 2 — judgement, run only on Tier-1 survivors.** These stay in the floor exactly as written.

| gate (§8a, unchanged) | decided by |
|---|---|
| **Ungrounded claims — ≤2% of turns** | LLM judge per §7b |
| **Correctness — ≥1.0/2 in every servable class, ≥1.3/2 overall** | LLM judge per §7b |

**The judge is not a new decision.** §8a's input list already resolved it on 2026-07-29: an LLM
judge calibrated against a human sample. §7b's constraints bind unchanged — a different model than
the one under test, one dimension per call, the supplied context given to the judge, calibration on
~20% of transcripts with the human-agreement rate reported, and the judge's own tokens counted in
the budget. What changes is only that the judge now runs on a smaller set, because Tier 1 has
already removed arms and Tier 1's failures are not re-litigated by it.

**Evidence currency — which captured transcripts are still admissible.** Checked 2026-08-25:

| evidence | admissible | why |
|---|---|---|
| The 30 committed fixtures | **yes** | Every `answerable_from` / `requires` filename still resolves against the 15-document corpus; no fixture references a removed document, so §7's loader guard never fires. `refusal-pathogens`'s `notes` are stale — they justify the fixture by the volunteer manual's fecal-bacteria chapter, removed 2026-08-21 — but its rubric is unaffected. |
| `firestore-direct` transcripts | **yes** | It reads only the ◆G9 slice, unchanged at 37,660 chars through both the expansion and the trim. |
| `firestore-vector` transcripts | **no** | Captured retrieving over 305 chunks of an 8-document corpus that no longer exists. |
| `pgvector-rag` transcripts | **no** | Same, and the arm is archived and unrunnable without restoring `archive/pgvector-rag/`. |
| `local-vector`, `local-hybrid`, `hybrid-slice-vector`, `hybrid-slice-lexvec` | **none exist** | Never swept. |

So a re-capture is required before either tier can be run over anything but direct-feed.

**The capture set, settled 2026-08-25.** Four arms end up admissible: `firestore-direct` and
`hybrid-slice-lexvec` (both captured), plus `firestore-vector` and `hybrid-slice-vector` (to
capture). Two registered arms are deliberately **excluded from capture**, and the reasons are worth
keeping because both look like gaps otherwise:

- **`local-vector` is not a separate arm.** `npm run compare:vector-arms` reports 30/30 queries
  ranked identically to `firestore-vector`, drift ~1e-4, because Firestore's index is configured
  `flat` — exhaustive, not approximate. At temperature 0 identical context yields identical
  answers, so capturing both would pay twice for one result. It stays what it was built to be: the
  free offline instrument, and the reason retrieval can be iterated without spending anything.
  `local-hybrid` stands in the same relation to `hybrid-slice-lexvec` minus the slice.
- **`pgvector-rag` stays archived.** It could be restored — the files are intact and Docker is
  available — but it was dev-only and never deployed, ◆G1 migrated away from that stack, and it
  already lost on cost ($12.14/mo vs $4.33 at 10k requests). Restoring it cannot produce a ◆G7
  winner; it can only produce a legacy reference row for §10's "what did the migration save?"
  question. Worth doing when that report is written, not before.

**`firestore-vector` needs no code change.** Its Tier-1 failure is a fact about transcripts
captured over an 8-document corpus, not about the adapter: its chunk collection was wiped and
re-seeded to the current 393 chunks on 2026-08-24, and the embedding cache carries the same 393.
The arm is capture-ready as it stands. Reading a stale-evidence failure as a broken arm is the
mistake this paragraph exists to prevent.

**The grounding a figure may come from is wider than the retrieval context.** Learned the
expensive way: the checker's first run reported ~24 fabricated figures per arm, and most were the
system prompt's own `AUTHORITATIVE NORMAL RANGES` block — pH 6.5-8.5, DO 5-14 mg/L, conductivity
0-1,500 µS/cm — quoted back correctly, plus figures the *user* supplied in the question ("is pH 8.4
normal?"). A transcript's `context` field holds retrieval context only. Any implementation of this
gate must admit the system prompt and the conversation so far as grounding, or it accuses an arm of
inventing the operator ranges the prompt told it to apply — and a gate that cries wolf gets
switched off.

**First Tier-1 result, 2026-08-25** (`npm run gate:check --pass=warm`, output in
`data/gate-check/warm.json`). Two corrections to the checker were needed before these numbers meant
anything, both recorded above: document identifiers were being scored as figures, and the refusal
gate was vetoing on wording rather than on behaviour.

| arm | refusal | citations | figures | Tier 1 | evidence admissible? |
|---|---|---|---|---|---|
| `firestore-direct` | pass — 3 folded | 95.3% (61/64) | 0 of 187 | **PASS** | **yes** — slice unchanged |
| `hybrid-slice-lexvec` | pass — 1 exact, 1 folded, **1 off-contract** | 100% (35/35) | 0 of 224 | **PASS** | **yes** — captured on this corpus |
| `firestore-vector` | pass — 3 folded | 100% (61/61) | 5 of 132 | fail | no — stale corpus |
| `pgvector-rag` | pass — 3 folded | 92.1% (35/38) | 5 of 143 | fail | no — stale corpus, archived arm |

**Both admissible arms clear Tier 1, so both go to the judge** and ◆G7 is decided on correctness
and cost rather than by elimination. The two failing rows describe arms retrieving over an
8-document corpus that no longer exists; their failures are indicative and must be re-earned on a
re-capture.

Four things the run established that no amount of retrieval measurement would have:

- **`hybrid-slice-lexvec` invented nothing across 224 numeric literals** — the largest figure count
  of any arm, because it carries the most context, and none of it fabricated. The prior worry that
  a wider net means more distractor text and more invention is not visible at this layer.
- **Its one deviation is presentational.** On the E. coli turn it answered "I'm sorry, but I can't
  help with that" — a refusal, no figure, nothing unsafe, but not the service's pinned sentence and
  missing the required "one short sentence naming what was missing". A rubric miss for the judge.
- **`firestore-direct`'s only blemish is three invented citations** — `【6】` and `【10】` where it
  supplied 5 chunks — putting it at 95.3% against a 95% floor. **0.3 points of headroom; a fourth
  would fail it.**
- **Citation validity is confounded by context volume.** Direct-feed supplies 5 entries, so the
  model's habit of citing `【6】`/`【10】` breaks; hybrid supplies 10, so the identical habit resolves
  and scores 100%. The gate mildly favours high-context arms. Normalise it or state it in
  `RETRIEVAL_COMPARISON.md` — do not read the 95.3% vs 100% gap as a quality difference.

**First Tier-2 calibration, 2026-08-26** (`npm run judge -- --calibration`, then `--calibrate`;
verdicts in `data/judge/warm.jsonl`, pre-fix ledger kept at `data/judge/warm.pre-fix-2026-08-26.jsonl`,
summary in `data/judge/warm.json`). The judge harness is `src/eval/judge/` + `scripts/judge.ts`,
built to the §7b constraints. It covers the **6 fixtures the human already graded**, 3 arms, 12
turns each: a calibration, not a result. **Run twice** — the first pass exposed two defects in the
judge, and the second re-measured the two dimensions whose prompts changed. 132 calls total, 0
failed, **$0.1194** at the 2026-08-03 `gpt-oss-120b` rate. That is the judge's whole budget line
to date.

| dimension | n | exact | within-1 | any/none | Cohen's kappa | usable? |
|---|---:|---:|---:|---:|---:|---|
| correctness | 36 | 83.3% → **91.7%** | 94.4% → **100%** | 94.4% → **100%** | 0.75 → **0.87** | yes |
| ungrounded claims | 36 | 72.2% | 83.3% | 86.1% | **0.46** (unchanged) | yes, with the strictness bias stated |
| citation support | 12 | 50.0% → **83.3%** | 91.7% → **100%** | 58.3% → **91.7%** | −0.06 → **0.52** | reported, never gated; n=12 |

**Both fixes are corrections to the pre-registered definition, not thresholds moved to chase a
number.** §7b says *"if agreement is poor, fix the rubric — do not quietly keep the judge's
scores"*, and the distinction between fixing a rubric and fitting one is the only thing that keeps
that instruction honest. Each is defensible without reference to the number it produced:

- **Correctness was judging invention blind.** On `deepmanual-stabilization-criteria` turn 1 the
  judge scored two arms 0 where the human scored both 2, invoking `must not invent numeric
  criteria` against the `>100 TU` row of Table 6.8-5 — which is verbatim in the source it was not
  shown. The correctness prompt withheld retrieval context on `GRADING_GUIDE.md` §3's principle
  that correctness is scored against the rubric, not the source text. Right for `must_contain`;
  **wrong for any `must_not` phrased as an invention check**, which is a claim about what the
  supplied material contains. The context is now supplied for exactly those turns — 25 of the
  fixtures' 110 distinct `must_not` items — and for nothing else, so §3's principle still holds
  everywhere it applies and direct-feed's ~11K-token slice is not shipped to 85 turns that do not
  need it. Both distance-2 disagreements vanished.
- **Citation support was judging line numbers nobody asked it to judge.** Every disagreement was
  the same shape: `【5†L1-L4】` called invalid because lines 1-4 of that chunk are introductory,
  while the claim sits further down the same file. But §8a says *"the cited **document** must
  actually contain the claim"* and `GRADING_GUIDE.md` §3 told the human the same. The narrow
  reading was the judge's own invention. Context is now presented **grouped by source document**,
  markers resolve to documents, and line spans are explicitly ignored — while a marker naming the
  *wrong* document stays invalid, which is the case the gate exists for.

**The judge model is `gpt-oss-120b`, and that is a stated weakness of the quality claim.** §7b's
rule is "a different model than the one under test"; 120b is a different model from 20b and clears
it as written. It does not clear the intent — same family, same lineage, so some self-preference
plausibly survives. It was chosen anyway because it is the only non-under-test chat model in
`prices.ts` with a rate read on a known date, and §10 item 4 requires every price in the report to
carry one. A cross-family judge meant an unverified model id *and* an invented rate: an unstated
bias in the cost table traded for a stated one in the quality table. `npm run judge` prints the
caveat on every run. If agreement degrades, try a cross-family judge before the rubric.

Three things the calibration established:

- **Correctness at kappa 0.87 can be trusted.** The three residual disagreements are all distance-1
  and all one shape: the judge scores 1 where the human scored 2 on a refusal that named the
  missing information but did not use `REFUSAL_SENTENCE` verbatim. **This section's own refusal
  gate already treats that behaviour as passing** — the gate vetoes on answering, not on wording —
  so the judge is currently stricter on it than the pre-registration is. Settle it before the full
  pass; it is an ambiguity, not a defect.
- **Citation support is usable and still ungated.** §8a's citation threshold is spent on the
  *resolution* half, decided deterministically by Tier 1 at 95.3%/100%. Twelve pairs is thin
  evidence and nothing should lean on it. The durable fix is quote-based citations — a quote is
  verifiable by normalized substring match, which would move this dimension into Tier 1 for free —
  and that is a system-prompt change, so it waits for ◆G7 to close. Related and **rejected**:
  re-chunking to smaller chunks, which would invalidate all 259 retrieval labels and does not even
  address the cause, since markers already resolve to chunks rather than documents.
- **The ungrounded-claims gate is nowhere near met, and it is not the judge's doing.** The human
  flags **9 of 36 turns (25.0%)** as carrying at least one unsupported claim; the judge flags
  **14 of 36 (38.9%)**. §8a's ceiling is **2%**, about one turn in 58. The human's number was
  collected blind, before this harness existed, and is the conservative of the two. The judge is
  systematically stricter here — it splits into two claims what the human wrote as one line — but
  the gate turns on whether a turn carries *any* claim, where the two agree 86.1% of the time.
  Per-arm the human flags `firestore-direct` on 4/12 and `firestore-vector` on 5/12;
  `pgvector-rag` scores 0/12 only because it refused five of its twelve turns, which its
  correctness column pays for.

The last of those is the finding that matters, and §8a already pre-committed to it: *"If every arm
fails the quality floor: ◆G7 stays open. Record that nothing cleared the bar, fix the system —
prompt, slice, `max_tokens`, or model — and re-run. The floor does not move."* Nothing measured
here is grounds to move it. **Expect a full Tier-2 pass to fail the groundedness gate on every
arm**, and treat the open question as which of prompt, slice or model is the fix — not what the
threshold should have been.

**Tier 1 re-run and Tier 2 in full, 2026-08-26.** `firestore-vector` and `hybrid-slice-vector`
were captured on the current 15-document corpus (28 transcripts / 58 turns / 0 failed each,
~$0.056 for both), which makes every row below **admissible evidence** and retires the currency
table above. Tier 1 was re-run first, then Tier 2 on its survivors — 398 further judge calls,
cumulative judge budget **$0.8082**.

| arm | Tier 1 | correctness (floor 1.30) | ungrounded turns (ceiling 2%) | coverage | **verdict** |
|---|---|---:|---:|---:|---|
| `firestore-direct` | PASS | **1.08** | **53.4%** | 89.3% | **FAIL** |
| `hybrid-slice-vector` | PASS | **0.88** | **58.6%** | 100% | **FAIL** |
| `hybrid-slice-lexvec` | PASS | **0.86** | **58.6%** | 100% | **FAIL** |
| `firestore-vector` | **FAIL** — 2 fabricated figures of 122 | — not judged | — | 100% | **OUT at Tier 1** |
| `pgvector-rag` | FAIL | — | — | — | dropped by decision |

**Every arm fails the quality floor, so §8a's own contingency governs:** *"If every arm fails the
quality floor: ◆G7 stays open. Record that nothing cleared the bar, fix the system — prompt, slice,
`max_tokens`, or model — and re-run. The floor does not move."* Nothing here is grounds to move it.
`RETRIEVAL_COMPARISON.md` §7 is the record, and §7.1a raises the scoping problem this creates: the
prompt is a pinned control until ◆G7 closes, so the gate currently blocks its own remedy. That is a
decision for whoever owns the gate, and it belongs in `timeline.md`, not in a document proceeding
as though it had been made.

Five results worth carrying forward regardless of how that decision goes:

- **`firestore-vector` was eliminated on an absolute gate, and it re-earned that failure.** Its
  2026-08-11 failure was inadmissible. On fresh evidence it stated that seawater conductivity is
  *"roughly 1,000× higher (often 10,000–50,000 µS cm⁻¹)"* — neither figure in its five retrieved
  chunks, the system prompt, or the question. Retrieval had handed it DO and temperature material
  for a salt-water conductivity question, and the model filled the gap from world knowledge, which
  the prompt forbids outright. **The cheapest arm in the field, at $0.000336/answer, is out.**
- **The ◆G9 slice prevents exactly that failure.** Arms carrying it never face an empty or wholly
  irrelevant context, so a retrieval miss degrades to "answered from authoritative-but-wrong
  material" rather than "answered from nothing". This is the strongest argument the experiment
  found for the hybrid shape, and neither retrieval metrics nor Tier 2 surfaces it.
- **Retrieval is not the bottleneck.** `firestore-direct` — fixed 5-document slice, no ranking, no
  vector search — has the **best correctness of any arm** and wins **8 of 11 classes**, including
  `cross-document`. It loses only `deep-in-manual` (0.33 vs 0.83), which is precisely the material
  outside its slice and which §8a already charges to coverage. Keeping it as a scored control cost
  ~$0.18 and produced the most decision-relevant number in the experiment.
- **Lexical fusion buys nothing at the answer layer.** `hybrid-slice-vector` 0.88 vs
  `hybrid-slice-lexvec` 0.86: same slice, same dense retriever, one adds BM25 via RRF. This is the
  question that pairing was captured to answer, and 0.02 over 58 turns is noise. **Settled**, and
  it retires the "restore the lexical branch" thread §4a/§4b opened. The two arms do differ at the
  retrieval layer; it does not survive into what a user reads.
- **The groundedness failure is systemic and generation-shaped.** 53–59% of turns carry an
  unsupported claim against a 2% ceiling — a 26× breach on the best arm, with only 5 points
  separating the arms. The flagged claims are volunteered mechanism the documents do not support
  ("dilution with low-mineral water lowers conductivity", "ORP responds faster than DO"), not
  retrieval misses. A human grading blind, before the judge existed, independently flagged 25% of
  their turns. **No arm choice moves this**; prompt, `max_tokens` and model are the levers §8a
  itself names.

**One methodological note, because it nearly produced the wrong verdict.** The 6-fixture
calibration put `firestore-direct` at 1.50/2 correctness; the full 58-turn pass put it at 1.08/2.
Twelve turns did not merely carry wide error bars — they cleared a floor the full set fails. A
calibration subset establishes that the judge agrees with a human. It is not a result, and this is
what it looks like when one is mistaken for one.

**Capture set completed and Tier 1 re-run, 2026-08-26.** `firestore-vector` and
`hybrid-slice-vector` were captured on the current 15-document corpus — 28 transcripts, 58 turns,
0 failed each, ~$0.056 for both — which makes every row of the table above admissible evidence
rather than a mix of live and stale. `pgvector-rag` was **dropped by decision** rather than
re-captured: archived, never deployed, ◆G1 migrated off that stack, and it had already lost on cost.

| arm | refusal | citations | figures | Tier 1 |
|---|---|---|---|---|
| `firestore-direct` | pass — 3 folded | 95.3% (61/64) | 0 of 187 | **PASS** |
| `hybrid-slice-lexvec` | pass — 1 exact, 1 folded, 1 off-contract | 100% (35/35) | 0 of 224 | **PASS** |
| `hybrid-slice-vector` | pass — 3 folded | 100% (56/56) | 0 of 245 | **PASS** |
| `firestore-vector` | pass — 3 folded | 97.8% (44/45) | **2 of 122** | **FAIL** |

**`firestore-vector`'s failure is re-earned, not inherited, and it eliminates the arm.** Its
2026-08-11 failure was inadmissible and explicitly indicative only. On fresh evidence it states, in
`definitional-conductivity` turn 2, that seawater conductivity is *"roughly 1,000× higher (often
10,000–50,000 µS cm⁻¹)"* — neither figure present in its five retrieved chunks, the system prompt,
or the question. Retrieval had handed it a DO datasheet and USGS chapters on dissolved oxygen and
temperature for a salt-water *conductivity* question, and the model covered the gap from world
knowledge rather than refusing. §8a is unambiguous: zero fabricated figures, *"refusing is always
available, so the slice is never an excuse."* The cheapest arm in the field — $0.000336 an answer,
roughly half of direct-feed — is out.

Worth carrying forward, because no retrieval metric surfaces it: **the arms carrying the ◆G9 slice
never face an empty or wholly-irrelevant context**, so a retrieval miss degrades to "answered from
authoritative-but-wrong material" rather than "answered from nothing". That is the strongest
argument this experiment produced for the hybrid *shape*, and it is an argument about failure modes
rather than about recall.

**Tier 2 — the full pass, 2026-08-26.** Run over the three Tier-1 survivors: 398 calls on top of
the calibration's 84, 0 failed, cumulative judge budget **$0.8082** (4,122,348 in / 316,454 out).

| arm | correctness (floor 1.30) | worst servable class | ungrounded turns (ceiling 2%) | coverage | Tier 2 |
|---|---:|---|---:|---:|---|
| `firestore-direct` | **1.08** | `cross-document` 0.67 | **53.4%** (31/58) | 89.3% | **FAIL** |
| `hybrid-slice-vector` | **0.88** | `cross-document` 0.17 | **58.6%** (34/58) | 100% | **FAIL** |
| `hybrid-slice-lexvec` | **0.86** | `cross-document` 0.50 | **58.6%** (34/58) | 100% | **FAIL** |

**Every arm fails the quality floor, so §8a's own contingency governs**: *"If every arm fails the
quality floor: ◆G7 stays open. Record that nothing cleared the bar, fix the system — prompt, slice,
`max_tokens`, or model — and re-run. The floor does not move."* Nothing in §8a has been changed,
softened or reinterpreted. `RETRIEVAL_COMPARISON.md` is the record it asks for.

Four results that stand regardless of how ◆G7 is finally scoped:

- **Retrieval is not the bottleneck.** `firestore-direct` — a fixed 5-document slice, no ranking,
  no vector search — has the best correctness of any arm and wins **8 of 11 classes**, including
  `cross-document`, the class most obviously suited to whole-corpus retrieval. It was kept in the
  judging pass as a scored *control* rather than a candidate, at about $0.18, and that decision
  produced the most decision-relevant number in the experiment.
- **Lexical fusion buys nothing at the answer layer.** `hybrid-slice-vector` 0.88 vs
  `hybrid-slice-lexvec` 0.86 — same slice, same dense retriever, one adds BM25 via RRF. This is
  exactly the question the pairing was captured to answer, and 0.02 over 58 turns is noise. It
  retires the "restore the lexical branch" thread §4a/§4b opened: the two arms differ at the
  retrieval layer and it **does not survive into the answers**.
- **The quality failure is systemic, not per-arm.** Correctness spread across arms is 0.22 and the
  best arm is 0.22 below the floor; groundedness spread is 5.2 points and the best arm is 51.4
  points above the ceiling. **A different arm choice does not produce a passing system.** Nor is it
  a strict judge: a human, grading blind before the harness existed, independently flagged 25% of
  the turns they graded.
- **The calibration subset was optimistic enough to have misled.** `firestore-direct` scored
  1.50/2 on the 6-fixture calibration and **1.08/2** on all 58 — the difference between clearing
  the floor and failing it. The subset's job was to calibrate the judge, not to produce a result,
  and it is the reason §7b asks for both.

**The scoping problem this creates, recorded rather than resolved here.** ◆G7 cannot close while
the floor is unmet; the floor is unmet for systemic reasons; fixing systemic reasons means editing
the system prompt; and the system prompt is a **pinned control until ◆G7 closes**. The way out is
that quality failures which do not discriminate between arms are not evidence *about* arms —
so the retrieval-strategy question ◆G7 actually asks is answerable on this data, while the floor is
re-filed as a system-level deploy blocker carrying §8a's thresholds forward unchanged.
`RETRIEVAL_COMPARISON.md` §7.1a sets out both readings and recommends the split. **That decision
belongs in `timeline.md` with its reasoning**, made explicitly by whoever owns the gate — not
assumed by a document that proceeds as though it had been made.

**What this amendment does not do.** It does not admit retrieval metrics as quality gates. Recall,
precision, MRR and nDCG remain diagnostics with no target (`RETRIEVAL_EVAL.md` §1) — a model can be
handed perfect context and still invent a number, which is the failure Tier 1 exists to catch. An
arm cannot pass ◆G7 on retrieval evidence, and 81.8% recall is not a result about answers.

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
- ~~The pgvector sidecar removed once the decision is recorded.~~ **Done 2026-08-19 — archived, and
  ahead of the decision rather than after it** (§2). The runtime code is in `archive/pgvector-rag/`;
  the transcripts, grading key, cost scenario and packet entry stayed live **precisely so every
  criterion above is still reachable** — the packet still grades three arms and `npm run cost` still
  prices three arms. ◆G7 remains open on grading and on the §10 report.

---

## 10. Deliverable: the comparison report

The experiment's output is a committed document — **`docs/RETRIEVAL_COMPARISON.md`** — not a verbal
conclusion. It exists so the retrieval decision, which is primarily a **spend** decision, can be
re-examined later when prices, models, corpus size, or traffic change. Every one of those moves the
answer, so the report must show the working, not just the verdict.

Required contents:

1. **The headline table** — one row per retrieval method:

   | method | cost/answer (cold) | cost/answer (warm) | cache hit rate | **idle $/mo** | **12-mo TCO @ projected volume** | coverage | correctness | groundedness | p95 TTFT (cold / warm) |
   |---|---|---|---|---|---|---|---|---|---|
   | `firestore-direct` | | | | **$0** | | | | | |
   | `pgvector-rag` | | | | (DB instance, 24/7) | | | | | |
   | `firestore-vector` | | | | (index storage) | | | | | |

   **Coverage** is the share of the 28 runnable fixtures in that arm's servable set (§8a) — the
   column that stops direct-feed's slice exemption from being invisible.

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

## 11. When and where this ran — **executed as planned**

> **This section is the original sequencing decision, and it has been carried out.** All three arms
> were built and swept on `feat/bakeoff-sweep` after Phase N1 landed, and that work has since
> merged. Nothing here is an instruction any more; it is kept because the sequencing rationale —
> in particular *why the pgvector sidecar must never appear on a branch headed for deploy* — is
> still in force, and because the "also needed before starting" list below records which inputs
> were supplied and which were assumptions.

**Deferred by decision, at the time of writing.** The `migration` branch stayed scoped to what it
already contained: the Node/Express + Firestore skeleton and these planning docs. Building
adapters, standing up a pgvector sidecar, and running a paid eval sweep all belonged elsewhere.

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
  - ~~A decision on who grades~~ — **resolved 2026-07-29: LLM judge calibrated against a human
    sample** (§7b). The judge model must differ from the model under test; the human sample is
    collected through the blind frontend harness (§7c) rather than by hand-driving the API.

Nothing here was implemented on `migration`, and the sidecar never reached a deploy branch. What
remains open is not in this section — it is grading and the §10 report (◆G7).
