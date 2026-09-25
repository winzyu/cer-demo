# Eval Rebuild — plan and context

The evaluation apparatus is being rebuilt from scratch. This file is the working plan and the
only context a fresh session needs. It replaces reading the bake-off documents.

**Read this, then `CLAUDE.md` (house rules), then start at Phase 0.** Do not read
`RETRIEVAL_BAKEOFF.md` unless a task here sends you there — it documents a completed experiment
whose conclusions are superseded by §1 below. Its results report and fixture spec are archived
(`docs/ARCHIVED.md`).

---

## 0. Why this is happening

The previous evaluation produced a decision that does not hold up, for three independent reasons.

**The arm comparison was confounded by broken generation.** Retrieval arms were compared on a
system where 53–59% of turns carried an ungrounded claim and correctness sat at 1.08 against a
1.30 floor. The headline retrieval finding — that extra chunks *dilute* and hurt answers — was
measured on a model ignoring its grounding instructions half the time. Fix generation and that
finding may shrink, vanish, or reverse. Nobody knows.

**The gate closed in the wrong order.** ◆G7 was split on 2026-08-26: the retrieval half closed on
`firestore-direct`, the quality floor was re-filed as a deploy blocker. That was a reasonable
escape from a real deadlock (the prompt was a pinned control, so quality could not be worked on
without voiding the arms). But it left a provisional result recorded as CLOSED, and everything
downstream treated it as settled.

**Every number was measured on a placeholder model.** All captures ran on `gpt-oss-20b`, which was
never the intended shipping model. The oracle-router ceiling of 1.155, the dilution finding, the
per-class results — all are properties of a model that is being replaced by `gpt-oss-120b`.

**The fixture set also cannot do its job.** 30 fixtures, of which **27 are answerable from 4.4% of
the corpus**. Three fixtures carry the entire `deep-in-manual` class — the whole argument for
retrieval existing in this system. A three-sample class mean has a standard error of 0.43 on a
0/2 scale; it cannot support any conclusion.

---

## 1. Decisions already made — do not relitigate

| decision | status |
|---|---|
| Rebuild the fixture set and labels from scratch | **Settled** |
| Keep the instruments (`gate:check`, `judge`, `cost`, `retrieval:eval`, bakeoff runner) | **Settled** — they are good, hard-won, and their traps are already fixed |
| Archive rather than delete; nothing is `rm`'d | **Settled** |
| Freeze chunking parameters before labelling | **Settled** |
| Fix generation first, then retrieval | **Settled** |
| Pre-registered thresholds carry forward **verbatim** | **Settled — these do not move** |
| Shipping generator is `gpt-oss-120b` | **Settled 2026-08-31 — final production model.** Cost-cleared, §4. Phase 3 is a single-model baseline, not a sweep. |
| The `restore-pgvector` work is dropped | **Settled 2026-08-31.** Not pursued. The tag `wip-restore-pgvector-2026-08-31` stays as the record — it costs nothing and matches the archive-don't-delete pattern used throughout. Do not spend time on it. |
| Fixture-set sizing: two-wave, wave 1 = 88 turns | **Settled 2026-08-31**, §2 |
| Judge is `deepseek-v4-flash-0731` on Fireworks | **Settled 2026-08-31, shipped 2026-09-02.** Highest measured human agreement, cross-family, already wired and priced. §3a. `DEFAULT_JUDGE_MODEL` now carries it, and `test/unit/judge.test.ts` fails if it is put back into the generator's family. |
| Judge must not be in the `gpt-oss` family | **Settled** |
| Fixture author, judge, and generator must be three different families | **Settled** |

**The thresholds, carried forward unchanged from the 2026-07-30 pre-registration:**

| gate | threshold |
|---|---|
| Fabricated figures | **Zero** |
| Other ungrounded claims | ≤2% of turns |
| Refusal integrity | 100% |
| Citation validity | ≥95% |
| Correctness, per class | ≥1.00 / 2 |
| Correctness, overall | ≥1.30 / 2 |

Thresholds set after the numbers exist are not a test. If you cannot reach them, say so — that is
a finding, not a failure.

---

## 2. Sizing — DECIDED 2026-08-31, two-wave build

The user has chosen the **two-wave** build. This is settled; do not re-ask.

| | turns/class | total turns | ~fixtures | calibration rows | user's time |
|---|---:|---:|---:|---:|---|
| **Wave 1 — build this now** | 8 | **88** | **40–45** | **30** | ~4–6 h |
| Wave 2 — only after the exit criteria below | 12 | 132 | ~60 | +20 | ~3–4 h |

Wave 1 exists to test the *design* end to end before it is replicated at scale. Do not author 60
fixtures against a design that has not produced a number yet.

### Wave 1 exit criteria — all five must hold before building wave 2

These are what "specific metrics are met" means. Check them explicitly and report each one.

| # | criterion | threshold | what failure means |
|---|---|---|---|
| 1 | **Contamination** — BM25 over the finished questions returns the gold chunk at rank 1 | **< 40% of questions** | The questions inherit their source chunks' vocabulary. Wave 2 would replicate the flaw at scale. Fix 1c before proceeding. |
| 2 | **Judge agreement** — Cohen's κ on correctness vs the 30 human rows | **≥ 0.70** | The judge cannot stand in for the human. More fixtures do not help; change the judge or the rubrics. |
| 3 | **Outside-slice coverage** — turns answerable ONLY outside the ◆G9 slice | **≥ 25% of turns** | Either the corpus cannot support the retrieval question, or generation drifted toward easy questions. Both are findings that change the plan. |
| 4 | **Class discrimination** — per-class correctness means are not all within noise of each other | at least 3 classes separated by **> 2 SE** | The class structure is not earning its keep. Reallocate the wave 2 budget rather than spending it uniformly. |
| 5 | **Harness integrity** — Tier 1 and Tier 2 both run end to end on the new set | no harness errors, no unparseable verdicts | Fix the harness before scaling. |

**If a criterion fails, that is a result, not a delay.** Report it, fix the cause, re-check. Wave 2
is a top-up of a design that works, never a rescue of one that does not.

Do **not** allocate uniformly across classes:

- `deep-in-manual`, `cross-document`, `probe-calibration` — **15–20 each.** These separate the arms.
- `definitional`, `follow-up`, `precedence` — **6–8.** All arms tie here.
- `refusal` — **6–8.** Near-binary, reproduces cleanly (measured 30/30).

### Wave 1 class allocation — DECIDED 2026-09-01

Seven classes, 88 turns, 44 two-turn fixtures. `EVAL_CLASSES` in `src/eval/types.ts` still lists
twelve; the five unused ones stay in the type and are simply not populated for wave 1.

| class | fixtures | turns | why |
|---|---:|---:|---|
| `deep-in-manual` | 10 | 20 | Separates the arms. **Absorbs `threshold-lookup`** — same question shape, and it is what the recovered solubility tables serve. |
| `cross-document` | 10 | 20 | Separates the arms. 411 candidate claims tie 2+ metrics. |
| `probe-calibration` | 8 | 16 | Separates the arms, and is forced outside the slice by construction — see below. |
| `precedence` | 3 | 6 | Three verified conflicts already found in Phase 1a. **Revised 2026-09-13**: rewritten around a new premise — a range a corpus document describes is background, not the pod's configured limit — after the source-of-truth document (one of the three original conflicts) left the corpus; one fixture dropped. |
| `definitional` | 4 | 8 | All arms tie here. |
| `follow-up` | 4 | 8 | All arms tie here. |
| `refusal` | 4 | 8 | Near-binary, reproduces cleanly. Drawn from the 168 recorded gaps. |

**Dropped for wave 1, with reasons:**

- `acronym-exact-token` — **slice-answerable and therefore structurally unable to discriminate.**
  NTU/FNU and the rest sit in the datasheets and the source-of-truth. Three of the old set's
  fixtures were this class, and that is part of why the old set failed.
- `event-signature`, `sensor-combined` — both depend on the source-of-truth signature matrix, which
  **extraction damaged**: several rows lost cells and one shows five arrows for six columns. A
  fixture on mangled text is wrong, not hard.
- `fouling-drift` — thin support. `a6.0` has zero occurrences of "fouling"; essentially one
  operator-document claim backs the whole class.
- `threshold-lookup` — folded into `deep-in-manual` rather than dropped.

**`probe-calibration` is the structurally strongest class and worth stating why.** The four probe
datasheets give recalibration *intervals* and specifications but contain **no calibration procedure
at all** — no buffer values, no Zobell standard, no air-saturation step. The methods live only in
the USGS manuals, outside the slice. So a question of the form *"the datasheet says recalibrate
yearly — how do I actually do it?"* is forced outside the slice **by construction** rather than by
hoping. That is exit criterion 3 satisfied structurally.

**At least 25–30% of turns must be answerable ONLY outside the ◆G9 slice.** Today it is 3 of 28.
A question answerable inside the slice cannot discriminate between retrieval strategies.

---

## 2b. Chunking — FROZEN 2026-08-31, alpha-ratio filter removed

Recorded here because chunk ids are content-derived SHA-256 (`src/ingestion/chunk.ts`), so
**changing any value below voids every retrieval label written against it.** Adding documents is
safe forever; re-chunking is not.

| parameter | value | where |
|---|---|---|
| Chunk size | **3,200 chars** | `CHUNK_SIZE_CHARS` |
| Overlap | **400 chars**, prepended from the previous chunk | `OVERLAP_CHARS` |
| Splitter | recursive, separators `\n\n` → `\n` → `. ` → ` ` → hard cut | `SEPARATORS` |
| Minimum chunk | **100 chars** | `MIN_QUALITY_CHARS` |
| Alphabetic-ratio filter | **OFF for every document** — and off by *default* since 2026-09-02, so the destructive state has to be asked for | `chunk.ts` `isQualityChunk`, set explicitly at `ingest.ts` |
| Boilerplate drop | `adobe acrobat`, `acrobat reader`, `click here to download` | `BOILERPLATE` |
| Chunk id | `<filenameSlug>__<sha256(text)[0:12]>` | `chunkIdOf` |

**Corpus fingerprint at freeze** — `data/corpus/corpus.json`, re-ingested 2026-08-31:
15 documents, **851,891 chars**, **451 chunks**. Extraction: 14 `pdf`, 1 `ocr-cache`.
◆G9 direct-feed slice: 5 documents, 37,660 chars, **4.4%**.

**(Superseded 2026-09-13:** the operator source-of-truth document was removed from the corpus when
its ranges were vetoed. Current corpus: 14 documents, 840,327 chars, 446 chunks — exactly the
document's 5 chunks dropped, no other chunk id changed. ◆G9 slice: the 4 remaining probe
datasheets, 26,096 chars, 3.1%. See `timeline.md` "Eval rebuild".)

### Why the filter came out — reversed after the first freeze

The first freeze on 2026-08-31 kept the filter and recorded 393 chunks. That was reversed the same
day, before any label existed, once the cost of keeping it was measured concretely.

`chunk.ts` documented an escape hatch: skip the alphabetic-ratio test for `.md`/`.txt`, where a low
ratio means a table rather than OCR noise. The reasoning was right and **the condition matched
nothing** — every document in this corpus is a PDF, so the exemption was dead code and the filter
ran on all fifteen. What it removed:

