# Retrieval evaluation — the offline harness

`npm run retrieval:eval` scores a retrieval adapter against a labelled query set. **No LLM, no
network for the corpus, deterministic, seconds per run.**

Companion docs: [`RETRIEVAL_LABELS.md`](RETRIEVAL_LABELS.md) (how the ground truth was built),
[`EVAL_FIXTURES.md`](EVAL_FIXTURES.md) (the question set), [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md)
(the Phase N2 LLM sweep this does **not** replace).

---

## 1. Why it exists

Before this, the only way to tell whether a retrieval change helped was to replay 58 conversations
through an LLM and have a human grade the answers — hours and real money per iteration. That makes
tuning impossible: you cannot try eight ideas when each costs an afternoon.

This asks a narrower question that is answerable offline: **did the right chunks reach the prompt?**

**It measures a necessary condition, not a sufficient one.** High recall means the material was
available, not that the answer was good. Retrieval misses are unrecoverable downstream — the model
cannot reason about text it never received — so ruling them out first is the cheapest ordering.
The LLM sweep remains the only word on answer quality.

## 2. Running it

```bash
npm run ingest                 # 15 docs -> data/corpus/corpus.json (393 chunks)
npm run embed:cache            # embeds 393 chunks once; incremental afterwards
npm run retrieval:eval                                   # every registered adapter
npm run retrieval:eval -- --adapter=local-vector --k=10
npm run retrieval:eval -- --adapter=stub,firestore-direct,local-vector --out=data/retrieval-eval/run.json
```

`--out` writes ranked chunk ids per query — the golden-snapshot payload. Diffing two of those shows
exactly what a change moved, **including what quietly got worse**, which a summary average hides.

## 3. Baseline — 2026-08-24

99 labelled queries across 48 fixtures, 15-document corpus, 393 chunks.

| adapter | recall | precision | MRR | nDCG | chunks in context |
|---|---:|---:|---:|---:|---:|
| `stub` | 20.2% | 0.0% | 0.202 | 0.202 | 3.0 |
| `firestore-direct` | 74.9% | 9.9% | 0.337 | 0.420 | 16.0 |
| `local-vector` (k=5) | 46.1% | **14.5%** | 0.539 | 0.455 | 5.0 |
| `local-vector` (k=10) | 54.3% | 9.8% | **0.551** | 0.492 | 10.0 |
| `firestore-vector` (k=10) | 54.3% | 9.8% | 0.551 | 0.492 | 10.0 |
| `local-hybrid` (k=10, dense+BM25) | 59.5% | **11.2%** | **0.623** | **0.550** | 10.0 |
| `hybrid-slice-vector` (k=10) | 80.8% | 7.7% | 0.341 | 0.440 | 24.1 |
| **`hybrid-slice-lexvec`** (k=10) | **81.8%** | 8.2% | 0.343 | 0.444 | 23.1 |
| `hybrid-slice-vector` (k=20) | 84.0% | 5.9% | 0.342 | 0.448 | 33.2 |

### Read the floor before reading anything else

**`stub` scores 20.2%, and exactly 20 of 99 turns are labelled `noRelevantChunks` — 20 ÷ 99 =
20.2%.** The stub returns three lines of placeholder text that exist nowhere in the corpus, so
every point it earns is vacuous credit from turns where "retrieve nothing" is correct.

That match is the harness validating itself, and it means **20.2% is the floor, not zero.** On the
79 turns that actually have a findable answer:

| adapter | recall on answerable turns |
|---|---:|
| `stub` | 0.0% |
| `firestore-direct` | 68.5% |
| `local-vector` (k=5) | 32.5% |
| `local-vector` (k=10) | 42.7% |

### What the shapes mean

**`firestore-direct` wins recall and loses everything else.** It puts 16 chunks in front of the
model on every request regardless of the question, so it cannot rank (MRR 0.337 — the worst of the
two real arms) and its precision is 9.9%: roughly 1.6 useful chunks out of 16. Its `deep-in-manual`
recall is **2.4%** — structurally blind, because those answers are outside the ◆G9 slice by
construction. That independently reproduces the Phase N2 sweep's finding from a different
measurement path.

