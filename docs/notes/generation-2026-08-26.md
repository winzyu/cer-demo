# Generation quality — findings, 2026-08-26

Agent A's brief (`HANDOFF_2026-08-27.md` §7a). **No generation lever was changed** — see §0 for
why. The worktree it was dispatched into is on the wrong base, so none of the four levers could be
implemented or measured.

> **Amended 2026-08-27.** The §5 quote check *was* subsequently built on this branch
> (`checkQuotes` in `src/eval/gates/checks.ts`, wired into `runner.ts` and `gateCheck.ts`, with
> `test/unit/gateCheck.test.ts` coverage) after the base was corrected. §5 below reads "Not
> implemented", which described the repository when it was written and no longer does. **What is
> still true, and is the point:** `src/prompt/systemPrompt.ts` is untouched, so no answer has
> changed, and the new check measures **0 quoted citations on every captured arm** because the
> model has never been asked to emit one. The instrument exists; the lever it was built for has
> not been pulled. What follows is what could be established for free from the ledger and the transcripts
already on disk, plus two hazards in the code that the brief did not carry.

Everything below is reproducible with no LLM calls and no spending.

---

## 0. Why nothing was implemented

The worktree was described as "cut from branch `dev` (commit `cddbabc`)". It is not. `HEAD` is
`38f92c1`, a strict ancestor **38 commits and 280 files behind `dev`**. Absent from it:

- `scripts/gateCheck.ts` and the `gate:check` npm script — so **no free signal can be run at all**
- `src/eval/gates/{checks,normalize,runner}.ts` — the files the Tier 1 quote check must extend
- `test/unit/gateCheck.test.ts`, `docs/RETRIEVAL_COMPARISON.md`, `scripts/judge.ts`, `npm run judge`

`HEAD` is a strict ancestor of `dev`, so the correction is lossless and is a fast-forward, not a
merge. The user runs it:

```
cd .claude/worktrees/agent-a9d36a0c244200839
git status --short          # expect only "?? data"; anything else, stop
git merge --ff-only cddbabcdae4b84dd8bbdeb5f7c8cadf90b6788e1
```

Nothing is lost — the branch has zero commits of its own.

---

## 1. The two gates are aligned, not opposed

The obvious worry about "forbid volunteered mechanism" is that it strips content the correctness
rubric rewards, buying groundedness with correctness. **Measured, the opposite holds.** Turns the
judge flagged as ungrounded score *worse* on correctness than clean turns, on every arm with a full
pass:

| arm | n | flagged | correctness, flagged turns | correctness, clean turns | delta |
|---|---:|---:|---:|---:|---:|
| `firestore-direct` | 58 | 53.4% | 0.871 | 1.148 | **−0.277** |
| `hybrid-slice-vector` | 58 | 58.6% | 0.706 | 1.125 | **−0.419** |
| `hybrid-slice-lexvec` | 58 | 58.6% | 0.765 | 1.000 | **−0.235** |

Volunteering unsupported mechanism goes with being less correct, not more. Suppressing it should
move both numbers the same way. **This removes the main hazard in lever 1** and is the strongest
argument for doing the prompt work at all.

## 1a. But fixing groundedness alone still misses the correctness floor

`firestore-direct`'s clean turns average **1.148**. If every flagged turn stopped being flagged and
rose to exactly that clean-turn mean, overall correctness would be 1.148 — **0.152 short of the
1.300 floor**.

**State the basis, because this arm has two and they are not interchangeable.** The 1.148 above is
over **all 58 judged turns**. §8a scores `firestore-direct` on its **servable 52** (the three
`deep-in-manual` fixtures are charged as coverage), and on that basis the clean-turn mean is
**1.192** and the counterfactual is **1.192 — 0.108 short**. Both miss the floor, so the finding
stands either way; but the published 1.08 in `RETRIEVAL_COMPARISON.md` §6.7 is the servable figure,
so the servable 0.108 is the number to compare against it. An earlier draft of this section paired
the all-58 counterfactual with the servable floor comparison and noted it landed "almost exactly"
on the 1.155 oracle ceiling — that near-coincidence is partly an artifact of mixing the two bases,
and is not evidence that the two arguments converge.

That is not a coincidence and it is the number that should drive planning: *perfect groundedness
does not open the correctness gate either.* Clearing 1.30 requires the already-clean turns to get
better, which no lever in the brief targets. Correctness and groundedness are one problem in the
sense that the same fix helps both, and two problems in the sense that the groundedness fix is not
sufficient for the correctness bar.

---

## 2. Answer length is the dominant predictor — and the env var is not the lever

`firestore-direct`, 58 turns, split into thirds by answer length in characters:

| | n | mean chars | flagged | mean ungrounded items | correctness |
|---|---:|---:|---:|---:|---:|
| shortest third | 19 | 241 | **15.8%** | 0.21 | 1.05 |
| middle third | 19 | 525 | 63.2% | 1.68 | 1.11 |
| longest third | 20 | 1,543 | **80.0%** | 5.00 | **0.85** |

Length hurts **both** gates: the longest third is both the most ungrounded and the least correct.

**The confound was checked.** Long answers might simply be long because the question was hard and
uncovered. Excluding `deep-in-manual` and `fouling-drift` — the two classes where coverage is
plausibly the real problem — the effect survives at n=48:

| | n | mean chars | flagged | items | correctness |
|---|---:|---:|---:|---:|---:|
| shorter half | 24 | 285 | 29.2% | 0.38 | 1.12 |
| longer half | 24 | 1,080 | 62.5% | 2.71 | 1.08 |

Flagging doubles with length while correctness is flat-to-slightly-better on the shorter half.
**Shortening costs nothing measurable in correctness on covered questions.**

**The brief mis-locates this lever.** It calls `max_tokens` "one env var, directly testable".
`LLM_MAX_TOKENS` is 16,384 and measured completions are 405–961 tokens — the cap is nowhere near
binding, so lowering it changes nothing until it starts *truncating* answers mid-sentence, which is
worse than a long one. The variable that actually controls length here is the model's own verbosity,
so the length lever is **a brevity rule in the system prompt**, not an env var. That merges levers
1 and 3 into a single prompt edit, which suits the "batch changes into one re-capture" constraint.

Concentration is worth noting for the same reason: 27 of 58 turns are clean, and the tail is
extreme — 3 turns carry 13 ungrounded items each, 2 carry 11, 1 carries 9. The failure is not
spread evenly across turns; it is a handful of long, discursive answers.

---

## 3. Where the ungrounded behaviour lives

`firestore-direct`, by fixture class:

| class | n | flagged | correctness | mean chars |
|---|---:|---:|---:|---:|
| `fouling-drift` | 4 | **100.0%** | 0.75 | 1,836 |
| `deep-in-manual` | 6 | 83.3% | **0.33** | 886 |
| `cross-document` | 6 | 66.7% | 0.67 | 480 |
| `definitional` | 6 | 66.7% | 1.17 | 808 |
| `follow-up` | 6 | 66.7% | 1.00 | 1,660 |
| `acronym-exact-token` | 6 | 50.0% | 1.50 | 466 |
| `event-signature` | 4 | 50.0% | 1.00 | 854 |
| `refusal` | 6 | 33.3% | 1.33 | 447 |
| `probe-calibration` | 4 | 25.0% | 1.00 | 685 |
| `threshold-lookup` | 4 | 25.0% | 1.25 | 186 |
| `precedence` | 6 | 16.7% | 1.00 | 448 |

The behaviour concentrates where the model has least material: `fouling-drift` and
`deep-in-manual` are the two worst, and `deep-in-manual` is the class §2c says needs corpus outside
the slice. **Part of the 53% is a coverage problem surfacing as a generation symptom** — on those
turns the correct output is a refusal, not an explanation, and the prompt rule should make that the
available escape hatch rather than only forbidding mechanism.

This also couples Agent A and Agent B more than §7.0 assumes: 5 of `firestore-direct`'s 31 flagged
turns are `deep-in-manual`, which is B's target.

---

## 4. Two hazards in the code the brief did not carry

**4a. `test/unit/prompt.test.ts` pins the system prompt by SHA-256** — two digests, one per water
type — and its own comment says:

> **If this fails, do not update the hash to make it pass.** Either the change is unintended and
> belongs reverted, or ◆G7 has closed and the arms are being deliberately re-run — in which case
> update the digest *and* say so in `RETRIEVAL_BAKEOFF.md`.

The prompt is now unpinned, so the digests *should* be updated — but the brief forbids editing
`RETRIEVAL_BAKEOFF.md`. The procedure the test demands and the brief's doc-edit ban collide. The
resolution is to update the digests and leave the note for the integrator to fold in; flagging it
so the next agent does not silently update a hash a comment told it never to silently update.
Three further cases in that file (`says nothing about tools`, `appends the tool block…`, `keeps the
authoritative ranges above the tool block`) constrain prompt *structure* and will also need
re-reading against any new rule block.

**4b. Editing the system prompt moves the Tier 1 figures baseline.**
`src/eval/gates/runner.ts` builds each turn's grounding as
`[buildSystemPrompt(undefined, false, false), ...prior questions]`, so the prompt's own
`AUTHORITATIVE NORMAL RANGES` are what stop the figures gate reporting ~24 false fabrications per
arm. A prompt edit therefore changes the checker's own reference set: a before/after on
`npm run gate:check` across a prompt change is **not** a clean comparison unless the edit adds no
figures and removes none. Keep any new rule text free of numerals, or the comparison has to be run
against a pinned copy of the old prompt.