| dropped by the filter | chunks |
|---|---:|
| Numeric tables | **42** |
| Table-of-contents dot leaders | 17 |
| Genuine OCR noise — the only thing it exists to catch | **0** |

34 of the 42 were the oxygen-solubility tables in `usgs-nfm-a6.2`, the corpus's authoritative
source for DO threshold lookups. Direct-feed consumes whole document text and kept them; every
vector arm could not retrieve them at all. A `threshold-lookup` question about oxygen solubility
would have scored as "feeding beats retrieving" when it was a filter setting — one more instance of
exactly the confound §0 describes.

**The reversal was nearly free, and measurement is why we know that.** Chunk ids are derived from
chunk text, and the filter runs *after* chunking, so turning it off cannot alter a surviving
chunk's text. Verified rather than assumed: re-ingest kept **393 of 393 existing ids, zero lost**,
and added 58. All 1,023 claims already extracted stayed valid; only `index` moved, and it was
re-derived from `chunkId`.

**The 17 dot-leader chunks now survive too.** They are inert — no real question ranks them — and an
inert chunk is a better failure than a silently deleted table.

### The recovered tables are retrievable, but 11 of them are headerless

Confirmed after re-ingest: BM25 returns `usgs-nfm-a6.2` chunks at rank 1 for solubility and
salinity-correction queries, where before the material did not exist in the index. 30 of the 36 new
a6.2 chunks carry real numeric cells.

**But of the 35 recovered numeric-table chunks corpus-wide, only 24 are self-describing.** The
other 11 are bare number grids whose caption and column header fell on the far side of a chunk
boundary — a retrieval arm handed one of those gets a value with no way to know which pressure or
salinity column it belongs to. **Do not build a fixture whose answer requires a value from a
headerless grid**; it is not honestly answerable from retrieval even now. Phase 1a records which
chunks these are.

### What is safe to change later, and what is not

- **Adding or removing a document is safe.** Ids are content-derived, so existing chunks keep their
  ids and their labels. A removed document's labels go dead and are visible as dead.
- **Editing a document is nearly safe.** Measured: a one-word edit invalidates **0–2 chunks**, never
  the document and never the corpus, because the splitter breaks on `\n\n` first and an edit stays
  inside its own paragraph's chunk.
- **Changing a parameter in the table above is destructive.** Every existing chunk id re-derives at
  once, whatever the current chunk count (446 as of 2026-09-13; it was 451 at the freeze — that
  drop is the removed source-of-truth document, not a re-chunk).
- **Re-OCRing a scanned document is destructive to that document, and only to it.** New in the
  2026-09-21 rebuild: the OCR cache was lost with the machine and had to be regenerated with
  tesseract 4.1.1 instead of the 5.3.4 that produced the original, which moved
  `epa-sop-field-instrument-calibration-2010.pdf` by +86 chars. Because ids are `sha256(text)`,
  a changed OCR pass is not an edit — it replaces the whole document's text. Measured against
  `eval/claims/`: **434 of 446 chunk ids still resolve, and the 12 that do not are exactly that
  document's.** Chunk *count* was unaffected (12 before, 12 after), so only the hashes moved.

  This is the first case where the **human locator** has to earn its keep rather than being
  insurance. Every one of those 12 claims carries a `locator` (document + section + short quote),
  so the fix is to **re-resolve** them against the new chunks, not re-extract the claims. Doing it
  by re-extraction would also discard the corrected drift/QAPP gap statement in that document's
  inventory, which was wrong at the 2026-09-01 qualification pass
  (`eval/fixtures-wave1/_QUALIFICATION.md` §2.1) and has since been fixed.

  **Done 2026-09-21.** All 12 entries were re-resolved onto the corpus chunk of the same index.
  The mapping was confirmed by exact-quote evidence rather than assumed from the index: every entry's quotes match its mapped chunk and no other, with the expected spill into index+1 from the 400-char chunk overlap.
  The re-OCR also broke 12 `quote` values; 11 were the same passage with only OCR characters moved (`14.38` to `1438`, `uS/om` to `yS/em`, straight to curly apostrophes) and were refreshed against the mapped chunk.
  Claim ids, claim text, `type`, `metrics`, `specificity`, `locator` and the summary blocks are unchanged, so the corrected drift/QAPP gap statement survives.
  446/446 chunk ids resolve, with 2177 claims, no duplicate ids and no quote over 200 chars; per-claim detail is the 2026-09-21 note in `eval/claims/_STATUS.md`.
  The twelfth quote, `epa-oxygen-solubility-chart-01`, was re-parented to chunk index 10 on 2026-09-23 (`c85848a`), and `eval/retrieval-labels/` carries none of the 12 old ids.
  `dev` made the same re-resolve independently (`9b18094`, `959fe94`) against its uncorrected fixtures, two of which name the chart claim; merging `dev` here on 2026-09-24 kept the corrected fixtures, whose labels do not name it, and the claim files were byte-identical on both sides.

Phase 1e's **human locator** (document + section + short quote) is the mitigation for all three. It
lets a label be re-resolved against a new chunk instead of re-authored. Phase 1a is already
capturing locators, so the protection is in place before any label exists.

---

## 3. Model roles — three families, three jobs

| role | model | why |
|---|---|---|
| **Fixture author** | Claude (this tooling, human-supervised) | One-time, non-reproducible work where a human checks every output. A CLI agent is the right surface. |
| **Judge** | **`deepseek-v4-flash-0731`** on Fireworks — decided, §3a | Must not be Claude (it authored the fixtures) and must not be gpt-oss (it generates). |
| **Generator** | `gpt-oss-120b` | The product. |

**The judge must be called through an API, never through a CLI.** A judge is an instrument: it
needs a pinned model id, `temperature: 0`, an enforced JSON schema, and per-call usage accounting.
A CLI agent has an uncontrolled system prompt, tool access, session state, and version drift —
none of which can be pinned, and all of which break reproducibility.

`scripts/judge.ts` already accepts `--judge-model=` / `JUDGE_MODEL`, and already guards against the
judge being the model under test (`scripts/judge.ts:240`). Gemini exposes an OpenAI-compatible
endpoint, so it is close to config-only with the existing `openai` client. Anthropic is not
OpenAI-compatible and would need `@anthropic-ai/sdk` plus a small adapter in `judgeOnce`.

Add a `CHAT_PRICES` entry for whatever judge is chosen or the budget line prints blank.

### 3a. Judge — DECIDED 2026-08-31: `deepseek-v4-flash-0731`

**The evidence.** Judge-vs-human on the 24 comparable rows of `eval/grading/warm/scores.csv`
(12 of 36 excluded as stale — the arm was re-captured after grading), computed from the four
ledgers in `data/results/judge/`. No API calls; reproduce with `calibrate()` over each ledger.

| candidate | correctness κ | ungrounded κ | citations κ | signed bias | family |
|---|---:|---:|---:|---:|---|
| **`deepseek-v4-flash-0731`** | **0.937** | **0.577** | **0.440** | −0.042 | cross |
| `nemotron-lightning-3p5-30b-a3b` | 0.898 | 1.000 (n=11) | 0.250 | −0.067 | cross |
| `gpt-oss-120b` | 0.874 | 0.320 | 0.045 | −0.083 | **same as generator** |
| `minimax-m3` | 0.747 | 0.459 | 0.000 | −0.083 | cross |

The only candidate clearing κ 0.70 on all three dimensions. Cross-family — not Claude (fixture
author), not gpt-oss (generator), so §1's three-families rule is met in intent and not only in
letter. Already reachable through the existing Fireworks client and already priced in `prices.ts`,
so Phase 2b was a one-line change to `DEFAULT_JUDGE_MODEL` rather than new transport code.
**Done 2026-09-02** — see §5 Phase 2b.

**Gemini was evaluated and not chosen.** It is a fine judge on paper and remains the fallback if
deepseek fails re-calibration, but it needs base-URL/key selection at `scripts/judge.ts:272-278`,
a `CHAT_PRICES` entry, and one paid pass to get any agreement number at all — against a candidate
that already has one. The AI Studio free tier was considered and rejected on two grounds: Google no
longer publishes free-tier RPM/TPM/RPD (they are per-account in AI Studio, so the workload cannot
be planned against them), and free-tier content is used to improve Google products, which would
send the hand-authored fixture set to a third party. Neither risk buys anything — see §4a, the
whole project runs at $8–11 on deepseek.

**A CLI judge is out, permanently.** Gemini CLI, Claude Code, or any other: no `temperature: 0`, no
`response_format` schema, no per-call token accounting for `JudgeRecord`, no pinned model id, and —
worst — a CLI agent's working directory is this repo, so it can read *this file*, which states the
thresholds and the expected per-class results. That is not a judge, it is a recital.

**Two rules pre-registered now, before any number exists.**

1. **Signed bias is reported alongside κ, always.** κ is symmetric and hides a judge sitting a
   uniform point off in either direction. On current evidence every candidate is slightly *harsher*
   than the human, not more lenient — the opposite of the usual concern — but n=24 and the check
   stays two-sided.
2. **No judge swapping after seeing results.** If a second judge is ever run alongside, the primary
   score stands, the disagreement *rate* is reported next to every result, and turns where the two
   differ by 2 go into the human sample. Picking the judge whose numbers look better is not a
   measurement.

**This is provisional until Phase 2c.** 24 rows on 6 fixtures calibrates an instrument; it does not
conclude anything. §2's exit criterion 2 (κ ≥ 0.70 on correctness) is re-measured against the new
30-row stratified sample, and that is the number that decides whether this judge survives.

Two smaller facts from the same comparison: the `deepseek` ledger is 82 rows, not 83 — one
`ungrounded` call on `firestore-direct | deepmanual-stabilization-criteria | turn 2` was never made.
And `nemotron`'s ungrounded κ of 1.000 rests on 11 pairs; it was already rejected for a 22.9%
unparseable-reply rate and 3,669 completion tokens per call.

---

## 4. Cost facts, measured — none of this is a constraint

Reproduce any of it with `npm run cost -- --model=<id> --completion=measured` (free, no network).

**Generator, `firestore-direct`, warm:**

| | per answer | 12 mo @ 10k/mo |
|---|---:|---:|
| `gpt-oss-20b` | $0.000612 | $73.41 |
| `gpt-oss-120b` | $0.000625 | $74.95 |

**+2.1%, +$1.54/year.** The upgrade is effectively free.

**The finding that matters more than the model choice:** the two rate cards cross at **~697
completion tokens**. Below that, 120b is *cheaper* (at 400 tokens: $0.000421 vs $0.000618). The
measured mean is 740 — six percent past the crossover. `max_tokens` moves this number more than
the model does, and shorter answers independently help groundedness.
**(Superseded 2026-09-14:** the Phase 3 gold-context capture measured 120b itself at 52,840 completion tokens over 90 turns, a mean of 587, below the crossover.
Its cache hit rate was 55.5%, not the 99.0% measured on 20b.
Both figures come from one capture on the pre-refusal-contract prompt, so re-measure on the recapture.)

**Judge cost is input-dominated** — the prompt dwarfs the completion on every dimension, so the
input rate decides a judge's bill. Always run `npm run judge -- --dry-run` first. Sized properly
in §4a.

