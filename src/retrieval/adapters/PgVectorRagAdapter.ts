import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../types/retrieval.types";
import { EmbeddingService } from "../../services/EmbeddingService";
import { createLogger } from "../../utils/logger";
import { HYBRID_FETCH, fuseRrf } from "../rrf";
import { resolveTopK } from "../options";

const log = createLogger("PgVectorRag");

/**
 * The legacy-parity RAG arm: hybrid dense + Postgres full-text, fused with RRF
 * (`MIGRATION_SPEC.md` §7).
 *
 * ⚠️ **Dev/experiment only.** Deleted with the sidecar once ◆G7 is resolved. It exists to answer
 * "is the thing we migrated away from actually better?" with a measurement rather than an opinion,
 * so every constant here is pinned to the legacy value — fetch depth 20 per branch, `RRF_K = 60`,
 * top-k 5 — rather than tuned. A tuned reimplementation would be a different system and would not
 * answer the question.
 */

/** The row shape both branches select. */
export interface ChunkRow {
  chunk_id: number;
  filename: string;
  title: string;
  source_url: string | null;
  content: string;
}

/** Minimal surface of `pg.Pool` this adapter needs — injected so tests need no database. */
export interface QueryClient {
  query<R>(text: string, values: unknown[]): Promise<{ rows: R[] }>;
}

/**
 * Dense branch: cosine distance via pgvector's `<=>`, fetching `HYBRID_FETCH` candidates.
 * `ORDER BY ... <=> $1` is what lets the IVFFlat index be used; a computed column in the
 * SELECT would not.
 */
const DENSE_SQL = `
  SELECT c.id AS chunk_id, d.filename, d.title, d.source_url, c.content
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL
  ORDER BY c.embedding <=> $1::vector
  LIMIT $2
`;

/**
 * Lexical branch. `websearch_to_tsquery` rather than `plainto_tsquery` because it tolerates
 * arbitrary user text — quotes, OR, `-negation` — without throwing, and real questions contain
 * all three. This branch is what catches acronyms and exact tokens ("ORP", "NTU", "KCl creep")
 * that dense retrieval underweights, and the eval has a whole class aimed at it.
 */
const LEXICAL_SQL = `
  SELECT c.id AS chunk_id, d.filename, d.title, d.source_url, c.content
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE c.content_tsv @@ websearch_to_tsquery('english', $1)
  ORDER BY ts_rank_cd(c.content_tsv, websearch_to_tsquery('english', $1)) DESC
  LIMIT $2
`;

export class PgVectorRagAdapter implements RetrievalAdapter {
  readonly mode = "pgvector-rag";

  private readonly client: QueryClient;

  private readonly embeddings: EmbeddingService;

  constructor(client: QueryClient, embeddings: EmbeddingService = new EmbeddingService()) {
    this.client = client;
    this.embeddings = embeddings;
  }

  async getContext(query: string, opts?: GetContextOptions): Promise<Chunk[]> {
    // Same degenerate-case guards as every other adapter, so the arms stay comparable
    // rather than each inventing its own edge-case behaviour.
    const topK = resolveTopK(opts);
    if (query.trim() === "" || topK === 0) {
      return [];
    }

    const embedding = await this.embeddings.embedQuery(query);

    // Both branches are independent reads, so they run concurrently — this is per-request
    // latency the bake-off measures, and serializing them would inflate it for no reason.
    const [dense, lexical] = await Promise.all([
      this.client.query<ChunkRow>(DENSE_SQL, [JSON.stringify(embedding), HYBRID_FETCH]),
      this.client.query<ChunkRow>(LEXICAL_SQL, [query, HYBRID_FETCH]),
    ]);

    const fused = fuseRrf<ChunkRow>(
      [dense.rows, lexical.rows],
      (row) => String(row.chunk_id),
      topK,
    );

    if (fused.length === 0) {
      // Empty context is answered fluently and ungrounded, so it must not pass quietly —
      // an unseeded database looks exactly like a quality failure otherwise.
      log.warn(
        `No chunks matched "${query.slice(0, 60)}". If this repeats, the database is probably `
        + "unseeded — run `npm run seed:pgvector`.",
      );
    }

    return fused.map(({ item, score }) => ({
      id: String(item.chunk_id),
      text: item.content,
      // Matches the direct-feed arm's convention so citations are comparable across arms.
      source: item.source_url ?? item.filename,
      score,
    }));
  }
}
