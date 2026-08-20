-- Schema for the Phase N2 `pgvector-rag` arm.
--
-- A faithful port of the legacy service's schema (docs/migration/MIGRATION_SPEC.md §6), because
-- this arm exists to reproduce the legacy retrieval baseline exactly. DEV/EXPERIMENT ONLY —
-- dropped along with the sidecar once ◆G7 is resolved.
--
-- One deliberate omission: `sensor_data`. Sensor readings reach the model through the
-- `query_sensor_data` tool in *every* arm, unchanged, and holding that constant is what makes the
-- arms comparable (RETRIEVAL_BAKEOFF.md §1). Porting the table here would imply this arm has a
-- sensor path the others lack.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    id          SERIAL PRIMARY KEY,
    filename    TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    source_url  TEXT,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunks (
    id          SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content     TEXT NOT NULL,
    -- 768 dimensions: nomic-ai/nomic-embed-text-v1.5 (MIGRATION_SPEC.md §4.4). Changing the
    -- embedding model without changing this number fails at insert, which is the desired
    -- behaviour — a silent dimension mismatch would be far worse.
    embedding   VECTOR(768),
    -- Generated, not application-maintained: the lexical branch is only correct if every row's
    -- tsvector matches its content, and a trigger or an application write can drift.
    content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

-- Lexical branch. GIN is the right index for @@ containment queries over tsvector.
CREATE INDEX IF NOT EXISTS idx_chunks_content_tsv ON chunks USING GIN (content_tsv);

-- The IVFFlat vector index is deliberately NOT created here. It must be built *after* the rows
-- are loaded — IVFFlat clusters existing data, so an index built on an empty table is useless —
-- and its `lists` parameter is sized from the row count. `npm run seed:pgvector` creates it.
-- Same split as the legacy seeder (MIGRATION_SPEC.md §6.2).