**Two caveats that would invalidate the generator figures.** Completion length is assumed to carry
from 20b to 120b and will not — 120b has its own reasoning budget, and break-even sits only 6%
below the assumed length. Cache hit rate is likewise assumed to carry; cold (`--cache-rate=0`),
120b is 2.1× worse. **One real capture at ~$0.02–0.05 resolves both** and simultaneously gives the
first honest read on whether 120b moves the 53% ungrounded number. Do that early.

---

## 4a. Judge volume and cost — sized 2026-08-31

Per-call means measured over `data/results/judge/warm.jsonl` (482 calls, 198 turns), not estimated:

| dimension | calls/turn | prompt | completion |
|---|---:|---:|---:|
| correctness | 1.00 | 4,939 | 503 |
| ungrounded | 1.00 | **11,648** | 940 |
| citations | 0.43 | 11,447 | 681 |
| **total per turn** | **2.43** | **21,555** | **1,739** |

Wave 1 is six passes — gold-context 120b, the 20b comparison, and four retrieval arms (pgvector is
dropped, §1). 528 turns, ~1,285 calls, 11.4M prompt tokens.
**(Superseded 2026-09-15:** the 20b comparison is dropped, so wave 1 is five passes.
120b is settled, and at the measured 587-token completion mean it is also the cheaper model.
The harness keys transcripts and judge verdicts by arm, not model, so a 20b pass would need a model dimension added first.)

| scope | calls | deepseek-v4 | Gemini 2.5 Flash | gpt-oss-120b |
|---|---:|---:|---:|---:|
| one 88-turn pass | 214 | $0.52 | $0.95 | $0.38 |
| wave 1 — 6 passes | 1,285 | **$3.11** | $5.71 | $2.26 |
| wave 1 + one full redo | 2,570 | $6.22 | $11.42 | $4.52 |
| + wave 2, whole project | 4,498 | **$10.88** | $19.98 | $7.90 |

**Cost does not constrain any judge decision.** The spread between the cheapest and the most
expensive credible option, across the entire project, is about $12.

**§2a is a bigger cost lever than the model choice.** Moving groundedness into Tier 1 removes the
11,648-token `ungrounded` call — 54% of all prompt tokens:

| after 2a | calls/turn | wave 1 (deepseek) | whole project |
|---|---:|---:|---:|
| drop `ungrounded` | 1.43 | $1.43 | $5.00 |
| correctness only | 1.00 | $0.75 | $2.62 |

That is a 4x reduction on top of an already trivial bill, which is not the reason to do 2a — the
reason is that the instrument cannot currently read as fine as the 2% threshold requires — but it
does mean there is no cost argument for keeping groundedness in the paid tier.

---

## 5. The plan

> **Every phase ends with a STOP.** Do not roll into the next phase. Hand back to the user with
> the block written under that phase — what you did, what it cost, what they must decide or do,
> and the exact commands if any are theirs to run. The user runs all git; several phases need
> hours of their time. Surprising them with work they did not know was coming is the main way
> this plan fails.

### Phase 0 — Lock the slate (sequential, main thread, no agents) — ✅ **COMPLETE 2026-09-01**

1. **Settle the uncommitted work.** `src/eval/judge/{prompts,runner}.ts` and `src/eval/prices.ts`
   carry the `response_format: json_schema` enforcement plus two judge price entries. This is
   good work and should land — it is a prerequisite for a trustworthy judge. Also uncommitted and
   of unknown authorship: `docs/migration/DEVICE_API.md`. `.env.example.tmp` is an empty stray;
   delete it.
2. **Finish the judge-model comparison.** Four ledgers sit in `data/results/judge/` from
   2026-08-28 — `warm.schema-{120b,minimax,deepseek,nemotron}.jsonl` (83/83/82/50 rows).
   `nemotron` was rejected and committed; **minimax and deepseek were never concluded.** Computing
   cross-model agreement from these is free — no API calls — and it is the evidence that picks the
   judge. Do this before choosing.
3. **Freeze chunking.** Record size, overlap, and filter rules explicitly in this file. Chunk ids
   are content-derived SHA-256; **changing any of these voids every label.** Adding documents later
   is safe and does not perturb existing chunks — only re-chunking does.
4. **Archive the old eval artifacts** the way the docs were archived: tag, then delete from the
   tree, then leave a row in `docs/ARCHIVED.md`. Covers `eval/fixtures/`, `eval/fixtures-next/`,
   `eval/retrieval-labels/`, `eval/transcripts/`, `eval/grading/`. Nothing is lost — every one is
   committed and retrievable via `git show <tag>:<path>`.

   **Done 2026-09-01** under the tag **`eval-archive-2026-09-01`** (pointing at `92438f3`, the last
   commit containing them): 556 files, ~20MB. `docs/ARCHIVED.md` carries the per-directory table and
   the warning that `--calibrate` is broken until Phase 2c. The directory *names* were left free —
   new captures, packets and labels land back at `eval/transcripts/`, `eval/grading/` and
   `eval/retrieval-labels/`, so none of those constants moved. `FIXTURE_DIR` points at
   `eval/fixtures-wave1/`; renaming it back to `eval/fixtures/` is the last step of the migration.

> ### → STOP. Hand back to the user with:
>
> 1. **The judge-model comparison result** — pairwise agreement between the four ledgers, and a
>    recommendation. This is free evidence and it picks the instrument for everything downstream.
>    **Ask them to confirm the judge**, and flag that it must not be Claude (fixture author) or
>    gpt-oss (generator).
> 2. **A git plan** covering exactly what is uncommitted at that moment — derived from a fresh
>    `git status --short`, `git log --oneline -3` and `git status -sb`, never from memory. They run
>    it. Include the archive tag creation.
> 3. **The chunking parameters you are freezing**, stated explicitly (currently 3,200 chars /
>    400 overlap / alpha-ratio filter skipped for `.md`/`.txt`). Default is to keep them as-is —
>    say so and ask only for a yes. Note that after this, adding documents stays safe forever;
>    only re-chunking is destructive.
> Nothing here costs money. Do not proceed to Phase 1 until the judge is confirmed.

### Phase 1 — Build the new eval set

**1a. Claim inventory (agents — parallel by document).** Sweep the corpus and extract, per chunk,
*what claims that chunk supports* — **not questions**. This produces the map of what the corpus can
actually answer, which drives the class quotas and reveals the gaps that refusal fixtures are built
from. Parallelize across the 15 documents; each agent owns a disjoint set of files and writes to
its own output path.

**1b. Question generation (agents — parallel by class).** Generate questions from *claims*, against
the class quota in §2. Single-hop classes draw on one claim; `cross-document` draws claims from
different files; `precedence` needs a conflict between operator range and document; `refusal` comes
from the inventory's gaps. **One agent per class, disjoint outputs.**

**1c. Decontaminate — do not skip this.** A question generated from a chunk inherits that chunk's
vocabulary, so the query embedding sits next to the gold chunk *by construction*, and retrieval
recall becomes meaningless. Rewrite each question in an operator's voice **without the source chunk
visible**. Then verify: run BM25 over the finished questions; **if the gold chunk returns at rank 1
nearly every time, the set is contaminated** and any retrieval number from it is decoration.
`src/retrieval/lexical/Bm25Index.ts` already exists.

**1d. Human verification (user, not an agent).** The user confirms each question is answerable from
its claimed source. Note this checks the *label*, not whether the question is a good retrieval test
— 1c covers that.

**1e. Label separately.** Do **not** assume "source chunk = the only relevant chunk." With 400-char
overlap and 15 documents covering six overlapping metrics, other chunks will also be relevant, and
labelling only the source produces false negatives in ground truth. Run a separate pass over
candidates. Store a **human locator** (document + section + short quote) alongside each chunk hash,
so a future re-chunk can re-resolve labels instead of voiding them.

Also salt in **hard negatives** — chunks that look relevant and are not (the wrong probe's
datasheet, the right metric in the wrong water type). These test discrimination rather than match.

> ### → STOP after 1a. Hand back to the user with:
>
> The claim inventory, summarized per document: how many claims each yielded, which of the six
> metrics each covers, and — most important — **the gaps**. Ask them to spot-check two or three
> documents they know well. This is the cheapest possible moment to catch a document being
> misread, and the inventory drives every quota downstream.
>
> Flag explicitly: **can the corpus support 25% of turns answerable only outside the ◆G9 slice?**
> If not, say so now. That is exit criterion 3 and it is better discovered here than after 40
> fixtures are written.

> ### → STOP after 1b–1c. Hand back to the user with:
>
> 1. **The BM25 contamination number** before anything else — % of questions returning their gold
>    chunk at rank 1, against the < 40% bar. If it fails, do not hand them fixtures to review;
>    fix 1c and re-run first. Their review time is the scarce resource and it must not be spent
>    on a set you already know is contaminated.
> 2. **The ~40 fixtures for human verification** — this is the user's 4–6 hours, so make it
>    reviewable: one fixture per screen, question + claimed source passage + rubric side by side,
>    and a clear yes/no/fix action per row. Tell them roughly how long it will take.
> 3. **The per-class counts** against the §2 quota, so they can see the allocation before
>    committing time to it.

> ### → STOP after 1d–1e. Hand back to the user with:
>
> The label set for confirmation, focusing on the **multi-chunk** labels — those are where false
> negatives hide, and a missed relevant chunk silently scores retrieval as a miss forever after.
> Report how many questions ended up with 1, 2, 3+ labelled chunks, and show a sample of the
> multi-chunk ones. Also report how many hard negatives were placed and where.
>
> Then a git plan: the new fixtures and labels are the first durable artifact of the rebuild and
> should land before anything is captured against them.

### Phase 2 — Rebuild the instruments

**2a. Quote-based citations → Tier 1.** Have the generator attach a short **verbatim quote** to each
claim instead of predicting a line number. A quote is checkable by normalized substring match,
which moves groundedness out of the paid, unreliable Tier 2 into free deterministic Tier 1. This is
the highest-leverage item in the whole plan: the 2% ungrounded ceiling is ≈1 turn of 58, and the
judge dimension currently measuring it flips **11 of 36 verdicts** on byte-identical prompts. *The
instrument cannot read as fine as the threshold requires.* `checkQuotes` already exists in
`src/eval/gates/checks.ts` and currently measures 0 quoted citations on every arm, because the model
has never been asked to emit one.

**2b. Repoint the judge** to the cross-family model chosen in Phase 0. — ✅ **DONE 2026-09-02.**
`DEFAULT_JUDGE_MODEL` is `accounts/fireworks/models/deepseek-v4-flash-0731`. It had still been
`gpt-oss-120b`, which had meanwhile become the *production generator* (§1), so the default judge
was set to grade its own output and nothing in the suite objected. `test/unit/judge.test.ts` now
asserts `judgesOwnFamily(DEFAULT_JUDGE_MODEL, PRODUCTION_GENERATOR) === false`, and that the
shipped judge carries a `CHAT_PRICES` entry so the budget line cannot print blank. No API calls
were made and nothing was spent.

**2c. Re-calibrate** against the human-graded sample. Rows must be **stratified across classes and
arms**, not concentrated — the previous 24 rows sat on 6 fixtures and scored 1.50/2 where the full
58 scored 1.08. Calibrate correctness only; do not spend human hours calibrating the list-producing
dimensions, replace them (2a).

