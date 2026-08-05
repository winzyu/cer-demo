import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../types/retrieval.types";
import type { CorpusDocument, CorpusSource } from "../sources/corpusSource";
import { createLogger } from "../../utils/logger";

const log = createLogger("DirectFeed");

/**
 * The direct-feed arm: return the ◆G9 corpus slice whole, every time.
 *
 * No embedding, no ranking, no top-k — and therefore **no retrieval miss** within the slice, which
 * is the property the bake-off is testing. What it cannot do is reach the long manuals the slice
 * excludes; questions needing those are expected to fail here, and measuring that gap is the point
 * (docs/RETRIEVAL_BAKEOFF.md ◆G9).
 */
export class DirectFeedAdapter implements RetrievalAdapter {
  readonly mode = "firestore-direct";

  private readonly source: CorpusSource;

  /**
   * The slice is identical on every request, so it is loaded once per process rather than per
   * call. Re-reading would add datastore cost and latency to every request while returning the
   * same bytes — and for a Firestore source it would burn free-tier read quota for nothing.
   */
  private cached?: Promise<CorpusDocument[]>;

  constructor(source: CorpusSource) {
    this.source = source;
  }

  /** `_opts` is accepted and ignored — see the `topK` note below. */
  async getContext(query: string, _opts?: GetContextOptions): Promise<Chunk[]> {
    // Same degenerate-case guard as every other adapter, so the arms stay comparable.
    if (query.trim() === "") {
      return [];
    }

    const documents = await this.load();

    // `topK` is deliberately ignored. Truncating an unranked slice would drop documents
    // arbitrarily — the arm's whole premise is that the model sees all of it.
    return documents.map((document) => ({
      id: document.filename,
      text: document.text,
      source: document.sourceUrl ?? document.filename,
    }));
  }

  private load(): Promise<CorpusDocument[]> {
    if (!this.cached) {
      this.cached = this.source.loadSlice().then((documents) => {
        if (documents.length === 0) {
          // Loud, because an empty slice degrades silently: the model still answers, just
          // ungrounded, and the arm would look like a quality failure rather than a setup failure.
          log.warn(
            `Slice is empty from source "${this.source.name}" — every answer will be ungrounded. `
              + "Run `npm run ingest` (and `npm run seed:firestore` for the firestore source).",
          );
        } else {
          const chars = documents.reduce((sum, d) => sum + d.text.length, 0);
          log.info(
            `Loaded ${documents.length} documents (${chars.toLocaleString()} chars, `
              + `~${Math.round(chars / 4).toLocaleString()} tokens) from "${this.source.name}".`,
          );
        }
        return documents;
      }).catch((error: unknown) => {
        // Do not cache a failure — a transient datastore error should not disable the arm
        // for the life of the process.
        this.cached = undefined;
        throw error;
      });
    }
    return this.cached;
  }
}
