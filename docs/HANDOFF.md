# Session Handoff — 2026-08-13

Everything needed to resume this work cold. Written at the end of the session that captured the
Phase N2 bake-off, repaired a validity threat in it, built the grading packet, and added the
Phase N3 device-API read layer.

> **This is a dated session record, and two of its sections describe a working tree that no longer
> exists.** §2's branch table and §7's uncommitted list are **superseded** and marked as such where
> they sit — they are kept because §8 refers back to them, not because they describe today. §3, §4,
> §5 and §9 are still the live orientation. For state as of now, read
> [`SPECS.md`](SPECS.md)'s status block and [`timeline.md`](timeline.md)'s gate table.

**Read order for a cold start:** this file → [`timeline.md`](timeline.md) (phases + gates) →
[`SPECS.md`](SPECS.md) (what's built) → [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) (the
experiment; §4a and §4b are the newest and most important) →
[`RETRIEVAL_EVAL.md`](RETRIEVAL_EVAL.md) (the offline harness, and the only place the 20.2% floor
is explained).

---

## 0. What has happened since this file was written (2026-08-24/25)

The corpus, the retrieval arms and the measurement apparatus all moved — and so, as of 2026-08-25,
did §5's "next task".

- **Corpus: 15 documents / 851,891 chars / 393 chunks.** Expanded to 18 on 2026-08-21, trimmed on
  2026-08-24 after three documents were scanned for numeric criteria on the six measured
  parameters and all three returned zero.
- **Chunk ids are content-derived** (`sha256`, 12 hex chars), not positional. This is what makes a
  durable label set possible — and it means **re-chunking invalidates all 259 labels**.
- **An offline retrieval harness exists**: `npm run retrieval:eval`, 99 labelled queries over 48
  fixtures, no LLM, deterministic, ~10s. Read [`RETRIEVAL_EVAL.md`](RETRIEVAL_EVAL.md) before
  quoting any number from it.
- **Four new arms**: `local-vector`, `local-hybrid` (dense + BM25 via RRF), `hybrid-slice-vector`
  and `hybrid-slice-lexvec` (the ◆G9 slice plus a ranked arm). Best offline recall at k=10 is
  **81.8%**, best MRR **0.623**.
- **`MAX_TOP_K` raised 10 → 50.** `DEFAULT_TOP_K` is still 5.
- **The `corpus_chunks` collection was stale and was wiped + re-seeded.** It held 305 chunks of a
  corpus that no longer existed; the seeder is idempotent by filename and never deletes, so no
  re-seed would ever have fixed it. Use `npm run seed:firestore-chunks -- --wipe`.

**None of this closes ◆G7, and none of it is evidence that the project is passing.** Two things to
hold onto:

1. **`stub` scores 20.2% recall while retrieving nothing at all** — 20 of the 99 turns are labelled
   `noRelevantChunks`, and correctly retrieving nothing scores 1. Every recall number reads about
   20 points better than it is until you subtract that floor.
