# Staleness cleanup — 2026-08-24

A sweep for text that no longer describes the system: statements the code contradicts, references
to files and commands that no longer exist, counts superseded by later work, warnings about
conditions since fixed, and abandoned decision paths recorded as if live.

**Scope note.** This ran as four parallel agents. Three were cut short by an account session
limit part-way through. What that means for this document is stated plainly in §4 — the
documentation pass is **complete in its edits but was never self-reported**, and the code pass
**barely started**. Do not read this as a finished audit.

Companion docs: [`SPECS.md`](SPECS.md) (what is built), [`timeline.md`](timeline.md) (phases and
gates), [`EVAL_FIXTURE_QUALIFICATION.md`](EVAL_FIXTURE_QUALIFICATION.md) (the parallel fixture
audit), [`EVAL_FIXTURES_NEXT.md`](EVAL_FIXTURES_NEXT.md) (the proposed next question set).

---

## 1. What drove almost all of it

Two changes landed without the surrounding prose being revisited, and between them they account
for most of what was found:

- **The 2026-08-21 corpus expansion** — 8 documents / ~716K chars → **18 documents / ~1.25M chars
  / 558 chunks**. Document counts, chunk counts, token estimates, per-arm cost inputs and corpus
  descriptions were stale in six files.
- **Phases N4–N6 landing behind flags** — report generation, the quota layer, per-metric
  plausibility rails and the N5 chat-UX work are all in the tree, while `README.md` still said
  "N4+ … not started" and the project layout omitted `src/report/`, `src/quota/`,
  `src/devices/plausibility.ts`, `ReportController`, `reportRoutes` and `generateReport`.

A third, smaller driver: several documents were written while something was deliberately *not*
built (the tool loop, the report pipeline) and never updated once the blocker lifted.

---

## 2. Documentation — edits made

Eleven files. Full text is in `git diff`; this is the summary of what changed and why.

| file | what was corrected | evidence |
|---|---|---|
| `README.md` | N4+ status row rewritten; `REPORT_TOOL` config section added; `GET /api/v1/reports/:filename` added to the endpoint table with its auth caveat; project layout brought up to the real `src/` tree; chunk count 305 → **558**; test count 491/24 → **720/36**; `explore:fields` / `explore:surface` scripts added; the boot-artifact and `WATER_TYPE` limits re-scoped to say what is now handled in code | `src/` tree, `src/config/index.ts`, `src/devices/plausibility.ts`, `npm test` |
| `docs/timeline.md` | corpus figures corrected to 18 docs / 1,254,899 chars / ~314K tokens, with the 2026-07-29 figures retained and dated as what the sweep ran against; N4/N5/N6 given status blocks marking what has landed; the "tool loop deliberately not built" note corrected to say it landed two days later behind `SENSOR_TOOL` | `src/ingestion/corpus.ts`, `data/corpus/corpus.json`, `src/report/`, `src/tools/generateReport.ts` |
| `docs/SPECS.md` | header no longer claims "as of Phase N1"; Firestore no longer described as "client constructed, not yet queried"; file tree and module list brought current | `src/` tree |
| `docs/HANDOFF.md` | §2 branch table and §7 uncommitted list **marked superseded in place** rather than rewritten, with a header pointing at `SPECS.md`/`timeline.md` for current state; the "tool loop deliberately not built" paragraph corrected; the "documents/*.pdf are tracked despite .gitignore" claim corrected | `git ls-files documents/`, `git check-ignore` |
| `docs/RETRIEVAL_BAKEOFF.md` | corpus size and chunk-count inputs corrected; §11's "not now, not on this branch" deferral removed as spent | `src/ingestion/corpus.ts`, `data/corpus/corpus.json` |
| `docs/EVAL_FIXTURES.md` | §5 retitled from "One blocker left" — `sensor-tool` is built, not missing, and is gated on a default-off flag; runnable set restated as 28/30 with the flag off and 30/30 with it on | `src/eval/fixtures.ts`, `src/config/index.ts` |
| `eval/README.md` | fixture row restated in the same terms | same |
| `docs/CHAT_UX_WORKPLAN.md` | test counts corrected; the `【commentary…】` follow-up updated to reflect what shipped | `npm test`, `src/` |
| `docs/migration/MIGRATION_SPEC.md` | reframed as a record of a **retired** system — "Stack (current)" → "Stack (as it was)"; §10.2 sensor CSV marked retired and never ported; the migration checklist given a status block explaining why the boxes stay unticked | ◆G8 in `timeline.md`, absence of the Python source |
| `docs/migration/DEVICE_API.md` | header no longer describes `query_sensor_data` as unbuilt; a "not a change to make now" note resolved | `src/tools/querySensorData.ts` |
| `documents/README.md` | the "⚠️ Five files are missing from this checkout" block **inverted** — the five Tier 1 PDFs are present and force-tracked; the ingest trap it protected is preserved as a positive instruction | `git ls-files documents/`, `data/corpus/corpus.json` |

