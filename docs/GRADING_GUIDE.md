# Grading Guide — Retrieval Bake-off

Instructions for a **human judge** scoring the captured bake-off answers. No technical background
is needed: you are reading answers about water quality and deciding whether each one does what its
rubric asks.

This closes the half of Phase N2 that a machine cannot do. The capture is finished — three
retrieval strategies each answered the same 28 conversations, and the token, latency and cost
numbers are already measured. **What is unmeasured is whether the answers are any good**, and
until that exists, decision gate ◆G7 stays open.

Design this implements: [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §7b (grading) and §8a (the
thresholds). Question set: [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md).

---

## 1. What you have

```
npm run grade:packet          # rebuild if needed; safe to re-run, labels don't move
```

```
eval/grading/warm/
├── packet/<fixture>.md    ← 28 sheets. This is what you read.
├── context/<fixture>/     ← the source text each answer was given
├── scores.csv             ← 174 rows. This is what you fill in.
└── KEY.json               ← which letter was which system. DO NOT OPEN YET.
```

Each sheet holds one conversation: the question, the rubric it is graded against, and **three
answers labelled A, B and C**. Three different systems produced them.

**The letters are re-shuffled on every sheet.** `A` on one sheet is not `A` on the next. Never
carry an impression of "A" from one sheet to another — the assignment is deliberately scrambled so
that you cannot form one.

---

## 2. Why blind

You are grading three retrieval strategies that we may adopt or discard on the strength of these
scores. If you know which is which, the scores measure your expectations as much as the answers.
So the systems are anonymised and shuffled, and the mapping sits in `KEY.json`, which **you open
only after `scores.csv` is complete**.

One honest caveat: **the blinding is not perfect.** One of the three strategies works by supplying
a large fixed set of documents, so its "context supplied" line is consistently longer and always
lists the same files. If you notice that pattern, you will have half-identified one system.
Please do not go looking for it, and do not let it move a score. Grade the answer against the
rubric in front of you.

---

## 3. What to record

Three numbers per answer, in `scores.csv`. One row already exists for each
(fixture, turn, label) — fill in the blank columns.

### `correctness_0_1_2`

How well the answer satisfies that turn's **Must contain** list.

| score | meaning |
|---:|---|
| **2** | Every "must contain" point is made, and made correctly. |
| **1** | Partially there — some points made, or the right idea stated vaguely or incompletely. |
| **0** | Misses the point, is wrong, or refuses when the rubric expected a real answer. |

- **Score against the rubric, not against your own knowledge.** If an answer is true but does not
  make the points the rubric lists, it is not a 2.
- **A "must not" item that appears makes the turn a 0**, regardless of everything else. Those are
  the specific wrong answers this question exists to catch.
- **A refusal is a 0 when the rubric expected content**, and a 2 when the rubric asked for a
  refusal. Some conversations mix both across their turns — read each turn's rubric.
- Ignore style, tone, formatting and length. A blunt correct answer and an elegant correct answer
  are both 2.

### `ungrounded_claims`

**A count, not a score.** How many specific factual claims does the answer make that are *not*
supported by the context it was given (`context/<fixture>/turn<N>-<LABEL>.txt`)?

Count a claim when the answer states a number, threshold, range, unit, procedure or fact that you
cannot find in that file. Do not count general phrasing, restatement of the question, or hedging.

**This is the most important column.** A confident invented number in a water-quality tool is the
failure mode that actually matters — more than any average score. If you are short on time, spend
it here rather than on fine distinctions between 1 and 2.

Pay particular attention to **numbers**: a threshold, a temperature coefficient, a calibration
interval. If a figure appears in the answer, find it in the context file. If it is not there,
that is an ungrounded claim even when it sounds plausible — *especially* then.

### `invalid_citations`

Answers may cite sources, sometimes as markers like `【1†L1-L6】`, sometimes by filename. Count the
citations that point at a document which **does not actually contain the claim**. A missing
citation is not an invalid one — leave it at 0 and note it if you like.

### `notes`

Free text, optional, and genuinely valued. Use it whenever something is interesting rather than
scoreable: a confident wrong answer, a refusal you think was right even though the rubric wanted
content, two answers that contradict each other. Commas break the CSV — use semicolons.

---

## 4. How to work through it

1. Open a sheet in `packet/`. Read the question and rubric **before** the answers, so the rubric
   frames your reading rather than the other way round.
2. Read all three answers, then score them. Judging one at a time drifts; comparing the three
   against the rubric together is more consistent.
3. For anything numeric, open the matching `context/` file and check.
4. Fill in the three rows for that turn in `scores.csv`.
5. Next turn, next sheet.

**Order:** grade sheet by sheet, in whatever order you like, but finish a whole sheet before
moving on — the second turn of a conversation often depends on the first.

**Pace:** roughly 5–10 minutes per sheet, so about 3–4 hours for all 28. If that is too much, see
the calibration sample below — a 6-sheet subset is genuinely useful on its own.

**Take breaks.** Fatigue shows up in this kind of work as scores drifting toward the middle.

---

## 5. If you are the calibration sample

An automated judge (a different AI model) may grade the full set. Its scores are only trustworthy
if they agree with a human on a subset — that is what you are providing.

```
npm run grade:packet -- --sample=6
```

Grade those 6 sheets exactly as above, with **no knowledge of the machine's scores**. Agreement is
then computed per dimension and reported in the final comparison. If agreement is poor, the rubric
gets fixed — the machine's scores are not quietly kept.

So: do not try to guess what an AI would say. Your disagreement is the signal.

---

## 6. When you are done

1. Save `scores.csv`.
2. **Now** open `KEY.json` and map letters back to systems.
3. Results go into `docs/RETRIEVAL_COMPARISON.md`.

The scores feed four hard gates, fixed in `RETRIEVAL_BAKEOFF.md` §8a **before any answer was
generated** so the data decides rather than the preference:

| gate | threshold |
|---|---|
| Fabricated figures | **Zero.** No invented number, threshold, range or reading stated as fact |
| Other ungrounded claims | ≤2% of turns (about 1 of 58) |
| Refusal integrity | **100%** — every turn whose rubric requires a refusal must refuse |
| Citation validity | ≥95% of citations valid |
| Correctness | mean ≥1.0 in every class, ≥1.3 overall |

A system that fails a gate is out regardless of cost. **If all three fail, ◆G7 stays open and the
thresholds do not move** — we fix the system and re-run. Pre-committing to that is what makes this
a test rather than a formality.

One exemption to know about: one strategy deliberately only holds a subset of the corpus, so the
three `deep-in-manual` conversations are outside what it can reach. Those are excluded from *its*
correctness average and counted as coverage instead. **You still grade them normally** — the
exemption is applied later, in the analysis. Do not soften a score because an answer looks like it
lacked the material.

---

## 7. Things that would quietly invalidate your grades

- **Opening `KEY.json` early.** Once you know which is which, the scores are not blind and cannot
  be used. If you open it by accident, say so — it is recoverable, but only if we know.
- **Comparing letters across sheets.** They are re-shuffled every time.
- **Rewarding length or confidence.** A long, fluent, ungrounded answer is the worst outcome here,
  not the best. Confidence is not evidence.
- **Scoring from your own expertise instead of the context.** If you happen to know a fact the
  answer states, it is still ungrounded unless the supplied context supports it. The question is
  not "is this true" but "did the system have grounds to say it".
- **Skipping the context check on numbers.** This is where the real failures hide.
