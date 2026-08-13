# Session Handoff — 2026-08-12

Everything a new session or agent needs to resume this work cold. Written at the end of the
session that captured the Phase N2 bake-off sweep and built the Phase N3 device-API data layer.

**Read first:** [`timeline.md`](timeline.md) (phases + gates) · [`SPECS.md`](SPECS.md) (what's built)
· [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) (the experiment, §4a/§4b are new)

---

## 1. State in one paragraph

Phase N1 is complete. **Phase N2's bake-off is captured and valid but ungraded** — three retrieval
arms have been swept over 28 conversations (58 turns each, 2 passes, zero failures), the cost model
runs on measured numbers, and a blind grading packet is built and waiting for a human. ◆G7 cannot
close until that grading happens. Separately, a **detour built the Phase N3 device-API read layer**
(client, metric decoding, live exploration) on its own branch; the tool-calling loop was
deliberately not built because it would void the bake-off's pinned prompt.

## 2. Branches — important, the work is split

| branch | contains | state |
|---|---|---|
| `feat/bakeoff-sweep` | N2: sweep transcripts, measured cost model, lexical-branch repair, grading packet | **current branch**, has uncommitted work (§7) |
| `feat/device-api` | N3: `DeviceApiClient`, metric decoding, `explore:devices`, `DEVICE_API.md` | committed and pushed, 2 commits |
| `demo` | both branches' common ancestor | `f0131b2` |

The two branches do **not** contain each other's work. `npm test` reports different totals
depending on which you are on: 234 on `feat/bakeoff-sweep`, 273 on `feat/device-api`.

## 3. What happened this session

### Phase N2 — the sweep

- **Ran the bake-off twice.** The first run was **discarded**: `LLM_MAX_TOKENS=4096` was exhausted
  by gpt-oss reasoning tokens on 16 turns, unevenly (direct-feed lost 2, pgvector 11), which would
  have graded arms on different subsets. Raised to **16384** — uniform across arms, so
  comparability holds — and re-ran. Second run: **58/58 turns per arm, zero failures.**
- **Cold passes are not cold and could not be made cold.** A 20-minute idle failed to expire the
  Fireworks prompt cache; direct-feed's "cold" still measured 95.5% cached. **All analysis uses
  warm-pass means.** A genuinely cold direct-feed price is unmeasured — use
  `npm run cost -- --cache-rate=0` for that worst case rather than quoting the cold column.
- **Fed measured tokens into the cost model.** `TOKEN_PROVENANCE` is now `"measured"`,
  `PROJECTED_ARMS` is empty. Two pinned tests failed when the real numbers landed and were updated
  with reasons recorded — that is the tests working, not breaking.
- **Found and repaired a validity threat**: `pgvector-rag`'s lexical branch was dead on 78% of
  questions (§4a/§4b of `RETRIEVAL_BAKEOFF.md`). Repaired, re-ran that arm alone, re-analysed.
- **Built the blind grading packet** and `GRADING_GUIDE.md` for a human judge.

### Phase N3 — the device API detour (on `feat/device-api`)

Read-only client for the real Clean Earth backend, verified live against production. Full contract,
credentials, and findings in [`migration/DEVICE_API.md`](migration/DEVICE_API.md). Headlines:

- **Test pods confirmed**: `Algalita Pod` = `dev:351077454569099` (salt-water, reporting) and
  **`Old Woman Creek 2026`** = `dev:351077454567580` (fresh-water, stale since 2026-08-07). The
  string "OWC" appears nowhere — the acronym matches nothing.
- **Temperature's unit varies by endpoint** (°F from `/water/last` and `/water/average`, raw °C
  from `/water/period`). Normalized in the decoder.
- **An empty window returns zeros for all six metrics**, not an error — indistinguishable from
  anoxic water at pH 0 without a guard. Guarded via `DeviceAverages.empty`.
- **The two test pods are different water types**, so the global `WATER_TYPE` env var cannot serve
  both. Must become per-device metadata — Phase N4, and an input to ◆G3.

## 4. The bake-off results as they stand

Warm pass, 58 turns per arm, `gpt-oss-20b`, temperature 0, `CORPUS_SOURCE=firestore`.

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

- `firestore-vector` is **cheaper than both others at every volume** in the 1k–100k range.
- `firestore-direct` overtakes `pgvector-rag` on cost above **45,613 requests/month**.
- **All three pass the refusal-integrity hard gate** (the 2 turns demanding the exact refusal
  sentence refuse; neither of the 2 turns that must be answered was over-refused).
- Latency: **p50 is tight (2.08–2.76s); p95 is noise-dominated and non-monotonic** (an arm's warm
  p95 sometimes exceeds its cold). §8a's 1.5s p95 TTFT veto **cannot be applied** to this data —
  report p50 and say so.
- **`deep-in-manual` is the only class direct-feed loses** (33% vs 67%/83%), and it loses
  structurally because ◆G9's slice excludes the long manuals. That single row is the whole case for
  keeping a RAG arm, and makes §8's anticipated **split outcome** the most likely honest reading.

**None of this is answer quality.** Retrieval hit rate measures whether the nominated document
reached the prompt, not whether the answer was right.

## 5. The immediate next task

**Grade the packet.** Everything else in N2 is done.

```bash
npm run grade:packet          # already built; safe to re-run, labels are stable
```

- Packet: `eval/grading/warm/packet/` (28 sheets), context in `context/`, score sheet `scores.csv`,
  and `KEY.json` which the judge opens **only when scoring is complete**.
- Instructions: [`GRADING_GUIDE.md`](GRADING_GUIDE.md) — written for a non-technical reader.
- Protocol (`RETRIEVAL_BAKEOFF.md` §7b): blind, arms shuffled. If an **LLM judge** does the bulk,
  it must be a **different model than `gpt-oss-20b`**, judge one dimension per call, and be
  calibrated against a ~20% human sample with the agreement rate reported.