> ### → STOP after 2a–2b, before asking for grading. Hand back to the user with:
>
> 1. **The quote-citation Tier 1 check, working** — demonstrate it on a handful of answers and
>    report the quoted-citation rate. It reads 0 on every existing arm because the model has never
>    been asked to emit a quote; a non-zero number here is the proof the lever is connected.
> 2. **A prompt diff**, since 2a changes the system prompt. Note plainly that this invalidates any
>    capture made before it — which is fine, because the old captures are already dead.
> 3. **The judge repointed**, with `npm run judge -- --dry-run` output showing what a real pass
>    would cost. **Ask before spending it.**

> ### → STOP after 2c. Hand back to the user with:
>
> **The 30 calibration rows to hand-grade** — their second block of time, ~1.5–2 hours. Point them
> at `docs/GRADING_GUIDE.md`, tell them **not to open `KEY.json`**, and use `--out=<dir>`, never
> `--force` (that flag destroyed 36 completed rows once).
>
> When they return the grades, compute κ and report it against the **≥ 0.70** bar in §2. This is
> exit criterion 2 and it decides whether the judge can be trusted for everything after.

### Phase 3 — Generation baseline, at the ceiling

Capture `gpt-oss-120b` against **gold context** — the labelled-relevant chunks fed directly, no
retrieval. This isolates generation completely and answers the question that governs everything
downstream: *if the model cannot clear 1.30 on perfect context, no retrieval strategy will save it.*

Single model — `gpt-oss-120b` is settled as the production generator (§1), so this is one baseline,
not a sweep. Capture the **real completion-token mean** while you are here: it re-baselines the cost
model (the 20b/120b comparison inverts at ~697 tokens, §4) and it is an input to the `max_tokens`
lever, which is the cheapest remaining generation knob.

> ### → STOP. This is the most important handback in the plan. Give the user:
>
> 1. **Correctness and ungrounded rate on gold context, against the 1.30 and 2% bars.** State
>    plainly which of three worlds you are in:
>    - **Clears both** — generation is fine, and every remaining problem is retrieval. Proceed to
>      Phase 4 with a real ceiling to measure against.
>    - **Clears neither** — retrieval cannot help, and the levers are prompt, `max_tokens`, model.
>      Two are already spent. Say so directly; that is a finding worth more than a workaround.
>    - **In between** — quantify the gap and name which lever you would pull, with a cost.
> 2. **The 20b → 120b delta on the same fixtures**, if a 20b baseline is cheap to run. This is the
>    first real evidence on whether the model upgrade fixes groundedness on its own, and it costs
>    one extra capture. **Dropped 2026-09-15** (§4a).
> 3. **The measured completion mean**, and what it does to the §4 cost table.
> 4. **All five wave-1 exit criteria from §2, checked and reported.** Recommend wave 2 or a fix,
>    and say which.
>
> Costs money — a capture plus a judge pass. **Get approval before running it.**

### Phase 4 — Retrieval, measured against that ceiling

Only now. The question becomes: **how close to gold-context quality does each real retrieval arm
get?** That is a clean, answerable question, and it is the one the previous bake-off could not ask.

Note that the previous retrieval conclusions are **not** inherited. `firestore-direct` won on
evidence from a placeholder model, a confounded generator and a fixture mix that was 90%
slice-answerable. Treat every arm as unranked at the start of this phase.

> ### → STOP. Hand back to the user with:
>
> 1. **Each arm's gap from the gold-context ceiling**, per class. This is the retrieval result,
>    stated the way it should have been stated the first time.
> 2. **A recommendation with its reversal condition** — what would have to be true for this to be
>    the wrong call. The previous decision lacked this and it is why it did not survive scrutiny.
> 3. **Whether the ◆G7 retrieval decision should be re-opened and re-closed** on this evidence,
>    and the `timeline.md` entry that would record it.
> 4. **A git plan** for the results, and a proposal for folding this file into a permanent
>    `docs/EVALUATION.md` — the Phase 2 doc consolidation that was deliberately deferred until the
>    method existed.

---

## 6. Traps — every one of these cost real time

**Carried forward, still live:**

- **The 20.2% recall floor.** `stub` scores 20.2% while retrieving nothing that exists in the
  corpus, because 20 of 99 labelled queries are `noRelevantChunks` and correctly retrieving nothing
  scores 1. **Report recall on answerable turns as the headline** and keep no-answer turns as a
  separate refusal-precision metric — that kills this confusion permanently instead of documenting
  around it.
- **Unicode breaks exact matching.** The model emits U+2011 where `REFUSAL_SENTENCE` has U+002D, and
  NFKC folds U+2011 to U+2010, **not** to U+002D. Use `normalizeForMatch` in
  `src/eval/gates/normalize.ts` for any string comparison.
- **Grounding is wider than the retrieval context.** The question may supply figures, tool results
  carry readings and pod limits, and until 2026-09-13 the system prompt carried operator ranges. A transcript's `context` field is retrieval context ONLY.
  Treating it as the whole grounding produced ~24 false "fabricated figure" findings per arm.
- **`SENSOR_TOOL=false` must be set on BOTH the server AND the runner.** Server-only yields the
  wrong fixture count and junk answers.
- **Re-chunking invalidates every label.** Chunk ids are content-derived.
- **`npm run grade:packet` re-labels every answer when the arm set changes.** Use `--out=<dir>`,
  never `--force`. It destroyed 36 completed grading rows once.
- **A grading packet is pinned to its transcripts.** Re-capturing an arm silently invalidates every
  human row for it. This once **inverted the sign of a published result** — a fix looked like a
  regression (κ 0.87→0.83) when scored over stale rows, and was an improvement (0.81→**0.94**) over
  comparable ones. `--calibrate` now detects and excludes outgrown rows.
- **The calibration subset was optimistic.** A subset calibrates the judge; it does not produce a
  result.
- **`Date.now()` is not a clock for elapsed time.** Civil time; the OS steps it backwards. Fixed to
  `performance.now()` in `src/eval/transport.ts`, **not retroactively** — old transcripts remain
  unusable for latency.
- **`npm run typecheck` covers only `src/**`.** `scripts/` and `test/` are not typechecked; exercise
  them by running them.
- **The judge's list-producing dimensions do not reproduce.** Never rest an argument on per-arm
  *differences* in the groundedness column.
- **Adding a rule to a judge prompt is not free where it does not apply.** An unconditional refusal
  rule changed verdicts on unrelated turns.
- **`npm run cost` holds completion length constant by design.** Use `--completion=measured` to
  reproduce published figures.

**New, from the rebuild design:**

- **Chunk-derived questions are contaminated** (Phase 1c). This is the single easiest way to build
  an eval that reports excellent numbers and measures nothing.
- **A judge call is input-dominated.** ~420K prompt against ~42K completion over 83 calls.
- **Cache hit rate does not carry across models.** 99.0% is a measurement of 20b, not a property of
  the prompt.
- **The 120b/20b cost comparison inverts at ~697 completion tokens.**

---

## 7. Commands

```
npm run gate:check                      # Tier 1. Free, deterministic, seconds. Run constantly.
npm run retrieval:eval                  # offline retrieval diagnostics, ~10s, free
npm run cost                            # sweep completion length across arms
npm run cost -- --model=<id> --completion=measured
npm run judge -- --dry-run              # what a pass would cost, without spending
npm run judge -- --run=<id> --final     # reported numbers: default reasoning (see "Judge cost")
npm run judge -- --calibrate            # judge-vs-human agreement, no API calls
npm run judge -- --report               # summarize the ledger, no API calls
npm run ingest                          # documents/ -> data/corpus/corpus.json
npm run embed:cache                     # incremental
```

**Three of those throw right now, by design** — the archive emptied what they read, and each
refills at a named phase. A clear "nothing captured yet" error is the correct output; the
alternative was `gate:check` grading `gpt-oss-20b` transcripts and printing a PASS/FAIL that
means nothing for the new set.

| command | state as of 2026-09-02 | refilled by |
|---|---|---|
| `npm run gate:check` | `No transcripts at .../eval/transcripts/warm.` | Phase 3, done 2026-09-14 (`warm/gold-context/`) |
| `npm run judge -- --calibrate` | same message — it builds the task list before reading grades | Phase 3, then 2c (2c still open) |
| `npm run retrieval:eval` | `No retrieval labels at .../eval/retrieval-labels.` | Phase 1e, labels regenerated (45 files) |

`npm run cost`, `npm run ingest` and `npm run embed:cache` are unaffected.

**Capturing an arm** (measured 2026-09-23: about $0.07-0.08 per 90-turn arm, plus about $0.65-0.72 to judge it). Name every new capture with `--run=<id>` on `bakeoff`, `gate:check` and `judge`: it writes to `eval/transcripts/<id>/` and `data/results/judge/<id>/`, keeping the old transcripts verbatim and the judge from reusing verdicts keyed only by arm, fixture, turn and dimension; `bakeoff` refuses to overwrite an existing transcript. The user often runs a server on port 8000 with different env —
**use another port, do not kill it.**

```
PORT=8010 SENSOR_TOOL=false REPORT_TOOL=false DEBUG_RETRIEVAL=true \
  CORPUS_SOURCE=firestore DEFAULT_RETRIEVAL=firestore-direct LLM_MAX_TOKENS=16384 \
  npx ts-node src/index.ts

SENSOR_TOOL=false REPORT_TOOL=false DEBUG_RETRIEVAL=true CORPUS_SOURCE=firestore \
  npm run bakeoff -- --arm=<arm> --pass=warm --base-url=http://localhost:8010/api/v1 --spot-check
```

`--spot-check` first, always. An adapter returning empty context produces a clean-looking and
completely meaningless dataset.
On `gold-context` the spot check asks three labelled turns (deep-in-manual, cross-document, probe-calibration) instead of the fixed probes, which that arm has no labels for.

`CORPUS_SOURCE=firestore` reads project `cer-demo-2026`.
It was reseeded 2026-09-15 with `npm run seed:firestore -- --prune` and `npm run seed:firestore-chunks -- --prune`: 14 documents, 446 chunks, no removed document left.
A plain seed only overwrites, so after any corpus change re-run both with `--prune`, or the removed document stays in the direct-feed slice.
The 2026-09-21 re-OCR changed the EPA SOP's text and all 12 of its chunk ids after that seed, so both collections are stale for that document until they are re-seeded.

---

## 8. House rules — these bind, see `CLAUDE.md`

- **Git mutations need a plan the user approved in chat** (`git-plan` skill); read-only git is free.
- **Never run the full test suite.** Target specific suites and say which you ran.
- `npm run typecheck` and `npm run lint` are cheap and read-only; `npm run lint:fix` writes files.
- **Pass both rules to any agent you dispatch.**
- Eval work writes only inside this repository. `../user-dashboard` and `../clean-earth-rovers-server` are writable only on branch `local`, for the Gilligan work (`CLAUDE.md`).
- **Ask before spending.** Captures and judge passes cost real money.

---

## 9. Repo state (2026-09-02)