**`local-vector` ranks far better and retrieves less.** MRR 0.539 vs 0.337 at a third of the
context: when it finds the right chunk it puts it near the top. But its recall is the problem, and
`deep-in-manual` is only 8.8% at k=5 / 18.6% at k=10 — the class RAG is supposed to win.

> **Do not compare these numbers directly to the N2 sweep's "retrieval hit rate".** That measured
> whether a *nominated document* reached the prompt. This measures whether the *labelled chunks*
> did, and most turns have several. It is a far stricter question, and the lower numbers here are
> not a regression.

### The top-k curve

`local-vector`, after `MAX_TOP_K` was raised (§4a):

| k | recall | precision | MRR | nDCG |
|---:|---:|---:|---:|---:|
| 5 | 46.1% | 14.5% | 0.539 | 0.455 |
| 10 | 54.3% | 9.8% | 0.551 | 0.492 |
| 15 | 60.0% | 7.7% | 0.555 | 0.511 |
| 20 | 63.2% | 6.5% | 0.556 | 0.521 |
| 30 | 68.1% | 4.9% | 0.558 | 0.530 |
| 50 | 77.0% | 3.6% | 0.559 | 0.555 |

**MRR is flat across the whole range** — 0.539 at k=5, 0.559 at k=50. Depth buys recall and no
ranking improvement whatsoever: the right chunk is found early or not at all, and everything gained
past k=10 arrives ranked low. That is the signature of a retriever whose *ordering* is the
limitation, not its depth, and it is the argument for reranking or hybrid lexical scoring rather
than for a bigger k.

### Why the hybrid arm exists

Read the two failure modes together. At an equal budget of ~16 chunks, `firestore-direct`'s
curated slice retrieves **74.9%** while dense retrieval manages roughly **60%** — the curated tier
beats the vector arm at its own context cost. But direct-feed scores **2.4%** on `deep-in-manual`,
because that material is outside the ◆G9 slice by construction.

So the slice is not a weak baseline to replace; it is a strong prior to *add to*.
`hybrid-slice-vector` returns the slice whole plus dense hits over everything else, and it beats
both parents: **80.8% recall at k=10** (vs 74.9% / 54.3%) and `deep-in-manual` **21.0%** at k=10,
**31.0%** at k=20 (vs 2.4%). Its MRR drops to 0.341 because the 16 unranked slice chunks sit in
front — an artefact of the metric, not a regression in what the model receives.

This is the split outcome [`timeline.md`](timeline.md) named as a legitimate result of ◆G7, and
composing it cost one adapter that delegates to two existing ones.

Two properties worth keeping:

- **The operator source-of-truth is always in the prompt.** Several `precedence` fixtures turn on
  the model seeing the operator reference next to a manual that disagrees with it. A top-k arm can
  rank that reference out; this one structurally cannot.
- **The slice is emitted first**, so the cacheable prompt prefix stays byte-identical across
  requests. Reversing the order would quietly destroy direct-feed's ~99% prompt-cache hit rate.

### Lexical fusion — added 2026-08-25