2. **Every pre-registered target is answer quality, and every one is unmeasured.**
   [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §8a fixed them on 2026-07-30: zero fabricated
   figures, 100% refusal integrity, ≥95% citation validity, correctness ≥1.0/2 in every servable
   class and ≥1.3 overall. Recall, MRR and nDCG appear in none of them — they are diagnostics.
   Grading is still **36 of 174 rows**.

**The next task changed on 2026-08-25, and §5 below is superseded.** Grading the captured packet
would mostly measure an 8-document corpus that no longer exists — only `firestore-direct`'s
transcripts survive, because its ◆G9 slice never changed. The revised sequence, amended into the
pre-registration at [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §8b:

1. ~~**Build the automated §8a gate checker.**~~ **Built 2026-08-25** — `npm run gate:check`,
   `src/eval/gates/`, 22 tests in `test/unit/gateCheck.test.ts`. Deterministic, no LLM, no network.
   Decides §8a's three *hard* gates: no numeric literal in an answer that is absent from its
   grounding; the pinned `REFUSAL_SENTENCE` present where a rubric demands a refusal; every
   `【N†Lx-Ly】` marker resolving to context that was actually supplied. Two traps it exists to
   avoid, both found by running it (`RETRIEVAL_BAKEOFF.md` §8b): an exact string comparison fails
   on a *correct* refusal because the model emits U+2011 where the constant has U+002D, and the
   grounding a figure may come from includes the **system prompt** and the question, not just the
   retrieval context.
2. **Re-capture** `firestore-direct`, `firestore-vector`, `hybrid-slice-lexvec` (and
   `hybrid-slice-vector` if you want the lexical delta at the answer layer) on the 15-document
   corpus. `pgvector-rag` stays out unless restored from `archive/`.

   > **First Tier-1 result is already in, free** (`data/results/gate-check/warm.json`, 2026-08-25):
   > `firestore-direct` **clears all three hard gates** on the transcripts that survived the corpus
   > change — refusal 3/3, citations 95.3%, zero unexplained figures in 187. The other two arms
   > fail, but their evidence is inadmissible (stale corpus), so those failures are indicative
   > only. **The 95.3% is 0.3 points above the floor**; three invented citations out of 64 would
   > become a gate failure at four.
3. **Run the gates.** Survivors only go to step 4.
4. **LLM judge** for the two judgement gates, which are **unchanged**: ungrounded claims ≤2%,
   correctness ≥1.0/2 per servable class and ≥1.3 overall. §7b's constraints bind — different model
   than `gpt-oss-20b`, one dimension per call, context supplied, calibrated against a human sample
   with the agreement rate reported. The 36 rows already scored are that sample.
5. **Write `RETRIEVAL_COMPARISON.md`** and close ◆G7.

**No threshold moved.** The order, the instrument and the admissible evidence changed; the floor did
not. Retrieval metrics are still not gates — an arm cannot pass ◆G7 on recall.

The binding risk to watch: `deep-in-manual` recall is 21–31% across the new arms
(`local-hybrid` 24.5% at k=10, `hybrid-slice-vector` 21.0% at k=10 / 31.0% at k=20), and the RAG
arms get **no servable-set exemption** for that class, so they must still clear 1.0/2 correctness on it.

---

## 1. State in one paragraph

Phase N1 is complete. **Phase N2's bake-off is captured, valid, and ungraded.** Three retrieval
arms were swept over 28 conversations × 58 turns × 2 passes with zero failures; the cost model runs
on measured numbers; a blind grading packet is built and waiting for a human. **◆G7 cannot close
until that grading happens** — quality gates the decision and quality is the one thing unmeasured.
Separately, a detour built the Phase N3 **device-API read layer** on its own branch, verified live
against production. The tool-calling loop was deferred at the time of writing, on the ground that it
would void the bake-off's pinned prompt; it landed later the same day behind `SENSOR_TOOL`, which
resolves that objection without re-running an arm — see §9.

## 2. ~~The single most useful thing to know~~ — SUPERSEDED 2026-08-13

> **The split this section describes is over.** `feat/device-api` was merged at `fa299ef` the same
> day (§8 item 2), and everything below has since landed on `dev`. The table and the test counts are
> left as written because §8 refers to them. Test count when that was written: **720 in 36 suites**,
> all passing. The suite is **42 suites** as of 2026-08-25; the test total is un-re-measured.

**The work is split across two branches that do not contain each other.**

| branch | contains | state |
|---|---|---|
| `feat/bakeoff-sweep` | N2: sweep transcripts, measured cost model, lexical repair, grading packet, doc refresh | **current**, 5 uncommitted doc files (§7) |
| `feat/device-api` | N3: `DeviceApiClient`, metric decoding, `explore:devices`, `DEVICE_API.md` | committed + pushed, 2 commits |
| `demo` | common ancestor of both | `f0131b2` |

`npm test` therefore reports **234** on `feat/bakeoff-sweep` and **279** on `feat/device-api`.
Neither number is wrong. Merging them is an open task (§8).

## 3. Where the retrieval decision actually stands

**A provisional working choice was made: `firestore-direct`.** ◆G7 is **not** formally closed —
this was a call to unblock testing, made on cost and retrieval evidence with quality still
ungraded. Do not record it in the gate table until the packet is scored.

Reasoning, so it can be revisited rather than re-derived:

- The cost spread is noise. $6.15 vs $4.33/month at 10k requests. Two dollars should not decide.
- Retrieval reliability is not noise: **7.1% miss vs 33.9%**. Direct-feed had the right material
  in 100% of turns in 10 of 11 question classes. Going into N3–N6 you want retrieval to stop being
  a variable while sensor tools and reports are debugged.
- It deletes a subsystem — no embeddings, no vector index, no chunk seeding, no re-embedding on
  corpus change.

What it costs: direct-feed cannot reach the long manuals (`deep-in-manual`, 33% vs 67%/83%). Three
fixtures. **That single class is the entire case for keeping a RAG arm**, and it makes the split
outcome §8 of `RETRIEVAL_BAKEOFF.md` anticipated — direct-feed the authoritative tier, RAG the
manuals — the most likely honest final answer.

**Two things that would flip this**, both worth re-checking before committing for real:

1. **N6's document upload/delete feature.** Direct-feed's slice grows unbounded as documents are
   added; that is precisely what vector search exists to handle.
2. **A model change to `gpt-oss-120b`.** Its 90.7% cached-input discount makes direct-feed ~3.7×
   cheaper on input and inverts the ranking. Re-run `npm run cost` if `LLM_MODEL` ever moves.

`firestore-vector` stays registered and costs nothing to keep — it runs on the datastore the
service already uses, so switching is one env var.

## 4. The measured results

Warm pass, 58 turns/arm, `gpt-oss-20b`, temperature 0, `CORPUS_SOURCE=firestore`.

| | firestore-direct | pgvector-rag | firestore-vector |
|---|---:|---:|---:|
| Prompt tokens/turn | 11,023 | 3,976 | 3,498 |
| Cache hit | 99.0% | 42.6% | 34.5% |
| Cost/answer (760 compl.) | $0.000615 | $0.000447 | $0.000433 |
| $/mo @ 10k | $6.15 | $12.14 | **$4.33** |
| $/mo @ 100k | $61.53 | $52.39 | **$43.35** |
| Retrieval miss rate | **7.1%** | 53.6% | 33.9% |
| Over-refusals (of 58) | 2 | 11 | **1** |
| p50 TTFT | 2.08s | 2.76s | 2.58s |

Per-class retrieval hit rate is in `RETRIEVAL_BAKEOFF.md` §4b. The row that matters:
`deep-in-manual` — direct 33%, pgvector 67%, vector 83%.

Facts that constrain how these may be reported:

- **All three pass the refusal-integrity hard gate.** Both turns demanding the exact refusal
  sentence refuse; neither turn that must be answered was over-refused.
- **Cold passes are not cold and could not be made cold.** A 20-minute idle failed to expire the
  Fireworks prompt cache (direct-feed's "cold" still measured 95.5% cached). **All analysis uses
  warm means.** A genuinely cold direct-feed price is unmeasured — use
  `npm run cost -- --cache-rate=0` for that worst case; never quote the cold column.
- **The p95 latency veto cannot be applied.** p50 is tight (2.08–2.76s) but p95 is
  noise-dominated and non-monotonic (an arm's warm p95 sometimes exceeds its cold). Report p50 and
  say why.
- **`pgvector-rag` is no longer a strict legacy port** (§4b). Label it an approximation wherever
  it appears.
- **Retrieval hit rate is not answer quality.** It measures whether the nominated document reached
  the prompt, nothing more.

## 5. The next task

> **Superseded 2026-08-25 — do not start here.** This section said "grade the blind packet", and
> that is no longer the next task: most of the packet grades an 8-document corpus that no longer
> exists. The revised sequence is **re-capture → automated gates → LLM judge**, specified in
> [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §8b and summarised in §0 above. The rest of this
> section is kept because the packet mechanics, the guide and the §7b protocol are all still
> correct for whatever *is* graded.
>
> ⚠️ **`npm run grade:packet` overwrites `scores.csv` unconditionally** (`scripts/gradePacket.ts`
> writes it with no existence check). Re-running it **destroys grading in progress** — it wiped the
> 36 completed calibration rows on 2026-08-25, recovered from git. Back up or commit `scores.csv`
> before ever re-running the packet builder. The line below used to call it "safe to re-run"; it is
> not.

**Grade the blind packet.** ~~Everything else in N2 is done.~~

```bash
npm run grade:packet                 # ⚠️ CLOBBERS scores.csv — commit it first
npm run grade:packet -- --sample=6   # 6-sheet calibration subset
```

- Packet: `eval/grading/warm/packet/` (28 sheets) · context in `context/` · score sheet
  `scores.csv` · `KEY.json` **opened only when scoring is complete**.
- Instructions: [`GRADING_GUIDE.md`](GRADING_GUIDE.md), written for a non-technical reader.
- Protocol (`RETRIEVAL_BAKEOFF.md` §7b): blind, arms shuffled. An LLM judge must be a **different
  model than `gpt-oss-20b`**, judge one dimension per call, and be calibrated against a ~20% human
  sample with the agreement rate reported.
- **Recommended, revised:** the 36 rows already scored from the 6-sheet subset are now the
  **human calibration sample** the LLM judge is measured against (§7b requires ~20% and an agreement
  rate), not a pass in their own right. Do not re-grade them by hand; the next human effort worth
  spending is on transcripts captured against the current corpus.
- The human sample was designed to come from a blind frontend harness (§7c:
  `GET /api/v1/retrieval/modes` + an arm selector). **That is not built.** The packet works
  standalone and is the cheaper path — build the harness only if you want non-technical testers
  exercising the bot in a browser.

Then: write `docs/RETRIEVAL_COMPARISON.md` (§10 lists required contents; most inputs already
exist), close ◆G7 in `timeline.md`'s gate table. ~~Delete the pgvector sidecar per §9.~~

> **Update 2026-08-19 — the pgvector work is done, out of order.** The arm's runtime code was
> **archived** (not deleted) to `archive/pgvector-rag/` **ahead of ◆G7, by decision**; the gate is
> still open on exactly the two items above. Grading is unaffected: the transcripts,
> `eval/grading/warm/KEY.json`, the arm's cost scenario and its row in `scripts/gradePacket.ts` all
> stayed live, so `npm run grade:packet` and `npm run cost` are unchanged and still cover three arms.
> `SPECS.md` §14 holds the arm's findings and what restoring it would take.

## 6. Runbook

> **Stale since 2026-08-19 in one respect:** the pgvector sidecar lines below no longer run — the
> arm is archived to `archive/pgvector-rag/` and `PGVECTOR_URL` is not a configuration variable any
> more. They are kept struck through because they are what the captured sweep ran under. Everything
> else in this runbook still applies to the two live arms.

```bash
# pgvector sidecar — ARCHIVED 2026-08-19; needs the files restored from archive/pgvector-rag/ first
# (dev-only; NOT `docker compose` — the plugin is not installed)
# docker-compose -f docker-compose.bakeoff.yml up -d
# docker-compose -f docker-compose.bakeoff.yml down

# service with every bake-off setting (do NOT rely on .env — it lacks these)
DEBUG_RETRIEVAL=true CORPUS_SOURCE=firestore \
LLM_MAX_TOKENS=16384 LLM_TEMPERATURE=0 PORT=8000 npm run dev
# the sweep also passed PGVECTOR_URL=postgresql://cer:cer@localhost:5433/cer_bakeoff — archived

npm run bakeoff -- --arm=<mode> --spot-check
npm run bakeoff -- --arm=<mode> --pass=<cold|warm>
npm run cost                  # pure arithmetic, no network, free
npm run grade:packet
```

**Environment gotchas, every one of which cost time:**

- **`.env` does not contain the bake-off settings.** `DEBUG_RETRIEVAL=false` and
  `CORPUS_SOURCE=artifact` there. Pass them on the command line. With `DEBUG_RETRIEVAL=false` the
  registry **silently ignores** the arm override and serves the default.
- **The runner records `corpusSource` from its own process config** (`scripts/bakeoff.ts:112`), not
  the server's. Pass the same env to `npm run bakeoff` or transcripts are mislabelled. Unfixed
  papercut; worth fixing properly.
- **`ts-node` cold start is ~80s.** `npm run dev` looks hung and is not.
- **Never `pkill -f "src/index.ts"`** — it matches your own shell and kills it. Use
  `pkill -f "[t]s-node-dev"`.
- **Verify env with `/proc/<pid>/environ`, not a test request** — a request warms the prompt cache
  and destroys a cold pass.
- Firestore uses ADC (`~/.config/gcloud/application_default_credentials.json`, project
  `cer-demo-2026`). Configured and verified.
- **Only *some* `documents/*.pdf` are tracked, despite the `.gitignore` rule.** The five Tier 1
  files (the ◆G9 direct-feed slice) and the two USGS chapters that predate the rule are tracked;
  the other eleven documents added on 2026-08-21 are not. So a deleted PDF is recoverable with
  `git checkout --` *if it is one of the seven* — `git ls-files documents/` is the check, not
  `ls`. (This came up for real: two USGS manuals were deleted and restored.)

## 7. ~~Uncommitted right now~~ — SUPERSEDED 2026-08-13

> **This describes a working tree that no longer exists.** Those five doc files were committed; the
> `git add`/`git commit` lines below must not be run. Kept as the record §8 item 2 points at. Run
> `git status --short` for what is actually uncommitted.

```
 M README.md            grade:packet script; corrected project layout
 M docs/SPECS.md        status header, file tree, test count, §14a/§14b corrections
 M docs/timeline.md     old handoff marked SUPERSEDED; arm-table correction
 M documents/README.md  full rewrite (it referenced the deleted Python stack)
 M eval/README.md       transcripts/ and grading/ documented
```

Docs only, no code. `npm test` 234/234, typecheck clean, lint clean.

```bash
git add README.md docs/SPECS.md docs/timeline.md documents/README.md eval/README.md
git commit -m "docs: refresh stale corpus, eval, and status documentation"
```

## 8. Open decisions for a human

1. **Who grades, and is the frontend harness built?** (§5.) The one thing blocking ◆G7.
2. ~~**Merge `feat/device-api` into `feat/bakeoff-sweep`?**~~ **Done 2026-08-13** — merged at
   `fa299ef`, conflict-free. Phase N3's tool layer was then built on top. §2's branch table and §7's
   uncommitted list are both stale from that point on.
3. **Does `pgvector-rag` stay in the comparison?** It worked at capture time but is no longer a
   strict legacy port (§4b), so its role as "what we had before" is compromised.
   **Partly settled 2026-08-19:** the arm is **archived**, and its captured results **stay in the
   comparison** — transcripts, grading key and cost scenario are all live, and `npm run cost` still
   prices three arms. What is settled is that it will not be re-run: re-capturing it now requires
   restoring `archive/pgvector-rag/`, and the pinned prompt means a re-capture would void the other
   two arms unless they are re-run as well. What is still open is **how much weight** the §4a
   dead-lexical-branch caveat leaves its numbers in `RETRIEVAL_COMPARISON.md`.
4. **Commit or git-ignore `eval/grading/`?** 4.1 MB, regenerable. Currently committed, on the
   argument that the packet a human graded against should be recoverable exactly.
5. **◆G11** — does `search_documents` return as a tool? The dead-lexical-branch finding (§4a)
   quantified a real cost of up-front retrieval and belongs in that decision.
6. **Three operator questions** from the device-API work (`migration/DEVICE_API.md` §12): Algalita
   reads 54,100–60,200 µS/cm against a stated saltwater range of 40,000–50,000; does the
   `0–25 NTU` range apply to the derived/uncalibrated turbidity index; is Old Woman Creek's silence
   since 2026-08-07 expected.

## 9. Traps — things that fail silently

- **`max_tokens` at 4096 truncates answers to empty.** The API call *succeeds*. This invalidated an
  entire first sweep. Keep **16384** for any capture run.
- **`LLM_TEMPERATURE` must stay 0**, and the **system prompt is a pinned control** — changing it
  after an arm has run voids that arm. Re-run every arm instead.
- ~~**Do not build the tool-calling loop before N2 closes.**~~ **Resolved 2026-08-13.** It is built,
  gated on **`SENSOR_TOOL` (default off)**, so the default prompt stays byte-identical to the one
  the arms ran against — pinned by a SHA-256 in `test/unit/prompt.test.ts`, and no `tools` array is
  sent when the flag is off. The trap that remains: **do not capture bake-off arms with the flag
  on**; turning it on logs a startup warning for that reason.
- **0 is a valid reading** for ORP and turbidity. Never falsy-check a metric value.
- **Fireworks' embeddings endpoint silently returns a 192-element all-zero vector** without
  `encoding_format: "float"`. Guards for dimension *and* all-zero are in `EmbeddingService`. Do not
  remove either.
- **Firestore vector writes must use `FieldValue.vector()`.** A plain `number[]` writes an array,
  the index never matches, and `findNearest` returns nothing **with no error**.
- **A blind shuffle can look right per-sheet while the set leaks the mapping.** The first grading
  packet put one arm at label A in 22 of 28 sheets. `unit/gradePacket.test.ts` guards the balance.
- **Device-API temperature units differ per endpoint** (°F from `/water/last` and `/water/average`,
  raw °C from `/water/period`) and **an empty window returns zeros for all six metrics**, not an
  error. Both are guarded in `src/devices/` on `feat/device-api`; see `DEVICE_API.md` §12.

## 10. Cleanup

A dev server may still be running:

```bash
pkill -f "[t]s-node-dev"
```

At the time of writing a pgvector sidecar could also be up, cleaned with
`docker-compose -f docker-compose.bakeoff.yml down`. **Since 2026-08-19 that compose file lives in
`archive/pgvector-rag/`**; if a container from an old session is still running, stop it by name with
`docker ps` / `docker stop` rather than restoring the archive.