---

## 5. Tier 1 quote-check — design, against the code as it actually stands

Not implemented. Specified here so it can be built directly once the worktree is on the right base.
`RETRIEVAL_COMPARISON.md` §6.5 already rejects re-chunking and "instruct the model to cite exact
lines"; neither is revisited.

The measured defect §6.5 records: 198 citation markers, 103 with a line span, **48 of those start
at line 1** against a median chunk of 77 lines — a 47% "cite the top" rate.

- **Prompt side.** Keep the existing `【n†…】` marker so `checkCitations` still resolves the index,
  and change what goes after the dagger from a line range to a short verbatim quote:
  `【3†"conductivity is temperature-dependent"】`. The existing `CITATION_PATTERN` in
  `src/eval/gates/checks.ts` already tolerates this — it captures the index, and the line-span
  group is optional with a trailing `[^】]*`, so a quote lands in the ignored tail rather than
  breaking the current gate. **The two schemes can therefore coexist during transition**, which
  means the change does not have to be atomic with a re-capture.
- **Check side.** A fourth gate beside `checkRefusal` / `checkCitations` / `checkFigures`: extract
  the quoted span, `normalizeForMatch` it and the cited chunk's text (never `===`, never bare
  `.normalize()` — §8's U+2011 trap), and assert containment. Report `total / supported / issues`
  in the shape the other three already use so `runner.ts` and `gateCheck.ts`'s `printArm` need only
  one more block each.
- **Why it is worth more than tidier output.** It converts groundedness from a paid Tier 2
  judgement into a free deterministic Tier 1 substring match. Given §6 below, that may matter more
  than the generation effect.
- **Do not gate on it until it has a baseline.** Set no threshold in the same change that
  introduces the measurement.

---

## 6. Is ≤2% reachable on this model? No — and the instrument cannot see 2% either

Two separate reasons, and the second is the one that should be escalated.

**6a. The behavioural gap is roughly 8x beyond the model's best observed behaviour.** The ceiling is
≤2% of turns, which on 58 judged turns is **at most 1 turn**. The best-behaved slice of real output
from this model — the shortest third of `firestore-direct`'s answers, already the most grounded
thing it produces — flags at **15.8%**. Prompt discipline plus a brevity rule plausibly moves the
overall rate from 53% into the 15–25% band, because that is where the short answers already sit.
Getting from there to one flagged turn in 58 asks the model to be about eight times better than its
own best-behaved decile. On `gpt-oss-20b` that is not credible.

**6b. The 2% gate is below the instrument's noise floor, so it cannot be demonstrated at n=58.**
§3 of the handoff measures the judge re-judging byte-identical prompts and changing **11 of 36
`ungrounded` verdicts**. A dimension that flips roughly a third of individual verdicts run to run
cannot resolve a 2% threshold on 58 turns: one spurious flag is 1.7% and passes, two is 3.4% and
fails. **The verdict at that threshold would be decided by judge noise rather than by the model.**

This is a measurement problem, not a model problem, and it holds *even if generation were perfect*.
It is also why the quote-based Tier 1 check (§5) should be reordered ahead of the prompt work
rather than behind it: without a deterministic groundedness signal there is no instrument capable
of telling whether any prompt change worked, and every iteration is spent on a noisy paid measure.

**Recommendation.** Land §5 first, get a free reproducible groundedness number, then do the prompt
and brevity edits in one batch against it. And put ≤2%-at-n=58 back in front of whoever
pre-registered it: the threshold is not moved by saying that the current evaluation cannot measure
it, and either the sample or the instrument has to change before that gate can be adjudicated at
all.

---

## 7. Reproducing everything above

Free, no LLM, from `data/results/judge/warm.jsonl` and `eval/transcripts/warm/firestore-direct/`.
Join the ledger on `(arm, fixtureId, turn)`, taking `score` from `dimension == "correctness"` and
`count` from `dimension == "ungrounded"`; join to the transcripts on `fixtureId` and turn position
for answer length. §1 groups by `count > 0`; §2 sorts by `len(answer)` and cuts into thirds/halves;
§3 groups by `fixtureClass`.

The `firestore-direct` warm transcripts were verified byte-identical between `38f92c1` and
`cddbabc`, so these numbers are not an artefact of the stale worktree:

```
git diff --stat 38f92c1 cddbabc -- eval/transcripts/warm/firestore-direct   # empty
```
