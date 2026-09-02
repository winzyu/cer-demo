# Phase 1c — contamination measurement

**Verdict: exit criterion 1 PASSES on the first measurement. No questions were rewritten.**

| measurement | scope | rank-1 returns own source | bar |
|---|---|---:|---|
| (a) Document level | 92 turns, all 46 fixtures | **22.8 %** (21/92) | < 40 % |
| (a) Document level, refusals excluded | 84 turns | **25.0 %** (21/84) | < 40 % |
| (b) **Chunk level** | 86 turns, 43 fixtures | **11.6 %** (10/86) | < 40 % |

Date: 2026-09-01. Corpus `data/corpus/corpus.json`, 451 chunks, 11,197 index terms.
Retriever: `src/retrieval/lexical/Bm25Index.ts` at defaults (`k1 = 1.2`, `b = 0.75`), offline, no
API calls. Fixture set: `eval/fixtures-wave1/`, 46 fixtures / 92 turns as committed at `92438f3`.

> **Re-measured 2026-09-02, after the Phase 1d qualification edits.** Those edits added missing
> files to `answerable_from` on 12 fixtures, and the document-level metric is computed against that
> field, so the number moved by construction: **25.0 % (23/92)**, or **27.4 % (23/84)** excluding
> the refusal turns. Both still clear the < 40 % bar comfortably. **Chunk level is unchanged at
> 11.6 %** — gold chunks are resolved from each fixture's `notes`, which the edits did not touch.
> No question text was changed, so the wording being measured is identical to the original pass.

---

## What was measured

Contamination here is *not* "can the question be answered from that source". It is "does the
question's wording trivially retrieve its own source by keyword match". A question that is the
source sentence with a question mark on it makes retrieval score beautifully and measure nothing.

Two levels, reported separately because they answer different questions.

**(a) Document level — all 92 turns.** Is the BM25 rank-1 chunk from a file listed in the fixture's
`answerable_from`? This is the conservative check: a USGS chapter carries 40–90 chunks, so landing
on the right *document* is far easier than landing on the right *chunk*. If document level passes,
chunk level can only be lower. The 8 refusal turns have an empty `answerable_from` and can never
score a hit, so the row excluding them is given too — it is the honest denominator, and it still
passes.

**(b) Chunk level — 86 turns across 43 fixtures.** Is the rank-1 chunk one of the exact chunks the
question was written from? Provenance was resolved mechanically: each fixture's `notes` names claim
ids, each claim id was looked up in `eval/claims/*.json`, and that claim's `chunkId` became part of
the fixture's gold set. 43 of 46 fixtures resolve, 360 claim-id mentions in total, 232 distinct gold
chunks (median 5 per fixture, range 1–15).

The three fixtures that resolve no claim ids are `refusal-buffering-capacity-not-measured`,
`refusal-temperature-harm-threshold` and `refusal-turbidity-sensor-hardware`. All three are
refusals, built from *gaps* in the inventory rather than from claims, so they correctly have no gold
chunk. They are **excluded** from (b), not counted as passes — counting an unhittable turn as clean
would flatter the number.

Note the `chunkId` here is a **provenance** link — what the question was written from — not a
relevance label. Relevance labels come in Phase 1e.

Where a fixture's `notes` name a claim as a *trap* rather than a source (the refusal fixtures do
this, citing the turbidity cleaning-frequency claims as the sharpest wrong answer), that claim's
chunk still entered the gold set. That inflates the gold set and therefore inflates the hit rate.
The 11.6 % is conservative in the direction that matters.

## Per class

| class | chunk level | document level |
|---|---|---|
| `cross-document` | 3/24 = 12.5 % | 8/24 = 33.3 % |
| `deep-in-manual` | 3/20 = 15.0 % | 5/20 = 25.0 % |
| `definitional` | 0/8 = 0 % | 0/8 = 0 % |
| `follow-up` | 0/8 = 0 % | 1/8 = 12.5 % |
| `precedence` | **4/8 = 50.0 %** | 5/8 = 62.5 % |
| `probe-calibration` | 0/16 = 0 % | 2/16 = 12.5 % |
| `refusal` | 0/2 = 0 % | 0/8 = 0 % |

`precedence` is the one class over the bar on its own, and the reason is structural rather than a
wording failure — see below. It is 8 turns of 86; the set as a whole is not close to the bar.

## The ten chunk-level hits