The `documents/README.md` correction is the most consequential: the file opened by telling a
reader the direct-feed slice was absent, when it is present and tracked. Anyone acting on it would
have gone looking for files they already had.

---

## 3. Code and artifacts — edits made

Much smaller, because this pass was cut short. What was completed:

| change | evidence |
|---|---|
| **Deleted `.pytest_cache/`** | Orphan from the retired FastAPI stack. Untracked (`git ls-files` empty), git-ignored (`.gitignore:33`), and the live tree contains **no** `.py` file, `requirements*.txt`, `pyproject.toml`, or any reference to pytest outside that one ignore rule. |
| `.env.example` — added `WATER_TYPE`, **commented out**, with its caveat | Real drift: `src/config/index.ts:401` reads it and `README.md` §5 documents it, but `.env.example` never mentioned it. Left commented rather than set because flipping it rewrites the conductivity and turbidity ranges in every grounded answer, and the two cleared pods are different water types. |
| `src/retrieval/sources/FirestoreCorpusSource.ts` — dated the Firestore document-size measurement | The 96%-of-limit figure was measured on `volunteer_stream_monitoring_a_methods_manual.pdf`, which left the corpus on 2026-08-21. The rule still holds and is a property of the schema, so the measurement is marked historical rather than deleted. |

### Verified and deliberately left alone

- **Every `pgvector-rag` reference in the live tree.** Checked all 34. They are retained evidence
  (cost scenarios, `scripts/gradePacket.ts`, the transcripts) or comparative comments explaining
  the surviving vector arm's design. `README.md` §6 and `eval/README.md` state the retention rule.
- **`scripts/cost.ts:144`'s "arm not yet built" legend.** Already guarded by
  `if (PROJECTED_ARMS.length > 0)`, with a comment saying exactly why. Not stale.
- **`.env.example` ↔ `src/config/index.ts`.** Walked both. No orphans in either direction;
  `PGVECTOR_URL` is confirmed gone from config, scripts, tests and the example file.
- **The `.gitignore` pytest rule (line 33).** A judgment call rather than an oversight: the rule
  is dead config for a toolchain that is gone, but it costs nothing and removing it means a future
  stray Python tool silently produces tracked junk. Flagged, not removed — say the word either way.

---

## 4. What did **not** happen, and what it costs

Three of the four agents hit an account session limit mid-run. Stated plainly:

- **The code pass barely started.** It established a clean baseline (tsc 0 errors, lint clean,
  720 tests in 36 suites passing) and then stopped. Its lead list was worked through manually
  afterwards only as far as §3 records. **Not yet swept:** per-file comment review across
  `src/services/`, `src/tools/`, `src/prompt/`, `scripts/`, `frontend/` and `test/` for comments
  written while those pieces were behind flags or unbuilt. That is the largest remaining gap.
- **The documentation pass finished its edits but never wrote its own report.** §2 above was
  reconstructed by reading the diff, not from the agent's account of itself. The edits were
  reviewed and are sound; the reconstruction may miss a minor change.
- **`.ocr_cache/ambient-wqc-dissolved-oxygen-1986.pdf.txt` is orphaned** — that document is not in
  `DOC_META`. **Deliberately not deleted.** `.ocr_cache/` is git-ignored, so the file does not
  travel with the repo and a deletion is unrecoverable without re-running OCR. Needs a human.

## 5. Unresolved — needs a person

1. **The `.gitignore` pytest rule** (§3). Keep as cheap insurance, or remove as dead config?
2. **The orphaned OCR cache file** (§4). Delete, or keep in case the 1986 DO reference returns?
3. **`docs/CORPUS_SOURCING_BRIEF.md` is untracked and lists four documents "under review for
   removal."** Three of those four are defensible cuts on measured six-parameter density
   (`epa-assessing-monitoring-floatable-debris` 0.8 mentions/10K chars,
   `noaa-nhabon-framework-workshop-report` 1.1, `epa-wqs-handbook-ch3` 3.8). The fourth,
   `usgs-nfm-a6.6-alkalinity`, measures **19.0 per 10K — 129 of them pH** — denser than
   `usgs-nfm-a6.0`, which nobody proposes cutting. The brief's grouping should be corrected before
   anyone acts on it.
4. **Whether `docs/HANDOFF.md` should survive at all.** It is a dated session record whose live
   content (§3, §4, §5, §9) duplicates `SPECS.md` and `timeline.md`, while `README.md` still sends
   every new reader there first. Marking two sections superseded was the conservative fix; the
   real question is whether it should be retired into `timeline.md`.
