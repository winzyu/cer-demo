# Per-turn claim assignment: brief

Worktree `.claude/worktrees/per-turn-labels`, branch `task/per-turn-labels`.
Edit only files inside `eval/turn-claims/`; everything else is read-only.

## Why

Each wave-1 fixture has two user turns, but its retrieval labels give both turns the same chunk set.
`scripts/resolveRetrievalLabels.ts` collects every claim id named in a fixture's `notes` and labels both turns with all of them, so a turn is scored against passages that only its sibling turn needs.
This task splits those claims by turn, so the label generator can later label each turn with only the passages that turn needs.

## Inputs (read-only)

- `eval/fixtures-wave1/*.json`: the 41 fixtures whose `class` is not `"refusal"` (skip the 4 refusal fixtures).
  For each, read `turns[0]` and `turns[1]`: `content`, `rubric.must_contain`, `rubric.must_not`, and `retrieval_evidence` where present; and the fixture's `notes`.
- The fixture's claims are the claim ids named in `notes`: tokens of 3 or more hyphen-separated alphanumeric segments whose last segment is exactly two digits (e.g. `orp-purge-oxygen-01`).
  Keep only tokens that exist as a claim id in `eval/claims/*.json` (`chunks[].claims[].id`); in the current tree 340 of 341 tokens resolve, and `in-situ-vs-25` is not a claim.
- For each claim read its `claim`, `quote` and chunk `locator` in `eval/claims/<document>.json`.

## The judgement

For each claim and each turn, decide whether the claim supports at least one of that turn's `must_contain` points.
"Supports" means an answer to that turn needs the claim's content (its fact, number, condition or reason) to satisfy the point.
A claim that is only background, only relevant to the other turn, or only helps avoid a `must_not` item does not count.

Each claim then lands in exactly one of:

- **turn 1 only**, **turn 2 only**, or **both** (listed under both turns), each with the `must_contain` points it serves;
- **neither**, with a one-line reason (for example "names the reporting precision; neither turn asks for it", or "supports only must_not 2 of turn 1").

Turn 2 is read in the context of turn 1 (it is a follow-up), but a claim counts for turn 2 only if turn 2's own rubric needs it.
Some turns already carry `retrieval_evidence` (explicit per-turn quotes); assign claims for those turns anyway, and say in `why` when a claim matches that evidence.
Also list each `must_contain` point that no assigned claim supports (`uncovered`); that is a finding, not something to fix.

## Output

One file per non-refusal fixture: `eval/turn-claims/<fixtureId>.json`, formatted with 2-space indentation and a trailing newline:

```json
{
  "fixtureId": "crossdoc-bailed-orp-jumping",
  "fixtureClass": "cross-document",
  "turns": [
    {
      "turn": 1,
      "claims": [
        { "claimId": "a60-xcut-bailer-no-do-eh-temp-01", "rubric": [1, 2], "why": "bailed subsample cannot give Eh; aeration is the reason" }
      ],
      "uncovered": [5]
    },
    { "turn": 2, "claims": [], "uncovered": [] }
  ],
  "neither": [
    { "claimId": "orp-report-nearest-10mv-01", "why": "reporting precision; neither rubric asks for it" }
  ]
}
```

- `rubric` and `uncovered` hold 1-based indexes into that turn's `must_contain`.
- `claims` keeps the order in which the ids appear in `notes`; `neither` likewise.
- Every resolving claim id of the fixture appears in `turns[0].claims`, `turns[1].claims` or `neither`, never in `neither` and a turn at once, and no other ids appear.
- `why` is one short line in plain English, no em dashes.

Then `eval/turn-claims/_SUMMARY.md`:

- a table with one row per fixture: class, claims, turn 1 only, turn 2 only, both, neither, uncovered points in turn 1, uncovered points in turn 2;
- a totals row;
- up to 15 assignments you were least sure of, each as `fixtureId`, claim id, what you chose and the alternative.

## Rules

- Do not edit anything outside `eval/turn-claims/`: fixtures are frozen by fingerprint, and `eval/retrieval-labels/` is regenerated only by its script.
- No model or network calls, no `npm` scripts, no captures, no Git commands that change state (no add, commit, checkout, stash or reset).
- A throwaway script to list claims or check the output shape is fine; keep it outside the repository or delete it before finishing.
- Judge from the rubric text, not from how many claims a turn "should" get.

## Before finishing

Check, and report the result:

1. 41 fixture files plus `_SUMMARY.md` in `eval/turn-claims/`, nothing else added or changed (`git status --short`).
2. Every file parses, and the coverage rule under Output holds for every fixture.
3. The summary's totals match the files.

Report the changed paths, the checks and their results, and anything you could not decide.
