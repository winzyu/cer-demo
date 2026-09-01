# Phase 1b — question generation

You write eval fixtures for ONE class. Questions come **from claims**, never from chunk text.

## The rule that governs everything

A question written while looking at a chunk inherits that chunk's vocabulary. The query embedding
then sits next to the gold chunk by construction, retrieval recall becomes meaningless, and the
whole eval measures nothing. **You are given claim sentences, not chunks. Do not go read the chunk
text to "check" a claim.** The claim is already one paraphrase away from the source; that distance
is the point.

Phase 1c adds a second rewrite into an operator's voice and then measures contamination with BM25
against a **< 40 %** bar. Your job is to not make 1c's job impossible.

## House rules

- **Run no mutating git commands.** No add, commit, push, branch, tag. Read-only `git show` /
  `git diff` is fine and encouraged if you want to verify you have not clobbered prior work.
- **Never run the test suite.**
- **Spend no money.** No API calls, no network.
- **Write only inside this repo**, only to your assigned output paths.

## Your inputs

- Your class pool: `<scratchpad>/pools/<class>.txt` — the candidate claims, each with its id, type,
  specificity, source file, chunkId and the claim sentence.
- **`<scratchpad>/pools/SLICE-EXCLUSION.txt`** — everything the ◆G9 slice can answer on its own.
  **Check every question you write against this file.** If the slice can answer it, the question
  cannot discriminate between retrieval strategies and is worthless to us. Rewrite it or drop it.
- `eval/claims/*.json` if you need a claim's full context (locator, quote, metrics).

## Output

One JSON file per fixture at `eval/fixtures-wave1/<fixture-id>.json`. Schema — this is loaded by
`src/eval/fixtures.ts`, so it must match exactly:

```json
{
  "id": "<kebab-case, unique, prefixed with your class>",
  "class": "<your assigned class, verbatim>",
  "expected_to_favor": "rag" | "direct-feed" | "tie",
  "answerable_from": ["usgs-nfm-a6.2-dissolved-oxygen.pdf"],
  "requires": [],
  "notes": "<why this fixture exists, which claim ids it came from, and what it is testing>",
  "turns": [
    {
      "role": "user",
      "content": "<the question, in an operator's own words>",
      "rubric": {
        "must_contain": ["<atomic point the answer must make>"],
        "must_not": ["<failure mode, e.g. 'invents a numeric threshold'>"],
        "cite": ["<source filename>"]
      }
    }
  ]
}
```

### Hard requirements

- **Exactly 2 turns per fixture.** Turn 2 must depend on turn 1 — a follow-up an operator would
  actually ask next, not a second unrelated question.
- **`answerable_from` lists the real source files**, taken from the claim ids you used.
- **`must_contain` entries are atomic.** Each is graded independently, so "states X and Y" is two
  entries, not one.
- **`must_not` names real failure modes** you expect — inventing a figure, citing the wrong probe's
  datasheet, answering from the operator ranges when the manual governs.
- **`requires` is `[]`** unless the fixture genuinely needs a capability that does not exist.
- Record the claim ids you drew on in `notes`. That is the audit trail back to the inventory.

### Question style — write like the operator, not like the manual

The reader is a field operator with a water-quality sonde, not a USGS author. Ask what they would
ask, in their words. "How long do we wait at each new depth?" not "What is the minimum thermal
equilibration interval specified for sonde deployment?" The second one is a contaminated question:
it is the manual's own sentence with a question mark on it.

**Do not reuse distinctive terminology from the claim** where a plain-language equivalent exists.

### Never build a fixture on

- **A headerless table grid.** Those are excluded from your pool already, but if you follow a claim
  back and find its chunk is a bare number grid with no column header, drop it. The answer is not
  honestly retrievable.
- **Anything the slice already answers** — see SLICE-EXCLUSION.txt.
- **The source-of-truth signature matrix rows**, which arrived damaged in extraction (several rows
  lost cells). Its prose "Primary Signature" column is sound; the arrow grid is not.

## Save as you go

Write each fixture file as you finish it. Do not build all of them in memory and save at the end —
several previous agents were terminated by an account spend limit and lost everything in flight.
