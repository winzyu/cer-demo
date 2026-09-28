# Long-conversation fixtures - brief

You write five scripted conversations of exactly 12 user turns each, for an eval that asks whether answer quality holds up late in a long conversation.
Every wave 1 fixture has two turns; these probe what two turns cannot: history growth, references back to early turns, topic switches and returns.

## House rules - these bind you

- Run no mutating git commands (no add, commit, checkout, branch, stash, tag); read-only `git show`, `git diff` and `git status` are fine.
- Never run the test suite, `npm install`, or any `npm run` script.
- Spend no money: no API calls, no network, no server.
- Write only these paths: `eval/fixtures-long/<fixture-id>.json` (five files) and `eval/turn-claims-long/<fixture-id>.json` (five files).
- Do not modify anything else, and above all nothing in `eval/fixtures-wave1/`, `eval/claims/`, `eval/turn-claims/` or `eval/retrieval-labels*/`.
- Save each file as soon as it is finished rather than all at the end.

## Inputs

- `eval/claims/*.json`: the claim inventory, per document, per chunk (`chunkId`, `claims[].id`, `claims[].claim`, `claims[].quote`). This is the only source of facts for rubrics.
- `eval/fixtures-wave1/_BRIEF.md`: the question-style rules (operator voice, no manual phrasing, atomic rubric points). They apply here unchanged, except the two-turn rule.
- `eval/fixtures-wave1/*.json`: read three or four for rubric style, including one `refusal-*` fixture and one `followup-*` fixture. Do not copy their questions.
- `eval/turn-claims/_BRIEF.md` and one file in `eval/turn-claims/`: the per-turn claim format you will reproduce.
- `src/eval/fixtures.ts`: the loader that validates your files.

## Output 1: `eval/fixtures-long/<fixture-id>.json`

The wave 1 schema exactly (see any wave 1 fixture), with:

- `id`: `long-<short-topic>`, matching the filename stem.
- `class`: `"follow-up"`.
- `expected_to_favor`: `"rag"`; `answerable_from` must then include at least one document outside the direct-feed slice (the loader rejects the fixture otherwise).
- `requires`: `[]`.
- `turns`: exactly 12, each `{ "role": "user", "content", "rubric": { "must_contain", "must_not", "cite" } }`; the one refusal turn also carries `"requires_refusal": true`.
- Every `cite` filename must also appear in `answerable_from`.
- Do not add `rubric.notes`: the judge reads it, and turn roles must stay hidden from the judge.
- `notes` (fixture level, which the judge does not read) must contain, in this order:
  1. One sentence on what the conversation tests.
  2. `Claims: <every claim id used, comma-separated>.`
  3. A line exactly in this form, one entry per turn, roles joined by `+` when a turn has several:
     `Turn roles: 1=early; 2=early; 3=early; 4=on-topic; 5=switch; ...; 12=capped-back-reference(1).`
     Allowed roles: `early`, `on-topic`, `switch`, `return`, `back-reference(<turn>)`, `capped-back-reference(<turn>)`, `cross-document`, `refusal`.

## Conversation design (every conversation)

- **Turns 1-3 (`early`)** set up one concrete field situation (topic A) with real procedural content: for example a probe acting up, a calibration routine, a deployment question.
- **One `switch`** between turns 4 and 7 to an unrelated topic B, for at least two turns.
- **One `return`** to topic A between turns 7 and 10, phrased as the operator coming back ("OK, back to the conductivity probe from before...").
- **At least two `back-reference(n)` turns** among turns 8-11, each pointing at a specific earlier turn n from 1-3 by paraphrase, not by restating it ("that settling time you gave me at the start - does the same apply when..."). Do not name the instrument or parameter when an operator would say "that" or "the one from before": the model must use the conversation history to know what is meant.
  Each such turn must still be answerable from the corpus. Its rubric grades corpus facts, never "repeats what the assistant said earlier".
- **Turn 12 is `capped-back-reference(1)`**: it refers back to turn 1 in the same indirect way. The service keeps only the last 20 history messages, so by turn 12 turn 1 has been dropped; this turn measures that limit and is scored apart. Write its rubric as if turn 1 were still visible, and add one `must_not` entry: "presents a guess about which earlier instrument or procedure is meant as though it were certain".
- **At least one `cross-document` turn** per conversation, whose `must_contain` needs two different source documents (list both in `cite`).
- **Conversation 5 only** has one `refusal` turn between turns 5 and 8: something the corpus and this system cannot answer (a figure the documents do not give, or a measurement the pods do not make), in the style of the wave 1 refusal fixtures, with `requires_refusal: true`.
- Across the five conversations, use at least eight different corpus documents, and do not reuse a wave 1 fixture's scenario.
- Turn questions stay short and conversational (one to three sentences), like wave 1.

## Rubrics

- Every `must_contain` point is atomic and supported by a claim you list for that turn in Output 2; check the claim's `quote`, not only its paraphrase.
- Three to six `must_contain` points per turn; one to three `must_not` entries naming real failure modes (an invented figure, the wrong probe's datasheet, answering the switched topic when the operator returned to topic A).
- A back-reference turn's `must_not` should include answering about the wrong earlier topic.

## Output 2: `eval/turn-claims-long/<fixture-id>.json`

The `eval/turn-claims/` format: `{ "fixtureId", "fixtureClass", "turns": [ { "turn": <1-12>, "claims": [ { "claimId", "rubric": [<1-based must_contain indexes it supports>], "why" } ] } ] }`.
Every turn appears, turn 1 to 12; the refusal turn may list claims for the related points its rubric requires, or none.
Every claim id must exist in `eval/claims/`, and every claim id in a turn file must appear in the fixture's `Claims:` line.

## Check before you finish

Run exactly this (no network, no cost) and fix every error it reports:

```
SENSOR_TOOL=false REPORT_TOOL=false EVAL_FIXTURE_DIR=eval/fixtures-long npx ts-node -e "const f=require('./src/eval/fixtures'); const all=f.loadFixtures(); console.log(all.length, 'fixtures', f.countTurns(all), 'turns')"
```

It must print `5 fixtures 60 turns`.
Then report: each fixture id, its topics A and B, its `Turn roles` line, the documents it uses, and any rubric point you could not tie to a claim quote (there should be none).
