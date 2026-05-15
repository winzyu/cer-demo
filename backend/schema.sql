CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    id            SERIAL PRIMARY KEY,
    filename      TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    source_url    TEXT,
    ingested_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunks (
    id            SERIAL PRIMARY KEY,
    document_id   INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index   INTEGER NOT NULL,
    content       TEXT NOT NULL,
    embedding     VECTOR(768),
    content_tsv   TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

CREATE INDEX IF NOT EXISTS idx_chunks_content_tsv ON chunks USING GIN (content_tsv);

CREATE TABLE IF NOT EXISTS sensor_data (
    id               SERIAL PRIMARY KEY,
    device           TEXT NOT NULL,
    measured_at      TIMESTAMPTZ NOT NULL,
    dissolved_oxygen NUMERIC,
    orp              NUMERIC,
    ph               NUMERIC,
    conductivity     NUMERIC,
    temperature      NUMERIC,
    UNIQUE (device, measured_at)
);

CREATE INDEX IF NOT EXISTS idx_sensor_measured_at ON sensor_data(measured_at);