- Branch `dev`, level with `origin/dev`. Working tree clean.
- Corpus: **15 documents, 851,891 chars, 451 chunks** (re-ingested 2026-08-31 without the
  alpha-ratio filter; was 393). ◆G9 slice is 37,660 chars (4.4%). **(Superseded 2026-09-13:** now
  14 documents, 840,327 chars, 446 chunks; ◆G9 slice is the 4 remaining probe datasheets, 26,096
  chars, 3.1% — the source-of-truth document was removed, see `timeline.md` "Eval rebuild".)
- Fixture set: **46 fixtures / 92 turns** in `eval/fixtures-wave1/`, seven classes, all runnable
  (no fixture declares a `requires`). Slice coverage 41 none / 5 partial / 0 full. **(Superseded
  2026-09-13:** now 45 fixtures / 90 turns — the `precedence` class was rewritten to 3 fixtures.)
- Tags: `docs-archive-2026-08-30` (six archived docs), **`eval-archive-2026-09-01`** (the whole
  pre-rebuild eval set, 556 files), `wip-merge-chain-fanout-2026-08-31`,
  `wip-restore-pgvector-2026-08-31` (an arm the project has decided against — §1, do not pursue).
- Full test suite: **46 suites / 949 tests, green, zero skipped** (2026-09-02).

### Phase status

| phase | state |
|---|---|
| 0 — lock the slate | ✅ complete 2026-09-01 |
| 1a — claim inventory | ✅ 2,250 claims, 1,685 high-specificity, 168 gaps, 451/451 chunks |
| 1b — question generation | ✅ 46 fixtures / 92 turns (superseded 2026-09-13: now 45 / 90) |
| 1c — decontaminate | ✅ 22.8% document-level, 11.6% chunk-level, against the < 40% bar — **exit criterion 1 passes**. `eval/fixtures-wave1/_CONTAMINATION.md` |
| 1d — human verification | ✅ **closed by user decision 2026-09-23, without human verification** - the agent-corrected set was accepted in its place and frozen at 45 / 90; see "Phase 1d decision and fixture freeze" below |
| 1e — labels + hard negatives | 🟡 partial — `eval/retrieval-labels/` regenerated (**45 files**, `scripts/resolveRetrievalLabels.ts`), but provisional: flat grade 2, no hard negatives, per-fixture not per-turn. Adequate for the gold-context arm, which resolves every label at 100% offline; the remainder blocks Phase 4, not Phase 3 |
| 2a — quote-based citations | 🟡 **demonstrated, not measured, 2026-09-13** — the prompt asks for `【n†"quote"】`, `formatContext` labels excerpts `【n】`, and `QUOTE_CITATION_PATTERN` accepts a non-dagger separator. A same-day smoke capture ($0.0075, `gpt-oss-120b`, gold-context arm, three runs) showed the closing-bracket and quote rules produce a non-zero quoted-citation rate (10/10 markers closed correctly across two runs; 4/4 citations quoted in one answer, 1 supported and 3 too short) — a smoke check, not the Phase 2 STOP block's measured rate |
| 2b — repoint the judge | ✅ done 2026-09-02 |
| 2c — re-calibrate | ⬜ needs captured answers to grade — see the sequencing note below |
| 3 — generation baseline | 🟡 **re-captured 2026-09-23 on the frozen set** (run `p3-2026-09-23`, below): gold context 1.01 correctness and 47.8% ungrounded, `hybrid-slice-vector` 0.52 and 59.6%, Tier 1 failing on both; iteration 1 (four prompt rules, `DEFAULT_TOP_K` 10) is committed at `22d6dd0` and not yet measured. The 2026-09-14 capture predates the corrections and two prompt edits, and no longer counts |
| 4 — retrieval | ⬜ |

**Sequencing — SETTLED 2026-09-09: Phase 3 runs before 2c.** 2c grades 30 stratified rows, and
grading needs captured answers that only Phase 3 produces. One capture (~$0.02–0.05) therefore
serves both the generation baseline and the calibration rows. The numbering is inverted and stays
that way; read the phases in the order 0, 1, 2a, 2b, **3, 2c**, 4.

### Known blocker — the refusal gate reads zero on this set (resolved by `a72c3b5`)

**Resolved by `a72c3b5`** ("Detect refusal-required turns from a fixture flag, not rubric prose"):
the regex below was deleted with no fallback and replaced by a per-turn `requires_refusal` flag on
the fixtures; `refusalMap()` still throws if a refusal-class fixture has no flagged turn. Five turns
are flagged across three fixtures. The rest of this section is kept as the record of what the
blocker was.

`gates/runner.ts` decides "this turn must refuse" by regex-matching rubric prose for
`\brefus(e|es|al|ing)\b`. The archived set wrote *"refuses to answer"*; wave 1 writes
*"Declines to…"* and *"States that no source here gives…"*, so the pattern matches **0 of wave 1's
8 refusal turns** where it matched 3 of the archived set's 6.

Left unguarded, `gate:check` would report `required: 0, met: true` at Phase 3 — a clean pass on an
absolute pre-registered gate that measured nothing. `refusalMap()` therefore **throws** when
refusal-class fixtures load and no turn is detected.

Widening the pattern is not the fix: adding `declines` catches only 3 of 8 and picks up two false
positives in the archived set. **The fix is a per-turn `requires_refusal` boolean on the fixture**,
which the bake-off's fixture rules previously ruled out because the fixtures were a pinned control while
◆G7 was open — a reason that no longer exists. This had blocked Phase 3.


### Wave 1 correction handoff - 2026-09-22

The completed historical review at `c41ffb5` is agent verification, not Phase 1d human sign-off.
Implemented corrections are on `eval/wave1-corrections` in `.claude/worktrees/wave1-corrections`, pending commit/push approval and later integration with `dev`.
Read `eval/reviews/wave1-corrections-2026-09-22/README.md` and `HANDOFF.md` on that branch for the source checks, correction rationale, limitations and reproduction commands.
The correction set has 45 fixtures, 90 turns and 738 conditions: all 34 EDIT fixtures plus the buffering-capacity KEEP fixture were changed, including 13 question turns.
It includes the two verified EPA claim files from `5d269a3`, regenerated labels, explicit per-turn refusal evidence and the partial-answer/threshold-policy corrections.
The eight refusal turns carry positive explanatory context and explicit refusal flags; this supersedes the five-flag state recorded above only once the correction branch lands.
All 446 claim chunk IDs resolve on that branch, with the known chart-header quote exception still awaiting a decision and excluded from affected fixture label inputs.
Validation passed: 181 tests across six individually run Jest suites, typecheck, lint, the generator failure checks and the offline correction audit.
Contamination is 9/82 (10.98%) by notes-derived source chunks, 9/90 (10.00%) by current labelled chunks, and 26/90 (28.89%) by source document.
Historical review hashes, corpus and captured transcripts are preserved; the old checker deliberately fails against the changed prompt, while the new audit records the corrected inputs separately.
No paid captures or live reads ran in this correction work.
At handoff, `dev` is `eaba51c` and includes later Gilligan and recovered catalogue changes that overlap the correction branch's prompt and prompt tests.
The proposed push preserves the correction branch separately; merged behavior has not been tested, and integration must retain greetings, `list_pods` routing and catalogue behavior before rerunning focused checks.
Human verification/freeze, judge calibration, broader label refinement and the chart-header decision remain open.

### Phase 1d decision and fixture freeze - 2026-09-23

**User decision, 2026-09-23: Phase 1d is closed without human verification.**
No human has verified any fixture, label or rubric in the wave 1 set.
The user accepted the Codex correction work (the 2026-09-21 agent review, the 35 corrected fixtures, the 45 regenerated labels and the refusal/context contract fixes) in place of the manual pass, because there is neither the time nor the domain expertise for one before the release.
Every score measured on this set therefore rests on agent-authored and agent-reviewed ground truth; report it that way, and do not describe any result as human-validated.
Do not ask the user to verify fixtures.

The correction work landed on `eval/wave1-corrections` as `ec58b05` and was merged with `dev` (`9c783cd`) as `9cf91fe`.
The merge reconciled `src/prompt/systemPrompt.ts`: the refusal keeps the closest-supported-alternative sentence, followed by the corrections' partial-answer rule, and the greeting carve-out, `list_pods` routing and catalogue block are unchanged.
Checks after the merge: 8 Jest suites run individually (prompt, evalFixtures, gateCheck, getPodThresholds, goldContext, judge, listPods, catalogue; 230 tests), typecheck, lint, the label generator (no output change), `scripts/verifyWave1LabelFailures.py` and `scripts/verifyWave1Corrections.ts`.

**The fixture set is frozen at 45 fixtures / 90 turns, 8 of them flagged `requires_refusal`.**
Fingerprint, as `sha256sum *.json | sha256sum` run inside each directory:

| directory | files | fingerprint |
|---|---|---|
| `eval/fixtures-wave1/` | 45 | `b0b647f4ba6a54a3f812a508ef5f450f6d1e43e183858cf6d203ee2a8ea1f148` |
| `eval/retrieval-labels/` | 45 | `fa76d62647aad389b1bcdcd1c03710e5f4a0c8ce1297a3d798ae25485f5f09de` |

Fixture text does not change after this point.
A change to a fixture after a capture voids every capture made on the old text, and needs its own recorded decision here.
Labels may still be regenerated by `scripts/resolveRetrievalLabels.ts` for Phase 1e; a changed label fingerprint must be recorded with the capture it applies to.
Still open and not closed by this decision: judge calibration (2c, exit criterion 2), per-turn label splits and hard negatives (1e), and the `epa-oxygen-solubility-chart-01` chart-header quote exception.
The quote exception was closed on 2026-09-23: the claim moved to chunk index 10 with its quote refreshed to that chunk's OCR; no fixture names it, so the label fingerprint above is unchanged (`eval/claims/_STATUS.md`).
On 2026-09-24 `dev` (its EPA SOP re-resolve, label regeneration and the approved catalogue) was merged into `eval/wave1-corrections`, keeping the corrected fixtures, and `eval/retrieval-labels/` was regenerated with `scripts/resolveRetrievalLabels.ts`.
Both fingerprints above are unchanged: the 45 regenerated label files are byte-identical, none is stale, all 479 label chunk references resolve, and all 2177 claim quotes are verbatim in their chunks.
R4's final capture applies to these fingerprints; the harness keeps `CATALOGUE_PROMPT` off, so the catalogue approval does not change it.

### Phase 3 baseline - 2026-09-23, run `p3-2026-09-23`

Captured at `e74a4b3` on the frozen 45 / 90 set: `gpt-oss-120b`, temperature 0, `LLM_MAX_TOKENS=16384`, `CORPUS_SOURCE=artifact`, with `SENSOR_TOOL`, `REPORT_TOOL` and `CATALOGUE_PROMPT` set `false` on server and runner.
Transcripts are in `eval/transcripts/p3-2026-09-23/`, gate results in `data/results/gate-check/p3-2026-09-23/`, and verdicts in `data/results/judge/p3-2026-09-23/`, apart from the 2026-09-14 capture and its ledger.
The judge (`deepseek-v4-flash-0731`) is still uncalibrated (2c), and the fixtures are not human-verified, so every number below is provisional.

