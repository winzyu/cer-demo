import { FUSION_DEPTH, RRF_K, RrfHybridAdapter } from "../../src/retrieval/adapters/RrfHybridAdapter";
import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../src/types/retrieval.types";
import fs from "fs";
import os from "os";
import path from "path";

/** A corpus artifact on disk, since the BM25 half reads `corpus.json` rather than the cache. */
const writeCorpus = (chunks: Array<{ id: string; text: string }>): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rrf-"));
  const file = path.join(dir, "corpus.json");
  fs.writeFileSync(file, JSON.stringify({
    generatedAt: "2026-08-25T00:00:00.000Z",
    documents: [{
      filename: "doc.pdf",
      title: "Doc",
      method: "pdf",
      chars: 100,
      text: "whole",
      chunksBeforeFilter: chunks.length,
      inDirectFeedSlice: false,
      chunks: chunks.map((c, index) => ({
        id: c.id, contentHash: c.id, index, text: c.text,
      })),
    }],
  }), "utf8");
  return file;
};

const denseReturning = (ids: string[]): RetrievalAdapter => ({
  mode: "fake-dense",
  getContext: async (query: string, _opts?: GetContextOptions): Promise<Chunk[]> => (
    query.trim() === "" ? [] : ids.map((id) => ({ id, text: id, source: "doc.pdf", score: 0.5 }))
  ),
});

describe("RrfHybridAdapter", () => {
  const corpus = writeCorpus([
    { id: "kcl", text: "KCl creep on the reference electrode" },
    { id: "ntu", text: "turbidity reported in NTU white light" },
    { id: "filler", text: "general water quality discussion of measurement" },
  ]);

  it("surfaces a chunk only one arm ranks well", async () => {
    // Dense misses the rare token entirely; BM25 finds it. Fusion must rescue it — this is the
    // regression the migration introduced when the lexical branch was dropped.
    const adapter = new RrfHybridAdapter(denseReturning(["filler"]), "t1", corpus);

    const result = await adapter.getContext("KCl creep", { topK: 5 });

    expect(result.map((c) => c.id)).toContain("kcl");
  });

  it("ranks a chunk both arms like above one only a single arm likes", async () => {
    // RRF's defining property: agreement beats one arm's confident outlier.
    const adapter = new RrfHybridAdapter(denseReturning(["ntu", "filler"]), "t2", corpus);

    const result = await adapter.getContext("turbidity NTU", { topK: 3 });

    expect(result[0].id).toBe("ntu");
  });

  it("replaces per-arm scores with the fused score", async () => {
    const adapter = new RrfHybridAdapter(denseReturning(["ntu"]), "t3", corpus);

    const [top] = await adapter.getContext("turbidity NTU", { topK: 1 });

    // A cosine would be <= 1 and is not comparable to a fused rank score; reporting one here
    // would invite exactly that misreading.
    expect(top.score).toBeGreaterThan(0);
    expect(top.score).toBeLessThanOrEqual(2 / (RRF_K + 1));
  });

  it("asks each arm deeper than the requested topK", async () => {
    // Fusing two top-5 lists can only reorder 10 candidates; the point of fusion is invisible
    // unless both arms run deeper than the output.
    let askedFor: number | undefined;
    const dense: RetrievalAdapter = {
      mode: "probe",
      getContext: async (_q, opts) => { askedFor = opts?.topK; return []; },
    };

    await new RrfHybridAdapter(dense, "t4", corpus).getContext("turbidity", { topK: 3 });

    expect(askedFor).toBe(FUSION_DEPTH);
  });

  it("returns nothing for an empty query or a non-positive topK", async () => {
    const adapter = new RrfHybridAdapter(denseReturning(["ntu"]), "t5", corpus);

    expect(await adapter.getContext("   ", { topK: 5 })).toEqual([]);
    expect(await adapter.getContext("turbidity", { topK: 0 })).toEqual([]);
  });

  it("still returns lexical hits when the dense arm returns nothing", async () => {
    // A missing embedding cache must degrade to lexical-only, never to silence.
    const adapter = new RrfHybridAdapter(denseReturning([]), "t6", corpus);

    const result = await adapter.getContext("KCl creep", { topK: 5 });

    expect(result.map((c) => c.id)).toContain("kcl");
  });
});
