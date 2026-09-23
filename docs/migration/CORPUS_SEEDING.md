# Corpus seeding runbook

Written 2026-09-17 for `GILLIGAN_TARGET_ARCHITECTURE.md` §4, R5 ("corpus seeded into their Firestore").
This is a runbook, not a decision memo: it assumes the corpus content itself is already settled and only covers getting it into a Firestore project an upstream owner controls.
It is written so an upstream owner with IAM on their project, but no context on this repository, can run it without asking anyone what a step means.

Everything below was checked against the code as of `1a8c744`; re-check the file paths and script names if this runbook is used much later.
Recovered on 2026-09-22 after the old machine's commits were lost (tag `old-machine-recovery-2026-09-19`).
The corpus was rebuilt on 2026-09-21, so check the document list below against `WSL_SANDBOX.md` §4 and `../../documents/README.md` before seeding.

## 0. What is being seeded, and what is not

> **Superseded in part by D7 (2026-09-21).** Production retrieval is now `hybrid-slice-vector`
> (`GILLIGAN_TARGET_ARCHITECTURE.md` §7), not `firestore-direct`. Its slice half still comes from
> `corpus_documents` under `CORPUS_SOURCE=firestore`, so this runbook's seed still applies. Its dense
> half is `LocalVectorAdapter`, which reads `data/embeddings/cache.json` from the deployed image's
> disk, not Firestore: that file must be built with `npm run embed:cache` (paid) and shipped with
> the service, and the query path needs `FIREWORKS_API_KEY` to embed each question. The paragraphs
> below describe the direct-feed-only design this runbook was written for.

Production reads the corpus through `DEFAULT_RETRIEVAL=firestore-direct` (`src/retrieval/adapters/DirectFeedAdapter.ts`), which loads its documents from whichever `CorpusSource` `CORPUS_SOURCE` names.
With `CORPUS_SOURCE=firestore` that source is `FirestoreCorpusSource` (`src/retrieval/sources/FirestoreCorpusSource.ts`), which reads the **`corpus_documents`** collection.
That collection is written by exactly one script: `npm run seed:firestore` (`scripts/seedFirestore.ts`).

**`npm run embed:cache` and `npm run seed:firestore-chunks` are not part of this path.**
They populate a separate `corpus_chunks` collection for the `firestore-vector` retrieval arm, which `GILLIGAN_TARGET_ARCHITECTURE.md` §3 keeps for evaluation only, not production.
An earlier draft of this task's instructions named that sequence for R5; it is the eval bake-off's seeding sequence, not the production one, and running it costs Fireworks embedding calls for a collection nothing in production reads.
Run `grep -n "seed:firestore-chunks\|embed:cache\|ingest" package.json` to confirm these commands exist if you want to double-check this claim; do not run the two chunk-related ones for this task.

## 1. What must reach the seeding machine

A fresh `git clone` of this repository does not carry everything `npm run seed:firestore` needs.

| item | tracked in Git? | needed for |
|---|---|---|
| `data/corpus/corpus.json` | no, gitignored | the only file `seed:firestore` actually reads (via `readCorpus()`) |
| `documents/EC_K_1.0_probe.pdf`, `IORP_probe.pdf`, `Industrial-DO-probe.pdf`, `IpH_probe.pdf` | yes (`git add -f`) | regenerating the artifact with `npm run ingest`; these four are the whole direct-feed slice |
| `documents/usgs-nfm-a6.2-dissolved-oxygen.pdf`, `usgs-nfm-a6.8-multiparameter-instruments.pdf` | yes (`git add -f`) | regenerating the artifact; reference tier, not in the slice |
| the other untracked PDFs under `documents/` (nine files: `usgs-nfm-a6.0` through `a6.7` except `a6.2`, plus `epa-sop-field-instrument-calibration-2010.pdf`) | no, gitignored | regenerating the artifact; reference tier, not in the slice |
| `.ocr_cache/epa-sop-field-instrument-calibration-2010.pdf.txt` | no, gitignored | regenerating the artifact; `epa-sop...pdf` is scanned and ingest hard-errors without this cache |
| `documents/_excluded/keyestudio-ks0414-turbidity-sensor.md`, `turner-turbidity-plus-sensor.md` | yes (`git add -f`), but outside the ingest path | only if the turbidity ingest chain (packet C8) has landed by then; confirm before assuming they are in the artifact |