| arm | refusal | citations | fabricated | quotes supported | correctness | ungrounded turns |
|---|---|---|---|---|---|---|
| `gold-context` | FAIL, 3 of 8 answered | 95.1% | FAIL, 3 | 77.3% | **1.01** | **47.8%** (43/90) |
| `hybrid-slice-vector`, k=5 | FAIL, 2 of 8 answered, 1 off-contract | 97.5% | FAIL, 1 | 68.3% | **0.52** | **59.6%** (53/89) |

Per class on gold context: cross-document 0.92 and refusal 0.75 fail the 1.00 floor; deep-in-manual 1.10, definitional 1.00, follow-up 1.13, precedence 1.00 and probe-calibration 1.13 pass.
On `hybrid-slice-vector` every class fails, from 0.38 (cross-document, definitional) to 0.75 (refusal).

**Gold context clears neither bar**, so part of the gap is generation and no retrieval arm can close it alone.
The gold-context failures group into four causes, each with a prompt rule landed after this capture:

- Citation numbers taken from numbered steps inside an excerpt (`【10†…】` with 5 excerpts supplied); about half of the unsupported quotes are verbatim in a different excerpt than the one cited.
- Partial refusals that answer the supported part and never state the refusal (3 of 8 refusal turns).
- Unsupported elaboration: reasons, mechanisms, consequences and troubleshooting steps from general knowledge, which is most of the 112 ungrounded claims; some of the rest is judge strictness (adjectives, `±` against OCR's `+`), unmeasured until 2c.
- Misread tables: a wrong pressure row (9.03 against 8.97 mg/L), a table's range misstated, the wrong EPA rounding increment, and an invented 95-102% slope window.

**Retrieval halves correctness.** The default arm returned 16% of labelled chunks and no labelled chunk at all on 54% of turns; offline `retrieval:eval` agrees (18.4% at k=5).
Every production request used `DEFAULT_TOP_K=5` while labels average 5.4 chunks per turn, and every arm scores alike at equal depth (17-19% at k=5), so depth is the first lever: recall is 29.0% at k=10, 35.2% at k=15 and 39.5% at k=20 on `hybrid-slice-vector`.
The labels are still fixture-wide rather than per turn (1e), which overstates misses somewhat, but not enough to explain a 0.49 correctness gap.

Measured completion mean: 589 tokens on gold context, 619 on `hybrid-slice-vector`; both are under the ~697-token 20b/120b crossover in §4.
Spend: captures about $0.07 and $0.08, judge passes $0.645 and $0.719, three spot checks about $0.01, about $1.53 in total.

### R4 iteration 1 - 2026-09-23, run `p3-it1-2026-09-23`

Captured at `22d6dd0` (four prompt rules, `DEFAULT_TOP_K` 10) with the baseline's settings; transcripts in `eval/transcripts/p3-it1-2026-09-23/`, gate and judge results under `data/results/*/p3-it1-2026-09-23/`.
Nine judge calls first failed with "no JSON object" and were filled by a second `judge` pass.

| arm | refusal | citations | fabricated | quotes supported | correctness | ungrounded turns |
|---|---|---|---|---|---|---|
| `gold-context` | FAIL, 2 of 8 answered | 90.5% | FAIL, 2 | 71.7% | **1.01** (was 1.01) | **54.4%** (49/90, was 47.8%) |
| `hybrid-slice-vector`, k=10 | FAIL, 1 answered, 2 off-contract | 100% | FAIL, 2 | 67.3% | **0.51** (was 0.52) | **57.8%** (52/90, was 59.6%) |

Per class on gold context: cross-document 0.92, deep-in-manual 1.20, definitional 1.00, follow-up 1.00, precedence 1.17, probe-calibration 1.00, refusal 0.75.
On `hybrid-slice-vector`: cross-document 0.46, deep-in-manual 0.60, definitional 0.50, follow-up 0.50, precedence 0.50, probe-calibration 0.56, refusal 0.38.

**The prompt rules did not move correctness, and the citation-number rule made citations worse.**
Gold-context out-of-range markers rose from 10 to 16 (e.g. 【10】, 【14】, 【16】 with 5 excerpts supplied).
The numbers are not step or table numbers from the excerpt text: the quotes behind them are verbatim in excerpts 3-5, so the model is inventing marker numbers, not misreading labels, and a prompt rule does not reach that.
Refusals improved in form (6 of 8 exact after hyphen folding, none off-contract) but two turns still state a figure.

**Depth doubled recall without moving correctness.**
Measured from the captured context against fixture-wide labels, `hybrid-slice-vector` recall rose from 11.6% to 20.3% and zero-hit turns fell from 49 to 32 of 90, at 13.5 chunks per turn against 8.7.
Correctness stayed at 0.51 because scores fell within each retrieval bucket while turns moved up between them:

| turns by share of labelled chunks retrieved | baseline, k=5 | iteration 1, k=10 |
|---|---|---|
| none | 49 turns, 0.35 | 32 turns, 0.19 |
| under half | 29 turns, 0.66 | 39 turns, 0.56 |
| half or more | 12 turns, 0.92 | 19 turns, 0.95 |

Retrieval still decides the score: a turn with half its labels scores like gold context, and one with none scores near zero.
The within-bucket drop is the prompt: answers got shorter (well-retrieved turns 1,923 to 774 characters), ungrounded claims fell from 180 to 140, and refusal wording appeared on more turns.
On gold context, refusal wording on non-refusal fixtures rose from 3 turns to 6; two of them score 0 on questions the supplied excerpts answer (`deepmanual-turbidity-rounding` turn 2, `definitional-eh-versus-the-millivolts-we-log` turn 1), which was read as the partial-refusal rule over-refusing. **That reading was wrong:** both turns also score 0 in the baseline, before the rule existed (see iteration 2).

**Judge variance, run `p3-it1-rejudge-2026-09-23`:** the same gold-context answers judged a second time (the run directory is a symlink to `p3-it1-2026-09-23`, so the transcripts are the same files).
Correctness 1.01 then 0.98, with 7 of 90 turns scored differently; ungrounded turns 49 then 57 of 90 (54% then 63%), with 16 turns flagged differently.
So a correctness change under about 0.05 is noise, the baseline-to-iteration-1 rise in ungrounded turns is noise, and the ungrounded rate cannot be read to better than about ±9 points per run with this judge; the 2% ceiling is not measurable with it.
Cost $0.561, about $3.71 in total.

### R4 iteration 2 - prompt

Two changes, both reversing iteration 1 effects:

- The excerpt-number sentence is dropped: out-of-range markers rose with it. Correcting marker numbers from the quote's location is left to the citation-validation work (Task C), because a prompt rule does not reach invented numbers.
- The partial-refusal rule now tells the model to check every excerpt before refusing, and counts a value derived by applying an excerpt's rule, table or formula to the user's numbers as supported; the refusal is still required for a specific value no excerpt gives or yields.

Spend: captures and spot check about $0.16, judge $1.463, about $1.62 for the run and about $3.15 in total.

### R4 iteration 2 - 2026-09-24, run `p3-it2-2026-09-24`, gold context only

Captured at `e2a0761` with the baseline's settings; one judge call failed and was left unfilled (89 of 90 ungrounded rows).

| run | refusal | citations | fabricated | quotes supported | correctness | ungrounded turns |
|---|---|---|---|---|---|---|
| baseline `p3-2026-09-23` | 3 of 8 answered | 95.1% | 3 | 77.3% | 1.01 | 47.8% |
| iteration 1, judged twice | 2 of 8 answered | 90.5% | 2 | 71.7% | 1.01 / 0.98 | 54.4% / 63.3% |
| iteration 2 | 3 of 8 answered | 91.2% | 3 | 72.9% | **0.92** | 60.7% (54/89) |

Per class: cross-document 0.79, deep-in-manual 1.05, definitional 1.00, follow-up 1.00, precedence 0.83, probe-calibration 1.06, refusal 0.62.

**Iteration 2 is worse and is to be reverted to the iteration 1 prompt.**
Seven turns scored below both iteration 1 judgements and one above.
The two target turns did not move: they score 0 in all four judgements, baseline included.
The new "applying a rule, table or formula to the user's numbers" wording is the likely cause of two of the losses: `precedence-turbidity-groundwater-background-not-pod-limit` turn 1 judged the user's 12 NTU against an excerpt's background range, which the precedence rule forbids, and `refusal-how-long-can-it-stay-in` answered both turns with derived durations instead of refusing.
Dropping the excerpt-number sentence did not restore citation validity (91.2% against 90.5%), so that sentence was not what lowered it; the out-of-range marker numbers are left to Task C's citation validation.

**Prompt iteration has reached the noise floor on gold context.**
Across three prompt versions correctness stays within 0.92-1.01 while one judge alone moves 0.03 between passes, and generation variance (a recapture of the same prompt) is still unmeasured.
The measured lever left is retrieval: on `hybrid-slice-vector` a turn with half its labels retrieved scores 0.95, like gold context, and one with none scores 0.19.

Spend: capture and spot check about $0.08, judge $0.552, about $4.34 in total.

### Judge strictness audit - 2026-09-24, agent audit of run `p3-it1-2026-09-23`

All 117 ungrounded claims the judge flagged on gold context were read against the supplied excerpts by the agent; no human reviewed them.
About 6 verdicts are wrong or over-strict, about 5 are borderline general knowledge, and the rest (about 90%) are real: added reasons, consequences, troubleshooting steps and record-keeping items no excerpt gives, strengthened modals ("should" to "must"), and misread tables.
So judge strictness does not explain the ungrounded rate; the model's elaboration does.

Over-strict verdicts, each checked against the excerpt text:

| fixture, turn | flagged claim | excerpt | why the verdict is too strict |
|---|---|---|---|
| `probecal-orp-standard-check` 2 | "Check the reference-solution level and refill if low" | "Check the level of the filling solution and replenish to the bottom of the fill hole." | stated nearly verbatim |
| `deepmanual-cross-section-points` 1 | "you must 'divide the stream into a minimum of four increments'" | "Divide the stream into a minimum of four increments." | an imperative instruction read as not supporting "must" |
| `crossdoc-temp-sensor-drift-blast-radius` 2 | "before any measurements are taken" | "needs to be checked at the beginning of the sampling event" | paraphrase with the same meaning |
| `crossdoc-sonde-sensor-order` 2 | "so that the water passes the conductivity cell first and then the pH cell" | the pH sensor is installed downstream from the conductivity sensor | restates what downstream means |
| `crossdoc-conductivity-rise-with-warming` 2 | "Confirm the deviation is within the ±0.2 °C limit" | accuracy "required to be less than or equal to ±0.2°C" | applies a stated requirement as a check step |
| `crossdoc-bailed-orp-jumping` 2 | "the ORP (Eh) reading will not be 'real' until the sensor has come to thermal equilibrium" | allow the sensors to reach thermal equilibrium and the reading to stabilize before recording | paraphrase of the instruction's purpose |

Borderline, general knowledge the rule nonetheless forbids: NTU expanded as "nephelometric turbidity units", "the 500 µS/cm KCl standard", "brackish water has measurable conductivity", "typical atmospheric pressure (≈760 mm Hg)".
Correctly flagged although it looks harsh: "five points between 0 °C and the maximum expected temperature" - the excerpt is cut at "between 0°C", so the upper bound is the model's.
The baseline's recorded strictness examples (adjectives, `±` against OCR `+`) are of the same kind and similarly rare.

### Retrieval depth sweep - 2026-09-24, offline

`npm run retrieval:eval -- --arm=hybrid-slice-vector --k=N` on the frozen 90 queries (fixture-wide labels, 5.4 per turn on average); query embeddings only, well under $0.01.

| k | recall | nDCG | gain per +5 |
|---|---|---|---|
| 10 | 29.0% | 0.117 | - |
| 15 | 35.2% | 0.140 | +6.2 |
| 20 | 39.5% | 0.154 | +4.3 |
| 25 | 42.5% | 0.165 | +3.0 |
| 30 | 46.5% | 0.179 | +4.0 |
| 40 | 51.0% | 0.193 | +2.3 |

Recall has no knee up to 40; ranking is weak (MRR 0.077 at k=20), so depth is compensating for ordering.
A chunk is about 800 prompt tokens, about $0.00012 uncached on `gpt-oss-120b`, so k=30 costs about $0.0024 more per request than k=10.
Choose k on answer correctness, not recall: capture k=20 and k=30 on `hybrid-slice-vector` and stop where correctness gains less than the 0.05 noise band.

### Retrieval depth captures - 2026-09-24, runs `p3-k20-2026-09-23` and `p3-k30-2026-09-24`

`hybrid-slice-vector` captured at k=20 (`9abc8a8`) and k=30 (`fb7314d`) on the frozen 45 / 90 set, with iteration 1's prompt and the same settings as the baseline; k=10 is iteration 1's run `p3-it1-2026-09-23`.
Both captures predate the `dev` merge that brought Task A's turbidity prompt wording, so they do not reflect it.
The judge is still uncalibrated and the fixtures are not human-verified, so every number is provisional.
Recall here is the share of each turn's labelled chunks that were retrieved.

| | k=10 | k=20 | k=30 |
|---|---|---|---|
| correctness | 0.51 | **0.60** | 0.52 |
| recall | 25.9% | 36.6% | 43.3% |
| turns with no labelled chunk retrieved | 32 | 21 | 16 |
| correctness on turns with half or more of their labels retrieved | 0.95 (19 turns) | 0.80 (30) | 0.73 (37) |
| refusal wording on non-refusal turns (of which scored 0) | 21 (17) | 17 (9) | 29 (21) |
| ungrounded turns / claims | 57.8% / 140 | 62.2% / 188 | 62.2% / 173 |
| refusal gate | FAIL | FAIL | PASS (0 answered) |
| fabricated figures | 2 | 2 | 0 |
| quotes supported | 67.3% | 64.0% | 52.1% |
| prompt tokens per turn | 13.9K | 19.2K | 24.5K |

**k=20 is the default.** From k=20 to k=30 correctness fell 0.08, more than the 0.05 noise band, with 16 turns falling and 10 rising; follow-up (0.63 to 0.25) and precedence (0.83 to 0.50) fell most, and refusal was the only class to gain.
More depth makes the model refuse more: recall keeps rising, but the model declines questions the excerpts answer, and scores fall even on well-retrieved turns.
The gates k=30 passes (refusal, fabricated figures) come from refusing more often, not from better answers.
The next retrieval lever is order, not depth: the labelled chunks are retrieved but ranked low, so a reranker or dropping the always-on operator slice can be measured offline for almost nothing.
The ungrounded rate is flat at about 60% at every depth, so it comes from the model elaborating rather than from retrieval; calibrate the judge before trusting that number.

`p3-k30-2026-09-24` has 180 of 180 verdicts: three calls failed on the first pass and were refilled, one of them after the `dev` merge had started; that row is an `ungrounded` verdict on a tools-off turn, whose prompt the merge leaves byte-identical.
Spend: k=20 $1.37 (capture $0.20, judge $1.18), k=30 $1.73 (capture $0.27, judge $1.46); R4 total about $7.44 of the $20 ceiling the user set on 2026-09-24.

### Calibration packet (2c) - 2026-09-24, run `p3-calib-2026-09-24`

The user chose on 2026-09-24 to grade 32 rows on correctness and ungrounded claims: 8 conversations, both turns, gold-context and retrieval answers side by side.
`p3-calib-2026-09-24` is a composite run of two symlinked arm directories, so the transcripts stay verbatim where they were captured: `gold-context` from `p3-it1-2026-09-23` and `hybrid-slice-vector` from `p3-k20-2026-09-23`, both on the iteration 1 prompt, with retrieval at the settled k=20.
`npm run grade:packet -- --run=<id>` reads `eval/transcripts/<id>/` and writes `eval/grading/<id>/`; `npm run judge -- --run=<id> --calibration` and `--calibrate` read that sheet and the run's transcripts.

The 8 fixtures are one per class, plus a second from `cross-document`, the weakest class.
Within a class, the pick favoured fixtures where the two arms' existing verdicts differ, so both arms span correctness 0 to 2 and ungrounded counts from 0 to 5.
Fixtures whose labels `dev`'s EPA re-resolve touched were excluded.
Chosen: `crossdoc-how-steady-before-i-write-it-down`, `crossdoc-soft-water-ph-wont-settle`, `deepmanual-brackish-do-correction`, `definitional-eh-versus-the-millivolts-we-log`, `followup-mixing-the-clarity-bottle`, `precedence-ph-river-range-not-pod-limit`, `probecal-ec-never-recalibrate`, `refusal-how-long-can-it-stay-in`.

Blinding is weak with two arms: each answer's footer gives its chunk count, which separates k=20 retrieval from gold context, and the seeded shuffle put retrieval at label `A` on 6 of 8 sheets.
Both are accepted: the rows calibrate the judge against a human on the same answers, not one arm against the other.
Only `correctness_0_1_2` and `ungrounded_claims` are graded; `invalid_citations` stays blank and yields no pairs.
Once graded, `npm run judge -- --run=p3-calib-2026-09-24 --calibration` judges the 32 rows at `--final` (91 calls with citations, estimated at $0.45 from `p3-k20-2026-09-23`'s measured cost), then `--calibrate` reports kappa against the 0.70 bar.

#### Result - 2026-09-24: correctness kappa 0.56, below the 0.70 bar

The user graded `scores.csv` themselves (`ea380f6`), then reconciled their ungrounded counts with the AI review (`d17ade6`, SHA256 `751e9c78...`); correctness is the user's first grading throughout.
The AI review was amended in the same commit: its reviewer withdrew the strict rule that counted example and calculated numbers as ungrounded (SHA256 now `f58502d2...`, 27 claims across 14 answers).
Because the two sheets now carry identical ungrounded counts, the judge's ungrounded agreement below is agreement with a reconciled human-and-AI reference, not an independent human one.

`--calibration` judged 91/91 calls with 0 failures at `--final`: 1,150,688 prompt tokens (34,463 cached), 169,078 completion tokens, about $0.3574 at the `src/eval/prices.ts` rate.
`--calibrate` matched 32 pairs on each graded dimension, with 0 rows unjudged and none stale.

| Comparison | Correctness exact | Within one | Any/none | Kappa | Ungrounded exact | Any/none | Kappa (counts) |
|---|---|---|---|---|---|---|---|
| Judge vs user (`scores.csv`) | 23/32 | 32/32 | 27/32 | **0.561** | 15/32 | 25/32 | 0.231 |
| Judge vs AI review (secondary) | 28/32 | 32/32 | 28/32 | 0.786 | 15/32 | 25/32 | 0.231 |
| User vs AI review (secondary) | 25/32 | 32/32 | 29/32 | 0.659 | 32/32 | 32/32 | 1.000 |

The judge never differs from the user by two points; its disagreements fall into three patterns.
It misses rules its prompt already states in two rows: it gave 1 to a refusal where an answer was owed (`deepmanual-brackish-do-correction` t1, retrieval) and to an answer calling pH 8.7 "within the normal range of most natural surface waters" against a `must_not` on declaring 8.7 normal (`precedence-ph-river-range-not-pod-limit` t1, retrieval); both references agree with the user on the first, and the AI review scored the second 1 as well.
It scores two appropriate bare refusals 0 where the user and the AI review give 1 for the refusal point (`precedence-ph-river-range-not-pod-limit` t2 and `refusal-how-long-can-it-stay-in` t2).
It withholds full credit for omitted minor qualifiers (a 60-second minimum, "at calibration temperature", NIST traceability, the reason to stay above 200 uS/cm) in four gold-context rows the user scored 2; the AI review agrees with the judge on all four, so these are a strictness question in the rubric reading, not judge errors.
The ninth, `probecal-ec-never-recalibrate` t2 retrieval, is contested: the user applied the "invents an unsupported standard" `must_not` to a suggested 700 uS/cm standard, which that item's own "allows other certified, instrument-compatible values" clause arguably excuses; the judge and the AI review scored 1.

Ungrounded counts agree poorly in both directions.
The judge counts inferential glue as ungrounded where both references count none (for example "the increased conductance should allow the reading to stabilize", or "regardless of conductivity" added to a quoted tolerance), and it counts none where a source rule is misapplied with its own number, as with the turbidity-only 10 percent rule generalized to every parameter.

Correctness kappa misses the 0.70 bar, so the judge is not yet calibrated and E3 stays blocked.
Setting those two rows and the two refusal rows to the user's scores would give 0.76, but that is fitted to this sample and not a measurement.

#### Adjudication and re-judge - 2026-09-25: correctness kappa 0.659 as graded, 0.802 adjudicated

The questions and rubrics predate the answers: rubrics were written 2026-09-01 to 09-13 and last corrected at 13:28 on 09-23 (`ec58b05`, an AI source review with no human verification), and both arms were captured after that (committed 22:07 on 09-23 and 00:43 on 09-24).
Each disputed row was checked against its rubric, the answer and the context the answer was given.

| Row | User | Judge (first pass) | Finding |
|---|---|---|---|
| `crossdoc-how-steady-before-i-write-it-down` t1, gold | 2 | 1 | User right: the judge said 60 seconds was not called a minimum, but the answer quotes "at least 60 seconds (or follow the manufacturer's guidelines)" |
| `precedence-ph-river-range-not-pod-limit` t2, retrieval | 1 | 0 | User right: the answer says the pod's alarm range is not provided and does not adopt 6.5 to 8.5 (2 of 5 points) |
| `refusal-how-long-can-it-stay-in` t2, gold | 1 | 0 | User right: the answer states the documents give no limit on how much of the month is usable (point 1) |
| `deepmanual-brackish-do-correction` t1, retrieval | 0 | 1 | User right: table 6.2-4 with its 50,000 uS/cm column was in the retrieved context, so the refusal was owed an answer |
| `precedence-ph-river-range-not-pod-limit` t1, retrieval | 0 | 1 | User right: "4.0 to 9.5" is A6.4's temperature-compensation range, recast as the normal range of natural surface waters |
| `crossdoc-soft-water-ph-wont-settle` t1, gold | 2 | 1 | Judge right: 4 of 8 required points are absent |
| `probecal-ec-never-recalibrate` t2, retrieval | 0 | 1 | Judge right: the must-not on inventing a standard allows certified, compatible values, and a 700 uS/cm standard is one |
| `crossdoc-soft-water-ph-wont-settle` t2, gold | 2 | 1 | Open: the only gap is "at calibration temperature" |
| `probecal-ec-never-recalibrate` t2, gold | 2 | 1 | Open: the gaps are NIST traceability and the reason to stay above 200 uS/cm |

The correctness prompt was then changed (`49e28ae`): the judge lists each must-contain point as met or unmet, with a quote, before it scores; a refusal where no point asks for a decline scores 0 even with partial content; a correct refusal the rubric asks for scores at least 1 when it makes a point; must-not items apply to wording with the same effect; and a source figure presented as something the source does not say it is counts as invented.
Whether a missing secondary qualifier denies a point was left unchanged; the user has not decided it.

The correctness-only re-judge sent 32 calls at `--final` with 0 failures: 422,798 prompt tokens (9,690 cached) and 44,859 completion tokens, about $0.1206.
It fixed three of the five judge errors above (`deepmanual` t1, `precedence` t1 and t2); the `crossdoc-how-steady` t1 and `refusal` t2 misreadings persist despite the point list.
It moved `definitional-eh-versus-the-millivolts-we-log` t1 gold from 1 to 0: that answer gives the standard-hydrogen-electrode definition and then refuses the question, which the new refusal rule scores 0, as the AI review did and as the user scored the same pattern in `deepmanual` t1; the user scored it 1.

| Reference | Exact | Kappa |
|---|---|---|
| User's grades as submitted | 25/32 | 0.659 |
| Adjudicated: judge's reading on `soft-water` t1, `probecal` t2 retrieval and `definitional` t1 | 28/32 | 0.802 |
| Adjudicated, and the judge's reading of the two open qualifier rows | 30/32 | 0.897 |

As secondary results, the judge agrees with the AI review at 0.895 (30/32) on correctness; ungrounded agreement is unchanged at any/none 25/32, count kappa 0.231, since that prompt did not change.
The prompt was tuned on these 32 rows and re-measured on them, so the gain is an upper estimate; a held-out sample would measure it honestly.
Correctness verdicts from before `49e28ae` are not comparable with later ones, and the ledger re-judges them on the next pass.

#### Final adjudication - 2026-09-25: correctness kappa 0.849, the bar is met

The user asked Claude to rule on the remaining disputed rows rather than re-grade, so the reference is the user's grades with four rows adjudicated by Claude; it is not a purely human sample.
One rule decided every row: a point is met when its operative content is stated, a missing explanation or elaboration does not deny it, a missing condition that changes when a criterion applies does, and refusals follow the written scale as the user applied it to `deepmanual-brackish-do-correction` t1.
Changed in `scores.csv`, each with the user's original grade and the reason in its note: `crossdoc-soft-water-ph-wont-settle` t1 B from 2 to 1 and t2 B from 2 to 1, `definitional-eh-versus-the-millivolts-we-log` t1 B from 1 to 0, and `probecal-ec-never-recalibrate` t2 A from 0 to 1.
Upheld against the judge: `crossdoc-how-steady-before-i-write-it-down` t1 B at 2, `refusal-how-long-can-it-stay-in` t2 B at 1, and `probecal-ec-never-recalibrate` t2 B at 2, where the only gaps are "NIST" for a stated certified standard and the reason for the 200 uS/cm floor.

Against that sheet, `--calibrate` gives correctness exact 29/32, within one 32/32, kappa 0.849, over 32 pairs with none unjudged; no further judge calls were made.
Secondary: the judge agrees with the AI review at 0.895, and the adjudicated sheet agrees with the AI review at 0.848.
Ungrounded is unchanged and weak: any/none 25/32, count kappa 0.231, with the judge counting inferential links the references accept and missing source rules misapplied with their own numbers.

The correctness judge is accepted as calibrated for R4 with two caveats: the prompt was tuned on these rows, and four reference rows are Claude's rulings.
Reported ungrounded rates carry the weak ungrounded agreement as a caveat.

### R4 final capture (E3) - 2026-09-25, runs `p3-final-2026-09-25` and `p3-final-rejudge-2026-09-25`

Captured at `309da6c` on the frozen 45 / 90 set: `gold-context` and `hybrid-slice-vector` at k=20, `gpt-oss-120b` at temperature 0, `LLM_MAX_TOKENS=16384`, `CORPUS_SOURCE=artifact`, with `SENSOR_TOOL`, `REPORT_TOOL` and `CATALOGUE_PROMPT` set `false` and `DEBUG_RETRIEVAL=true` on server and runner; both arms 90/90 turns with 0 failed, after a spot check of each.
The prompt is iteration 1's plus Task A's turbidity wording, the first capture to include it.
`dev` was not merged again: its commits since the last merge change only tools-on prompt blocks and tool code, and its tools-off message list is byte-identical to the merge base's, so the capture is what a merge would have produced.
Both passes were judged at `--final` with the calibrated correctness prompt (`49e28ae`); the second pass is a symlink run over the same transcripts.
Correctness here is therefore not strictly comparable with earlier runs, which were judged on the previous correctness prompt.
The fixtures are not human-verified, so every number rests on agent-authored ground truth.

| | gold-context pass 1 | pass 2 | hybrid-slice-vector pass 1 | pass 2 |
|---|---|---|---|---|
| correctness (floor 1.30) | 1.01 | 1.01 | 0.58 | 0.59 |
| cross-document | 0.83 | 0.83 | 0.50 | 0.46 |
| deep-in-manual | 1.20 | 1.25 | 0.55 | 0.60 |
| definitional | 1.00 | 1.00 | 0.63 | 0.63 |
| follow-up | 1.13 | 1.13 | 0.63 | 0.63 |
| precedence | 1.17 | 1.00 | 1.00 | 0.83 |
| probe-calibration | 1.00 | 1.00 | 0.56 | 0.69 |
| refusal | 0.88 | 0.88 | 0.50 | 0.50 |
| ungrounded turns (ceiling 2%) | 51.1% (98 claims) | 48.9% (88) | 58.9% (177) | 55.6% (181) |

Between the passes, correctness is identical on 84/90 gold-context turns and 81/90 retrieval turns, and ungrounded any/none on 78/90 and 85/90; two-pass correctness means are 1.011 and 0.583.
Both arms fail the Tier 2 gates in both passes.
Gold context fails the per-class floor on cross-document and refusal; on `hybrid-slice-vector` every class is under 1.00 in at least one pass, precedence included (1.00 then 0.83).

Tier 1 (`data/results/gate-check/p3-final-2026-09-25/warm.json`), with earlier runs re-scored by the current checker for comparison, because Task C's citation audit (`fb75add`) now counts markers closed with `"}` as malformed: iteration 1 gold context re-scores from the recorded 90.5% to 57.5% citation validity, `p3-k20-2026-09-23` scores 78.0%.

| | gold-context | re-scored it1 gold | hybrid-slice-vector | re-scored k=20 |
|---|---|---|---|---|
| refusal integrity | FAIL, 1 of 8 answered | 2 answered | FAIL, 2 answered, 1 off-contract | 2 answered, 1 off-contract |
| citation validity (floor 95%) | 60.4% | 57.5% | 77.9% | 78.0% |
| fabricated figures | FAIL, 1 | 2 | PASS, 0 | 2 |
| quotes supported | 84.6% | 82.5% | 57.0% | 68.7% |

Refusal wording on turns that do not require a refusal: 3 on gold context (1 scored 0) and 19 on `hybrid-slice-vector` (13 scored 0 in pass 1), so over-refusal accounts for about 13 of the retrieval arm's 90 turns.
Of those 19 retrieval turns, 13 had no labelled chunk in their context, 5 had under half and 1 had half or more, so most of them decline for want of evidence: they are a retrieval failure, not a generation one.

The judge returned an empty reply ("no JSON object") on 12 call attempts in pass 1 and 22 in pass 2; each was re-run until both passes held 360/360 verdicts.
`gold-context` `probecal-ph-slope-acceptance` turn 2 correctness failed four times before it answered.

Spend: captures about $0.27 (gold context $0.07, retrieval $0.19, spot checks about $0.01), judge pass 1 $1.80 and pass 2 $1.31 (more of its input was cached), about $3.38 for E3 and about $11.30 of the $20 R4 ceiling; empty replies are not in the ledger, so their cost, if billed, is not counted.

## Task C provenance inputs - 2026-09-24

Future transcript turns retain optional `tool_calls`, `tool_round_cap_reached` and citation `audit` from either transport.
The audit preserves the answer before citation correction or display removal, along with every correction and invalid marker.
Deterministic citation assessment shares the HTTP service's interpretation and reads that original answer when present.
Tool results also reach deterministic figure checks, judge prompts and generated grading-packet context.
Report-period comparisons normalize Unicode hyphens without modifying answer text.
Legacy captures remain readable without synthesizing missing evidence, and existing `eval/transcripts/` have not been changed.
The wire and display contract is documented in `SPECS.md` section 10.4a.
Task C's prompt changes are confined to the tools-only blocks; the R4 general prompt and separate evaluation worktree are untouched.
No paid capture or grading run is part of this verification.

## Judge cost - 2026-09-24

Measured on `eval/judge-cost` by re-judging the `p3-it1` gold-context answers (180 calls each); ledgers are under `data/results/judge/p3-it1-*-2026-09-24/`.
At the default reasoning setting, hidden reasoning was 45-60% of each pass's bill: a one-sentence correctness verdict cost 1,000-1,700 completion tokens and an ungrounded verdict 3,000-5,000.
`response_format: json_schema` does not suppress that reasoning on `deepseek-v4-flash-0731`, contrary to the older comment in `prompts.ts`.

| Pass | Cost | Correctness | Ungrounded turns | Failed calls |
|---|---|---|---|---|
| it1, default reasoning | $0.57 | 1.011 | 54.4% | 0 |
| it1 re-judge, default reasoning | $0.56 | 0.978 | 63.3% | 0 |
| cache-first layout, default reasoning | $0.52 | 0.956 | 55.7% | 2 |
| cache-first layout, `reasoning_effort: none` | $0.23 | 1.011 | 57.8% | 0 |

Means with reasoning off stay inside the spread of the default passes, but turn-level agreement falls: identical correctness scores on 70-72% of turns against 87-92% between two default passes, and the same ungrounded yes/no on 72-76% against 82-84%.
Decision: exploratory judge passes run with reasoning off, and any pass whose numbers are reported or decide something runs with `--final`, which sends no `reasoning_effort`.
That covers the R4 final two-arm capture and its second judging; `--calibration` implies `--final`.
Compare only passes judged at the same setting: the ledger records `reasoningEffort` per verdict, the output file records it per pass, and a verdict is reused only for the same prompt hash and setting.
Making reasoning-off the final judge as well would need a human calibration sample first.

Prompt caching did not pay off.
Judge prompts now open with the service rules and retrieved documents shared by both dimensions of a turn, which raised the cacheable share of input from 14-21% to 50-52% offline, and each call sends a per-turn `user` key, which Fireworks documents as its cache-routing hint.
Both passes still read under 1% of input from cache on first-time prompts; hits appeared only when the same prompt was resent within minutes.
The layout stays because grounded correctness prompts now include the service rules their instruction already counted as grounding.
