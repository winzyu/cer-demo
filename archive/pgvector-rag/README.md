# `pgvector-rag` — archived bake-off arm

The Phase N2 `pgvector-rag` retrieval arm, archived (not deleted) on **2026-08-19**.

This was the legacy-parity arm: a port of the FastAPI + Postgres/pgvector hybrid retrieval the
service was migrated away from — dense `<=>` search plus a lexical `to_tsquery` branch, fused with
RRF. It ran the Phase N2 sweep alongside `firestore-direct` and `firestore-vector`.

## Why archived rather than deleted

It was the only baseline for "what we had before". Every other arm's result is a comparison
against it, so the code that produced the captured evidence should stay recoverable — a number in
`RETRIEVAL_COMPARISON.md` is only auditable while the thing that produced it can still be read.

It does not stay *live*, though. Keeping it registered re-introduces the whole Postgres stack ◆G1
migrated away from: a `pg` dependency, a `PGVECTOR_URL` config field, a compose file, a schema, a
seeder, and an adapter that has to keep compiling and passing lint every time the retrieval seam
changes. That is real upkeep for an arm nothing selects. So the runtime code moved here and the
evidence stayed where it was.

## What is *not* here, because it deliberately stayed live

These are ◆G7's audit trail and are still in the tree:

- `eval/transcripts/cold/pgvector-rag/` and `eval/transcripts/warm/pgvector-rag/` — the captured
  sweep transcripts, both passes.
- `eval/grading/warm/KEY.json` — the blind grading key, which maps `A`/`B`/`C` back to arm names
  and therefore names this one.
- The `pgvector-rag` entry in `src/eval/costScenarios.ts` — measured token profile and the Cloud
  SQL fixed-cost floor. The cost comparison is meaningless without the losing arm in it.
- The arm's name in the `ARMS` list in `scripts/gradePacket.ts` — the packet is built over the
  captured transcripts, which include this arm.

## These files are a frozen snapshot

Nothing here compiles, lints, or runs. `tsconfig.json` includes only `src/**`, jest's roots are
`src` and `test`, and lint runs against `src` — this directory is outside all three, and
`.dockerignore` excludes it from images.

Their imports still point at live paths (`../../src/...`) that no longer resolve. That is
deliberate: the files are kept byte-identical to what ran the sweep rather than rewritten to
compile in place, because a rewritten snapshot is no longer the thing that produced the evidence.
The one edit made on archiving was to `test/unit/pgvectorRag.test.ts`, whose `EmbeddingService`
block was moved to the live `test/unit/embeddingService.test.ts` — that service is still used by
`firestore-vector` and the chunk seeder, and its guards had to keep running.

Restoring the arm means restoring more than the files:

1. Move these back to their original paths (`src/config/pgvector.ts`, `src/retrieval/rrf.ts`,
   `src/retrieval/adapters/PgVectorRagAdapter.ts`, `scripts/seedPgvector.ts`, `db/bakeoff/schema.sql`,
   `docker-compose.bakeoff.yml`, `test/unit/pgvectorRag.test.ts`).
2. Re-add the `pg` dependency and the `@types/pg` devDependency.
3. Re-add the `PgVectorConfig` interface, the `pgvector` field on `Config`, and the
   `PGVECTOR_URL` read in `src/config/index.ts`.
4. Re-add the registry line and the `rrf` re-exports in `src/retrieval/index.ts`.
5. Re-add the `seed:pgvector` npm script.

## Runbook it used to carry

```
docker-compose -f archive/pgvector-rag/docker-compose.bakeoff.yml up -d
npm run seed:pgvector
PGVECTOR_URL=postgresql://cer:cer@localhost:5433/cer_bakeoff DEFAULT_RETRIEVAL=pgvector-rag npm run dev
```

`docker-compose`, not `docker compose` — the compose plugin may not be installed, and the
standalone binary is what this was run with.

## Known caveat: not a strict legacy port

After the **2026-08-12 lexical-branch repair**, this arm was no longer a faithful port of the
legacy behaviour. The original used `websearch_to_tsquery('english', $1)`, which ANDs every
content word; fed a whole user question — retrieval runs up front here rather than as a
model-composed tool call — it matched nothing on 36 of the eval's 46 questions, so the "hybrid"
arm ran dense-only through an entire sweep while looking healthy. The repair replaced it with an
OR of `to_tsvector` lexemes.

That fixed the arm but changed what it was measuring: a legacy-parity baseline that no longer
matches legacy. Read any result from it with that in mind. See `docs/RETRIEVAL_BAKEOFF.md` §4a
and §4b.
