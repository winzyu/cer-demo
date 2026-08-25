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
experiment; §4a and §4b are the newest and most important).

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
> left as written because §8 refers to them. Current test count: **720 in 36 suites**, all passing.

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

**Grade the blind packet.** Everything else in N2 is done.

```bash
npm run grade:packet                 # already built; safe to re-run, labels are stable
npm run grade:packet -- --sample=6   # 6-sheet calibration subset
```

- Packet: `eval/grading/warm/packet/` (28 sheets) · context in `context/` · score sheet
  `scores.csv` · `KEY.json` **opened only when scoring is complete**.
- Instructions: [`GRADING_GUIDE.md`](GRADING_GUIDE.md), written for a non-technical reader.
- Protocol (`RETRIEVAL_BAKEOFF.md` §7b): blind, arms shuffled. An LLM judge must be a **different
  model than `gpt-oss-20b`**, judge one dimension per call, and be calibrated against a ~20% human
  sample with the agreement rate reported.
- **Recommended:** do the 6-sheet subset first. ~45 minutes, and it tells you whether direct-feed's
  answers hold up before anyone spends 3–4 hours on the full set.
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