**Two ways to get `data/corpus/corpus.json` onto the seeding machine, in order of preference:**

1. **Copy the artifact directly**, the same way `WSL_SANDBOX.md` §4 copies it into the sandbox.
   `seed:firestore` never touches `documents/` or `.ocr_cache/`, so if you already trust an existing `data/corpus/corpus.json` (built and reviewed in this checkout, or handed over by the user), copying that one file plus a clone of this repository is enough to run `npm run seed:firestore`.
   This is the faster and lower-risk path because it carries no dependency on OCR cache or PDF availability on the seeding machine.
2. **Regenerate it from source** with `npm run ingest`, if the corpus has changed since the last known-good artifact, or if you have no artifact you trust.
   This needs every row above present at the paths `npm run ingest` expects, run from the repository root.

Either way, confirm which one you did in whatever record this runbook's run gets (a chat message, a ticket, a commit message) — a seed from a copied artifact and a seed from a fresh ingest are different provenance for the same-looking collection.

## 2. Sequence

```bash
# Only if regenerating the artifact (path 2 above). Skip straight to the seed step
# if you are seeding a copied, already-trusted data/corpus/corpus.json.
npm run ingest
```

Read the line it prints:

```
direct-feed slice: 26,096 chars (~6,524 tokens)
```

**A `0 chars` slice means the four Tier 1 datasheets are missing from `documents/`.**
Ingest still exits 0 in that case — it is not a crash, it is a silent misconfiguration — and seeding from it would ship a corpus with no direct-feed content at all.
Do not proceed past a `0 chars` slice; go back to step 1's file list.

```bash
FIRESTORE_PROJECT_ID=<the upstream project id> \
FIRESTORE_DATABASE_ID='(default)' \
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
npm run seed:firestore
```