- The human calibration sample is meant to come from the blind frontend harness (§7c:
  `GET /api/v1/retrieval/modes` + an arm selector in `frontend/index.html`). **That is not built.**
  Either build it, or collect the human sample directly from the packet — the packet works
  standalone and is the cheaper path.

Then: write `docs/RETRIEVAL_COMPARISON.md` (§10 lists required contents), close ◆G7 in
`timeline.md`'s gate table, and delete the pgvector sidecar per §9.

## 6. Runbook — how to actually run things

```bash
# pgvector sidecar (dev-only; NOT `docker compose`, the plugin isn't installed)
docker-compose -f docker-compose.bakeoff.yml up -d
docker-compose -f docker-compose.bakeoff.yml down

# service, with every bake-off setting (do NOT rely on .env — it lacks these)
DEBUG_RETRIEVAL=true CORPUS_SOURCE=firestore \
PGVECTOR_URL=postgresql://cer:cer@localhost:5433/cer_bakeoff \
LLM_MAX_TOKENS=16384 LLM_TEMPERATURE=0 PORT=8000 npm run dev

# capture
npm run bakeoff -- --arm=<mode> --spot-check
npm run bakeoff -- --arm=<mode> --pass=<cold|warm>

npm run cost                  # cost table; pure arithmetic, no network, free
npm run grade:packet          # blind grading packet
```

**Environment gotchas, all of which cost time this session:**

- **`.env` does not contain the bake-off settings.** `DEBUG_RETRIEVAL` is `false` and
  `CORPUS_SOURCE=artifact` there. Pass them on the command line. If `DEBUG_RETRIEVAL` is false the
  registry **ignores** the arm override and silently serves the default — the runner aborts on
  mismatch, but only after wasting the run.
- **The runner records `corpusSource` from its OWN process config** (`scripts/bakeoff.ts:112`), not
  the server's. Pass the same env to the `npm run bakeoff` process or transcripts are mislabelled.
  This is an unfixed papercut worth fixing properly.
- **`ts-node` cold start is ~80s.** `npm run dev` looks hung and is not.
- **Don't `pkill -f "src/index.ts"`** — the pattern matches your own shell and kills it. Use
  `pkill -f "[t]s-node-dev"`.
- **Verify env took effect** by reading `/proc/<pid>/environ`, not by sending a request — a request
  warms the prompt cache and destroys a cold pass.
- Firestore uses ADC (`~/.config/gcloud/application_default_credentials.json`, project
  `cer-demo-2026`). Already configured and verified.

## 7. Uncommitted work on this branch

```
 M docs/RETRIEVAL_BAKEOFF.md              §4a/§4b: the dead lexical branch and its repair
 M src/retrieval/adapters/PgVectorRagAdapter.ts   the repair
 M test/unit/pgvectorRag.test.ts          4 tests pinning OR-not-AND
 M src/eval/costScenarios.ts              repaired pgvector token profile
 M test/unit/cost.test.ts                 two conclusions moved, reasons recorded
 M package.json                           grade:packet script
 M eval/transcripts/{cold,warm}/pgvector-rag/*.json   56 files, re-captured after repair
?? docs/GRADING_GUIDE.md
?? scripts/gradePacket.ts
?? test/unit/gradePacket.test.ts
?? eval/grading/                          4.1 MB, regenerable via npm run grade:packet
```

`npm test` 234/234, `npm run typecheck` clean, `npm run lint` clean.

## 8. Open decisions for a human

1. **Who grades, and does the frontend harness get built?** (§5.) Biggest open item.
2. **Does `pgvector-rag` stay in the comparison?** It is now a *working* hybrid but **no longer a
   strict legacy port** — the repair replaced `websearch_to_tsquery` with OR'd lexemes, and
   `ts_rank_cd` is not BM25. It must be labelled as an approximation wherever it is reported.
3. **Commit the 4.1 MB `eval/grading/`, or git-ignore it?** It regenerates from transcripts. Argument
   for committing: the packet a human graded against should be recoverable exactly.
4. **◆G11** — does `search_documents` return as a tool? The dead lexical branch quantified a real
   cost of up-front retrieval; that evidence belongs in this decision.
5. **Three operator questions** from the device-API work (`DEVICE_API.md` §12): Algalita reads
   54,100–60,200 µS/cm against a stated saltwater range of 40,000–50,000; does the `0–25 NTU` range
   apply to the derived/uncalibrated turbidity index; is Old Woman Creek's 5-day silence expected.

## 9. Things that will bite you

- **`max_tokens` at 4096 silently truncates answers to empty.** The API call *succeeds*. Keep
  16384 for any sweep.
- **`LLM_TEMPERATURE` must stay 0** and the **system prompt is a pinned control** — changing it
  after an arm has run voids that arm's results. Re-run every arm instead.
- **Do not build the tool-calling loop before N2 closes.** It requires a tool block in the system
  prompt, which voids the arms.
- **0 is a valid reading** for ORP and turbidity. Never falsy-check a metric value.
- **Fireworks' embeddings endpoint silently returns a 192-element all-zero vector** without
  `encoding_format: "float"`. `EmbeddingService` guards both the dimension and the all-zero case.
  Do not remove either guard.
- **Firestore vector writes must use `FieldValue.vector()`.** A plain `number[]` writes an array,
  the index never matches, and `findNearest` returns nothing **with no error**.

## 10. Cleanup

The dev server and pgvector sidecar may still be running from this session:

```bash
pkill -f "[t]s-node-dev"
docker-compose -f docker-compose.bakeoff.yml down
```