| class | fixture / turn | rank-1 chunk |
|---|---|---|
| `precedence` | `precedence-orp-reference-offset` t1 | `water-quality-metrics-source-of-truth.pdf__57fe7a67fc10` |
| `precedence` | `precedence-hypoxia-threshold-split` t1 | `water-quality-metrics-source-of-truth.pdf__57fe7a67fc10` |
| `precedence` | `precedence-ph-band-asserted-vs-described` t1 | `water-quality-metrics-source-of-truth.pdf__57fe7a67fc10` |
| `precedence` | `precedence-ec-temperature-coefficient` t1 | `usgs-nfm-a6.3-specific-conductance.pdf__361ef9509206` |
| `cross-document` | `crossdoc-two-oxygen-tables-disagree` t1 | `epa-sop-field-instrument-calibration-2010.pdf__2d02065fcb50` |
| `cross-document` | `crossdoc-do-calibrated-dry-deployed-brackish` t1 | `epa-sop-field-instrument-calibration-2010.pdf__79fe9d98c188` |
| `cross-document` | `crossdoc-do-calibrated-dry-deployed-brackish` t2 | `epa-sop-field-instrument-calibration-2010.pdf__2d02065fcb50` |
| `deep-in-manual` | `deepmanual-cross-section-points` t1 | `usgs-nfm-a6.0-field-measurement-guidelines.pdf__3d34fa1943f9` |
| `deep-in-manual` | `deepmanual-cross-section-points` t2 | `usgs-nfm-a6.0-field-measurement-guidelines.pdf__19b41bfb8c9f` |
| `deep-in-manual` | `deepmanual-turbidity-rounding` t2 | `usgs-nfm-a6.7-turbidity.pdf__d154f3467ba4` |

**Three of the four `precedence` hits land on the same chunk, and that is the class definition, not
contamination.** A precedence fixture asks whether a number on the operator's card is authoritative.
The operator's card *is* `water-quality-metrics-source-of-truth.pdf`, and the whole set of asserted
bands sits in one chunk. Quoting the disputed number is the question — "our card says +200 to +400
millivolts, is that solid enough" cannot be asked without the number in it. Removing it would not
decontaminate the fixture, it would delete the fixture. The retrieval test in this class is whether
an arm also reaches the USGS chapter that *contradicts* the card, and that half is untouched by the
rank-1 hit.

The `crossdoc` and `deepmanual` hits are ordinary: named document titles ("the EPA field SOP",
"EPA Method 180.1") and unavoidable domain nouns ("cross section", "vertical"). No rewrite is
available that keeps the question sensible.

## Where the gold chunk ranks when it is not rank 1

| gold rank | turns |
|---|---:|
| 1 | 10 |
| 2–5 | 17 |
| 6–20 | 26 |
| 21–100 | 22 |
| not in top 100 | 11 |

The mass sitting at ranks 6–100 is the shape a clean set should have: the gold chunk is reachable
but not handed over, which is what leaves room for retrieval arms to differ.

## The check's blind spot, and what it found there

A necessary check, not a sufficient one. A question so mangled that nothing relevant retrieves
scores a perfect 0 % and is a terrible fixture. Phase 1d (human review) is what catches clean-but-
wrong; the 11 turns whose gold chunk never enters the top 100 are where to look first, so they are
listed here rather than buried.

Eight of the eleven are **turn 2**. A turn-2 follow-up is elliptical by construction — "Do those
need the same treatment?", "If it turns out to be that one, can we just swap it ourselves?" — and
BM25 scores it with no conversation history, so there are barely any content words to match. The
arms under test see the preceding turn. This is a property of the measurement, not of the fixtures.

Of the three turn-1 misses, two are worth a note at review time:

- `deepmanual-do-saturation-ceiling` t1 and t2. Gold is the two captioned `Table 6.2–2` solubility
  chunks in `usgs-nfm-a6.2`. Both carry their caption and header — these are *not* the 11 headerless
  grids §2b warns against, and the fixture is honestly answerable. BM25 misses because a number grid
  is word-poor and the question's content is "20 °C" and "760 mm". That is exactly the retrieval
  problem the recovered tables were restored to expose.
- `followup-jumpy-temperature-trace` t1. Gold is one prose chunk in `usgs-nfm-a6.1` about replacing
  a malfunctioning sensor; rank 1 is a slice probe datasheet. Content is on topic and the question
  reads naturally. Flag for Phase 1e labelling rather than for rewriting.

`deepmanual-turbidity-rounding` t1 asks "how many decimal places do we actually keep" against a
chapter that says *significant figures*; rank 1 is still the correct document. That is a good
operator paraphrase, not a defect.

## Reproducing

Free and offline. Build the claim-id → `chunkId` map from `eval/claims/*.json`, scan each fixture's
`notes` for those ids, index the corpus with `loadBm25Documents()` + `new Bm25Index(docs)`, and
compare `search(turn.content, 1)[0].id` against the fixture's gold set (chunk level) and
`answerable_from` (document level). Refusal fixtures with no resolvable claim id are excluded from
the chunk-level denominator.

## What was not done, and why

No question text was rewritten, no rubric was touched, no `answerable_from` was changed, and no
fixture was rebuilt on a different claim. The set cleared the bar on the first measurement, and
manufacturing a rewrite to justify the phase would only move a number that is already passing.

The slice-exclusion regeneration described in the phase brief was a contingency for a failed
measurement — a list to check rewrites against. There were no rewrites, so it was not generated.
