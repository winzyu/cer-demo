import type {
  Chunk,
  GetContextOptions,
  RetrievalAdapter,
} from "../../types/retrieval.types";
import { resolveTopK } from "../options";

/**
 * Fixed, obviously-fake context. Exists so the whole chat path — adapter selection,
 * prompt assembly, the LLM call, streaming — is buildable and testable with zero
 * infrastructure: no corpus, no embeddings, no Firestore, no credentials.
 *
 * The text is deliberately recognizable as placeholder so a stub answer can never be
 * mistaken for a grounded one in a demo or a bake-off transcript.
 */
const STUB_CHUNKS: Chunk[] = [
  {
    id: "stub-1",
    text: "[STUB CONTEXT] Dissolved oxygen (DO) below 5 mg/L is generally stressful for freshwater aquatic life.",
    source: "stub://aquatic-life-criteria",
    score: 0.9,
  },
  {
    id: "stub-2",
    text: "[STUB CONTEXT] ORP (oxidation-reduction potential) is reported in millivolts (mV). A reading of 0 mV is a valid measurement, not a fault.",
    source: "stub://sensor-reference",
    score: 0.8,
  },
  {
    id: "stub-3",
    text: "[STUB CONTEXT] Turbidity is reported in NTU. Confirm the unit (NTU vs FNU) before quoting a value as fact.",
    source: "stub://sensor-reference",
    score: 0.7,
  },
];

export class StubAdapter implements RetrievalAdapter {
  readonly mode = "stub";

  private readonly chunks: Chunk[];

  constructor(chunks: Chunk[] = STUB_CHUNKS) {
    this.chunks = chunks;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getContext(query: string, opts?: GetContextOptions): Promise<Chunk[]> {
    // Guards mirror the legacy pipeline (MIGRATION_SPEC.md §7 step 1) so every adapter
    // agrees on the degenerate cases rather than each handling them differently.
    if (query.trim() === "") {
      return [];
    }
    const topK = resolveTopK(opts);
    return this.chunks.slice(0, topK);
  }
}

export { STUB_CHUNKS };