Read what it prints: document count, direct-feed slice document count, and the largest document's byte size against Firestore's 1,048,576-byte limit.
Compare the document count and slice count against what `npm run ingest` reported (or against the artifact's own `documents.length` and `inDirectFeedSlice` count, if you skipped ingest) — a mismatch means you seeded a different artifact than you meant to.

`--prune` (`npm run seed:firestore -- --prune`) deletes any `corpus_documents` entry the current artifact does not contain, in the same batch as the writes.
Use it on a re-seed of a project that has been seeded before; skip it on a first seed into an empty collection, where there is nothing to prune.

## 3. Credentials and IAM, without printing any

**`npm run ingest` needs no credentials at all.** It is local file parsing; it never opens a network connection.

**`npm run seed:firestore` needs Firestore write access on the target project.** Two ways to authenticate, both documented in `README.md` §2b:

- `gcloud auth application-default login`, for a human running this interactively.
- `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json` pointing at a downloaded service-account key, for a non-interactive or CI run. Never commit this file; it is already gitignored.

**The IAM principal (the logged-in account or the service account) needs, at minimum:**

- `roles/datastore.user`, to read and write documents in `corpus_documents`. `roles/owner` also works but grants far more than this task needs.
- `roles/datastore.indexAdmin` (or owner), once, only if the composite index in the next paragraph does not already exist on the target project and database.

**A one-time composite index is required before the seeded data is queryable**, not before it is writable — the write in step 2 will succeed even without it, and the failure only shows up later, when the running service's direct-feed query fails outright.
`README.md` §2b gives the exact command:

```bash
gcloud firestore indexes composite create \
  --project="$FIRESTORE_PROJECT_ID" --database='(default)' \
  --collection-group=corpus_documents \
  --query-scope=collection \
  --field-config=field-path=inDirectFeedSlice,order=ascending \
  --field-config=field-path=filename,order=ascending
```

Confirm it reaches `READY` before trusting the post-seed check in §4:

```bash
gcloud firestore indexes composite list --project="$FIRESTORE_PROJECT_ID" --database='(default)'
```

**As of this writing, this account has no IAM grant on the upstream project** (`conductive-fold-343604`; `docs/migration/BACKEND_FIELDS.md` §0 — a live-read finding, carried over here as evidence, not re-checked in this packet).
Whoever holds IAM there — an upstream owner — either grants a scoped role to the account running this runbook, or runs it themselves.
This runbook does not assume which; it only assumes the two roles above exist on whoever runs it.

**Confirm `FIRESTORE_DATABASE_ID` with the upstream owner rather than assuming `(default)`.**
`(default)` is what this repository's own `.env.example` and `README.md` recommend, and what the "Always Free" quota historically favors, but the target project's actual production database id is the upstream owner's fact, not this repository's.

## 4. Post-seed verification

Run a query through the same adapter production uses, against the target project, and check it returns what you expect — not just that the write command exited 0.

```bash
FIRESTORE_PROJECT_ID=<the upstream project id> \
FIRESTORE_DATABASE_ID='(default)' \
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
npx ts-node -e "
import { FirestoreCorpusSource } from './src/retrieval/sources/FirestoreCorpusSource';
(async () => {
  const docs = await new FirestoreCorpusSource().loadSlice();
  console.log('slice size:', docs.length);
  console.log('filenames:', docs.map((d) => d.filename));
  const probe = docs.find((d) => d.filename === 'IpH_probe.pdf');
  console.log('IpH_probe.pdf found:', !!probe);
  console.log('expected snippet present:', !!probe?.text.includes('Double junction silver'));
})();
"
```

**Expected observable result**, against the corpus as ingested in this checkout on 2026-09-13: `slice size: 4`, filenames `EC_K_1.0_probe.pdf`, `IORP_probe.pdf`, `IpH_probe.pdf`, `Industrial-DO-probe.pdf` in alphabetical order (`FirestoreCorpusSource.loadSlice` orders by `filename` deliberately, so the prompt prefix stays byte-identical between runs), `IpH_probe.pdf found: true`, `expected snippet present: true`.
If the artifact seeded is not this one — for example after the turbidity ingest chain (C8) lands and changes the slice — expect a different slice size and filename list, and pick a different known document and snippet from whatever `npm run ingest` reported at seed time.

An empty `filenames` array with no error is the specific failure the missing composite index produces; `README.md` §2b: "without the composite index the direct-feed query fails outright" is closer to what a permissions or network error looks like, and a genuinely empty result (index present, zero documents) means the seed either did not run or wrote to a different project or database.

For higher-fidelity confirmation once the service itself is running against the target project (`CORPUS_SOURCE=firestore`, `DEFAULT_RETRIEVAL=firestore-direct`), ask a question the direct-feed slice alone can answer — for example, the pH probe's response time — and confirm the citation resolves to `IpH_probe.pdf`. This is optional; the script above is the required check because it needs no model call and no device API access.

## 5. Failure modes

| failure | how it shows up | how to catch it |
|---|---|---|
| `npm run ingest` exits 0 with an empty direct-feed slice | seeded corpus has a `corpus_documents` collection but every document has `inDirectFeedSlice: false`; the service answers every direct-feed question ungrounded, warning once in the server log and nowhere else | read the `direct-feed slice:` line ingest prints, every time, before seeding from that artifact |
| Seeding into the wrong project or database id | the write succeeds, the seeding script's own summary looks correct, and the failure is invisible until someone queries the *actual* target project and finds it empty or stale | echo `FIRESTORE_PROJECT_ID` and `FIRESTORE_DATABASE_ID` immediately before running `seed:firestore`, and run the §4 check against the same two variables, not against whatever `.env` happens to default to |
| A corpus artifact from a different chunking run | `corpus_documents` does not store `chunks` at all (`FirestoreCorpusSource.ts`, "deliberately not stored"), so this collection cannot itself go stale in the way the `firestore-vector` chunk collection can; the actual risk is seeding a `data/corpus/corpus.json` that is older or newer than the content everyone agreed on, e.g. missing the turbidity documents, or still containing a document that was since vetoed | before seeding a copied artifact, confirm its `generatedAt` field and document list against the corpus state recorded in `documents/README.md` for that date; when in doubt, regenerate with `npm run ingest` from a known-current `documents/` instead of trusting an inherited file |
| An oversized document | `seed:firestore` checks every document's size against Firestore's byte limit before writing any of them, and refuses the whole batch naming the offender, rather than failing partway through | nothing to catch manually; this is already handled by the script, named here so the error is recognized rather than mistaken for something else |

## 6. Scope note

This runbook covers getting a known corpus into a Firestore project.
It does not cover: deciding what belongs in the corpus (`../SPECS.md` §11, `documents/README.md`), the Cloud Run deployment of the service itself, or the Fireworks key the upstream owners create (`GILLIGAN_TARGET_ARCHITECTURE.md` §4, R5's other two items).