`local-hybrid` fuses BM25 with the dense arm using Reciprocal Rank Fusion
(`src/retrieval/adapters/RrfHybridAdapter.ts`); `hybrid-slice-lexvec` puts that fusion under the
operator slice. The legacy service was hybrid dense + full-text with RRF, and the migration dropped
the lexical half because Firestore has no full-text search — recorded as the "dead lexical branch"
regression in [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §4b. At 393 chunks an in-process BM25
index removes that constraint entirely.

**The headline is MRR.** It had been *flat* from k=5 to k=50 (0.539 → 0.559), which is what said the
limitation was ordering rather than depth. Lexical fusion moved it **0.551 → 0.623 in one step** —
more than the entire k=5→50 sweep achieved, at the same 10 chunks of context. Precision rose too
(9.8% → 11.2%), so this is a better ranking rather than a wider net.

Per class, dense vs dense+lexical at k=10:

| class | dense | +lexical | Δ |
|---|---:|---:|---:|
| `event-signature` | 66.7% | 77.8% | **+11.1pp** |
| `threshold-lookup` | 64.6% | 75.0% | **+10.4pp** |
| `deep-in-manual` | 18.6% | 24.5% | +5.9pp (nDCG 0.136 → 0.254) |
| `acronym-exact-token` | 62.5% | 65.6% | +3.1pp |
| `cross-document` | 52.3% | 50.8% | **−1.5pp** |

**The prediction was wrong in an instructive way.** Lexical retrieval was added to fix
`acronym-exact-token` — the rare-token weakness the legacy build was hybrid to address — and that
class gained the *least* of the winners. The real beneficiaries were `event-signature` and
`threshold-lookup`: questions answered by **numeric tables**, where the query and the chunk share
literal tokens (`6.5`, `2 mg/L`, `25 NTU`) that an embedding blurs into a general notion of
"threshold". Dense retrieval was already handling acronyms tolerably; it was the numbers it was
losing.

`cross-document` regressing slightly is consistent: those questions need 2–4 documents in one
answer, and lexical fusion sharpens toward the single best-matching chunk.

**On the slice hybrid the gain is small** (80.8% → 81.8%) because the curated slice already
supplies most of what those queries need — but it costs *fewer* chunks (23.1 vs 24.1) and raises
precision, so it dominates its predecessor on every axis.

**`RRF_K = 60` is the published default and was deliberately not tuned.** Tuning it against the
same 99 queries used to report the result would be fitting the constant to the test set; that needs
a held-out split.

## 4. Findings

**a. `MAX_TOP_K = 10` was binding, and it was a legacy constant. Raised to 50 on 2026-08-24.**
`k=20` returned exactly `k=10`'s numbers because `resolveTopK` clamped — which reads as "more depth
does not help" when the request simply never happened. The bound came from the FastAPI service
(`MIGRATION_SPEC.md` §7: default 5, caller-capped 1–10), parity rather than measurement. The curve
above only became visible after raising it. **`DEFAULT_TOP_K` is unchanged at 5**: the ceiling
bounds what a caller may request, and the default is what every request pays.

**b. `firestore-vector` was retrieving from a corpus that no longer existed. Fixed 2026-08-24.**
The collection held **305 chunks, every one under the pre-2026-08-24 positional id scheme**, and
289 of them belonged to files that had left the corpus (`tm9a6.2.pdf`, `tm9a6.8.pdf`, the volunteer
manual) — it predated the corpus expansion entirely.

The failure was structural, not an oversight: `seed:firestore-chunks` is idempotent *by filename*,
skips what is already present, and never deletes, so **no amount of re-seeding would ever have
corrected it.** Content-derived ids make that worse rather than better — a changed chunk writes a
new document instead of overwriting the old one, so stale accumulation is the default. Hence
`npm run seed:firestore-chunks -- --wipe`, added the same day. Re-seeded: 15 documents, 393 chunks,
0 skipped.

**c. The two vector arms are numerically equivalent — now proven, not assumed.** After the
re-seed, `npm run compare:vector-arms` reports **30/30 queries ranked identically**, maximum score
drift ~1e-4 (float precision). Across the full harness both arms return **54.3% recall, 9.8%
precision, 0.551 MRR, 0.492 nDCG** — identical to three decimals.

That matters practically: Firestore's index is configured `flat`, i.e. exhaustive rather than
approximate, so the two compute the same thing. **Retrieval work can be iterated offline for free
and the result transfers**, and the choice between them is operational (how embeddings get updated)
rather than a quality question — see `LocalVectorAdapter`'s doc comment.

## 5. What this does not measure

- **Answer quality.** See §1.
- **Anything on turns that cannot be answered in isolation.** Nine turns are pure-deixis follow-ups
  ("So what should I compare instead?"). No retrieval strategy can score on them while ◆G11 keeps
  retrieval running on the raw turn — they are a standing ~9% ceiling on total recall, and evidence
  for query rewriting rather than for any adapter.
- **Alkalinity.** 36 chunks, 9% of the corpus, and no fixture asks for it — in this harness it can
  only ever be a false positive.

## 6. What invalidates the baseline

- **A corpus change.** Chunk ids are content-derived, so an edited passage changes its id and the
  label loader fails loudly at load rather than silently scoring a miss.
- **An embedding-model change.** The cache records its model and refuses to mix.
- **A label change.** Re-baseline; do not compare across label revisions.
- **Changing `MAX_TOP_K` or `DEFAULT_TOP_K`.** Every number here is k-dependent.
