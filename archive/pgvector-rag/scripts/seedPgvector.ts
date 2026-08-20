import fs from "fs";
import path from "path";
import { closePgVectorPool, getPgVectorPool } from "../src/config/pgvector";
import { EmbeddingService } from "../src/services/EmbeddingService";
import { metaFor } from "../src/ingestion/corpus";
import { createLogger } from "../src/utils/logger";

/**
 * `npm run seed:pgvector` — loads the corpus artifact into the bake-off sidecar and embeds it.
 *
 * ⚠️ Dev/experiment only; deleted with the arm once ◆G7 resolves.
 *
 * Reads **`data/corpus/corpus.json`**, the same artifact every other arm loads, rather than
 * re-parsing the PDFs. That is the point of the one-parse rule (`RETRIEVAL_BAKEOFF.md` §4): if
 * this seeder extracted its own text, extraction differences would show up as answer-quality
 * differences and be misread as one retrieval strategy beating another.
 *
 * Idempotent by filename, like the legacy seeder — re-running skips documents already present.
 */

const log = createLogger("SeedPgvector");

/** Chunks are plain strings in the artifact; `chunk_index` is positional. */
interface ArtifactDocument {
  filename: string;
  title: string;
  chunks: string[];
}

const ARTIFACT = path.resolve(__dirname, "../data/corpus/corpus.json");

/**
 * IVFFlat `lists`, sized as the legacy seeder did: `clamp(sqrt(n), 10, 100)`.
 * Kept identical because index parameters change recall, and this arm exists to reproduce the
 * legacy baseline rather than to out-tune it.
 */
export const ivfflatLists = (chunkCount: number): number => Math.min(
  100,
  Math.max(10, Math.round(Math.sqrt(chunkCount))),
);

const loadArtifact = (): ArtifactDocument[] => {
  if (!fs.existsSync(ARTIFACT)) {
    throw new Error(`No corpus artifact at ${ARTIFACT}. Run \`npm run ingest\` first.`);
  }
  const parsed = JSON.parse(fs.readFileSync(ARTIFACT, "utf8")) as { documents: ArtifactDocument[] };
  return parsed.documents;
};

const main = async (): Promise<void> => {
  const pool = getPgVectorPool();
  const embeddings = new EmbeddingService();
  const documents = loadArtifact();

  log.info(`Artifact: ${documents.length} documents.`);

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < documents.length; i += 1) {
    const document = documents[i];

    // Idempotent by filename. Checked before embedding, so a re-run costs nothing rather
    // than re-paying for vectors it will then discard.
    // eslint-disable-next-line no-await-in-loop
    const existing = await pool.query("SELECT id FROM documents WHERE filename = $1", [document.filename]);

    let skipReason: string | undefined;
    if (existing.rows.length > 0) {
      skipReason = "already seeded";
    } else if (document.chunks.length === 0) {
      skipReason = "no surviving chunks";
    }

    if (skipReason) {
      log.info(`  ${document.filename}: ${skipReason}, skipping.`);
      skipped += 1;
    } else {
      log.info(`  ${document.filename}: embedding ${document.chunks.length} chunks…`);
      // eslint-disable-next-line no-await-in-loop
      const vectors = await embeddings.embedDocuments(document.chunks);

      // eslint-disable-next-line no-await-in-loop
      const client = await pool.connect();
      try {
        // One transaction per document: a failure mid-way leaves no half-seeded document for the
        // idempotency check to then skip over as though it were complete.
        // eslint-disable-next-line no-await-in-loop
        await client.query("BEGIN");
        // eslint-disable-next-line no-await-in-loop
        const doc = await client.query<{ id: number }>(
          "INSERT INTO documents (filename, title, source_url) VALUES ($1, $2, $3) RETURNING id",
          // source_url comes from DOC_META, not the artifact — same map the other arms cite from.
          [document.filename, document.title, metaFor(document.filename).sourceUrl ?? null],
        );
        const documentId = doc.rows[0].id;

        for (let c = 0; c < document.chunks.length; c += 1) {
          // eslint-disable-next-line no-await-in-loop
          await client.query(
            "INSERT INTO chunks (document_id, chunk_index, content, embedding) VALUES ($1, $2, $3, $4::vector)",
            [documentId, c, document.chunks[c], JSON.stringify(vectors[c])],
          );
        }

        // eslint-disable-next-line no-await-in-loop
        await client.query("COMMIT");
        inserted += 1;
      } catch (error) {
        // eslint-disable-next-line no-await-in-loop
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  }

  const { rows } = await pool.query<{ count: string }>("SELECT COUNT(*)::int AS count FROM chunks");
  const chunkCount = Number(rows[0].count);

  if (chunkCount > 0) {
    // Built after load, never in schema.sql: IVFFlat clusters existing rows, so an index created
    // on an empty table is useless, and `lists` is sized from the row count.
    const lists = ivfflatLists(chunkCount);
    log.info(`Building IVFFlat index (lists=${lists}) over ${chunkCount} chunks…`);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks
       USING ivfflat (embedding vector_cosine_ops) WITH (lists = ${lists})`,
      [],
    );
    await pool.query("ANALYZE chunks", []);
  }

  log.info(`Done. ${inserted} document(s) inserted, ${skipped} skipped, ${chunkCount} chunks total.`);
};

main()
  .catch((error: unknown) => {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  // Without this the pool keeps the event loop alive and the script never exits.
  .finally(closePgVectorPool);
