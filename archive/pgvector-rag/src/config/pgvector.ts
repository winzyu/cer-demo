import { Pool } from "pg";
import createError from "http-errors";
import { config } from "./index";
import { createLogger } from "../utils/logger";

const log = createLogger("PgVector");

/**
 * Memoized Postgres pool for the Phase N2 `pgvector-rag` arm.
 *
 * ⚠️ Dev/experiment only — deleted with the arm once ◆G7 resolves, along with the `pg`
 * dependency and `docker-compose.bakeoff.yml`.
 *
 * Lazy for the same reason the Firestore and Fireworks clients are: importing this module, or
 * booting the service, must not require a database to exist. A `Pool` opens no socket until the
 * first query, so the cost of constructing one for a process that never uses this arm is nil.
 */

let pool: Pool | undefined;

export const getPgVectorPool = (): Pool => {
  if (!pool) {
    const { url } = config.pgvector;
    if (!url) {
      throw createError(
        503,
        "PGVECTOR_URL is not configured. The pgvector-rag arm needs the bake-off sidecar: "
        + "`docker-compose -f docker-compose.bakeoff.yml up -d`, then "
        + "PGVECTOR_URL=postgresql://cer:cer@localhost:5433/cer_bakeoff.",
      );
    }
    pool = new Pool({ connectionString: url, max: 5 });
    log.info("Pool created (lazy — no connection opened yet).");
  }
  return pool;
};

/**
 * Adapts the pool to the adapter's narrow `QueryClient` interface.
 *
 * The generic cast is needed because `pg` types `rows` as `QueryResultRow[]`, which cannot be
 * proven assignable to a caller's row type. The adapter deliberately depends on a two-method
 * interface rather than on `pg.Pool`, so it stays testable without a database — this is the one
 * place that bridge is made.
 */
export const pgVectorQueryClient = {
  query: async <R>(text: string, values: unknown[]): Promise<{ rows: R[] }> => {
    const result = await getPgVectorPool().query(text, values);
    return { rows: result.rows as R[] };
  },
};

/** Test seam, and used by scripts that must exit rather than hang on an open pool. */
export const closePgVectorPool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
};
