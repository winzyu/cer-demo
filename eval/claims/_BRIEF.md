# Phase 1a — Claim inventory

You extract, per chunk, **what claims that chunk supports**. You do NOT write questions.
Questions come in Phase 1b, generated from your claims. If you write questions you have done the
wrong task.

## House rules — these bind you

- **Run no git commands.** Not `add`, not `commit`, not `checkout`, not `tag`. The user runs all git.
- **Never run the test suite**, full or partial. You are not changing code.
- **Spend no money.** No API calls, no network.
- **Write only inside the cer-demo repo**, and only to the output path named below.
  `../user-dashboard` and `../backend` are read-only reference repos — do not touch them.

## Your input

Chunk dumps live in the scratchpad path given in your assignment. Each file holds the document's
chunks separated by `===== CHUNK <index> | id: <chunkId> =====`.

**These chunk files ARE the corpus as the retrieval arms see it.** 59 chunks were removed from the
corpus by a quality filter and that decision is frozen — the filtered material does not exist for
your purposes. Extract claims ONLY from the chunk text you are given. Do not reason about what the
source PDF probably also says.

**Chunks carry 400 characters of prepended overlap from the previous chunk.** Consecutive chunks
therefore share their opening text. When a claim appears only in that shared opening, attribute it
to the chunk where it *originates* (the earlier one) and do not duplicate it into the next.

## The six metrics this system measures

`dissolvedOxygen`, `orp`, `ph`, `conductivity`, `temperature`, `turbidity`.

Tag each claim with every metric it bears on. A claim bearing on none of them (document
front-matter, general hydrology, agency policy) still gets recorded, with `"metrics": []` — knowing
what the corpus holds that is *off-topic* matters as much as knowing what is on-topic.

## Output

Write exactly one JSON file per document to `eval/claims/<filename-without-.pdf>.json`:

```json
{
  "filename": "usgs-nfm-a6.2-dissolved-oxygen.pdf",
  "title": "<from the header of your input file>",
  "inSlice": false,
  "chunkCount": 55,
  "chunks": [
    {
      "chunkId": "<exact id from the ===== CHUNK header, copied verbatim>",
      "index": 12,
      "locator": "<document section or table number + a 3-8 word quoted phrase>",
      "claims": [
        {
          "id": "<short stable slug, unique in this file, e.g. do-air-cal-chamber-01>",
          "claim": "<ONE self-contained sentence stating what the chunk asserts. A reader who has never seen the chunk must be able to check it.>",
          "metrics": ["dissolvedOxygen"],
          "type": "numeric",
          "quote": "<short VERBATIM span copied from the chunk, <=200 chars, that supports the claim>",
          "specificity": "high"
        }
      ]
    }
  ],
  "summary": {
    "totalClaims": 0,
    "byMetric": {},
    "byType": {},
    "gaps": [],
    "notes": ""
  }
}
```

### Field rules

- **`chunkId` must be copied verbatim** from the `===== CHUNK` header. It is a content-derived
  SHA-256 and a typo silently breaks every downstream label. Do not reconstruct it.
- **`locator` is a human-readable address** — document section or table number, plus a short quoted
  phrase. It exists so a future re-chunk can re-resolve this claim instead of voiding it. Do not
  leave it blank or write "unknown"; if the chunk has no section heading, quote its first
  distinctive line.
- **`quote` must be a verbatim substring of the chunk.** Copy, never paraphrase, never fix typos or
  spacing. It gets checked by exact substring match.
- **`type`** is one of: `numeric` (a threshold, tolerance, range, interval, or table value),
  `procedural` (a step, sequence, or method), `definitional` (what a term means, a unit, an
  expansion), `conceptual` (a mechanism or causal relationship).
- **`specificity`**: `high` = a specific figure or procedure a reader could not guess and probably
  could not find elsewhere in this corpus. `medium` = specific but likely restated in another
  document. `low` = general background.
- A chunk with genuinely no extractable claim gets `"claims": []`. Do not manufacture filler.

### `summary.gaps` — this is the most valuable field you produce

List what a water-quality operator would reasonably expect **this document** to answer and it does
not. Be concrete: "gives no numeric turbidity threshold for estuarine water", not "incomplete
coverage". Refusal fixtures are built from these gaps, so a vague entry here is a wasted one.

### `summary.notes`

Anything surprising: OCR damage, a table that arrives truncated or as bare numbers with its header
lost, a chunk that is pure front-matter, text that contradicts another part of the same document.

## Quality bar

Aim for claims a fixture could be built on. A 40-chunk manual typically yields 60-150 claims. Far
fewer means you are summarizing; far more means you are splitting sentences. Prefer a smaller
number of checkable, self-contained claims over many fragments.

When you finish, report back: per document, the claim count, the metric spread, the `high`
specificity count, and your gaps list. Keep the report compact — the JSON is the deliverable.

---

## Addendum, 2026-08-31 — read this too

### If your assignment says TOP UP an existing file

The file already holds validated claims for chunks that are **not** in your list. **Read it, add
your chunks to its `chunks` array, and write it back.** Do not overwrite it, do not re-extract a
chunk already present, and do not renumber anything. Losing those claims means losing work that
cannot be cheaply redone.

Two files also carry `"notes": "PARTIAL — agent terminated..."` in their summary. If your
assignment completes that document, replace the whole `summary` block with the real one —
`totalClaims`, `byMetric`, `byType`, and above all `gaps`.

### Newly recovered chunks

The corpus was re-ingested without the alphabetic-ratio filter, so 58 chunks that never existed
before are now present. They are marked `| NEWLY RECOVERED` in the chunk header. Most are numeric
tables; some are front matter, table-of-contents dot leaders, or reference lists.

- **Front matter, dot leaders and reference lists get `"claims": []`.** That is the correct answer
  for them. Do not manufacture filler.
- **Numeric tables are the valuable ones.** Capture the rows as `numeric` claims with the exact
  values and units quoted verbatim, and put the table number in the locator.

### Headerless table grids — flag these explicitly

A table often spans several chunks, and only the first carries the caption and column header. The
continuation chunks are bare number grids: a reader sees `12.13 12.21 12.29 …` with no way to know
which column is which pressure or salinity.

When a chunk is one of these, say so in its `locator` (e.g. `Table 6.2-2 continuation — no header
in this chunk`) and list the chunk in `summary.notes`. **A claim from a headerless grid must not
assert what a specific cell means** unless the chunk itself gives you the row and column labels.
This matters: a fixture built on such a chunk is not honestly answerable from retrieval, and we
need to know which chunks are in that state before questions are written.

### Scratchpad hygiene

If you write a helper script, **name it after your own assignment** (e.g. `verify_a62.py`), never a
generic name. Agents share one scratchpad directory and the previous run had them overwrite each
other mid-task.
