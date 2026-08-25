import { HybridSliceVectorAdapter } from "../../src/retrieval/adapters/HybridSliceVectorAdapter";
import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../src/types/retrieval.types";

const SLICE = ["operator.pdf", "probe.pdf"] as const;

const fake = (mode: string, chunks: Chunk[]): RetrievalAdapter => ({
  mode,
  getContext: async (query: string, _opts?: GetContextOptions) => (
    query.trim() === "" ? [] : chunks
  ),
});

const sliceChunks: Chunk[] = [
  { id: "operator.pdf", text: "operator ranges", source: "operator.pdf" },
  { id: "probe.pdf", text: "probe datasheet", source: "probe.pdf" },
];

describe("HybridSliceVectorAdapter", () => {
  it("returns the slice plus manual chunks the slice does not already cover", async () => {
    const vector = fake("local-vector", [
      { id: "manual.pdf__aaa", text: "manual text", source: "manual.pdf", score: 0.9 },
    ]);
    const adapter = new HybridSliceVectorAdapter(fake("slice", sliceChunks), vector, SLICE);

    const result = await adapter.getContext("what is orp", { topK: 5 });

    expect(result.map((c) => c.id)).toEqual(["operator.pdf", "probe.pdf", "manual.pdf__aaa"]);
  });

  /**
   * The slice is whole documents; the vector arm indexes those same documents as chunks. Without
   * suppression the arm pays twice for the operator tier and spends retrieval slots on text the
   * model already has — the one thing a limited context budget cannot afford.
   */
  it("drops vector hits already covered by the slice", async () => {
    const vector = fake("local-vector", [
      { id: "operator.pdf__c823", text: "operator ranges", source: "operator.pdf", score: 0.99 },
      { id: "manual.pdf__aaa", text: "manual text", source: "manual.pdf", score: 0.8 },
    ]);
    const adapter = new HybridSliceVectorAdapter(fake("slice", sliceChunks), vector, SLICE);

    const result = await adapter.getContext("q", { topK: 5 });

    expect(result.map((c) => c.id)).toEqual(["operator.pdf", "probe.pdf", "manual.pdf__aaa"]);
    expect(result.filter((c) => c.id.startsWith("operator.pdf__"))).toHaveLength(0);
  });

  /**
   * Static content first is a prompt-caching requirement, not a stylistic choice: the slice is
   * byte-identical on every request and the vector tail is not, so putting the slice first keeps
   * the cacheable prefix intact (`docs/timeline.md`, Phase N1 prompt assembly). Reversing this
   * would quietly destroy direct-feed's ~99% cache hit rate.
   */
  it("puts the slice first, so the cacheable prefix stays stable", async () => {
    const vector = fake("local-vector", [
      { id: "manual.pdf__aaa", text: "m", source: "manual.pdf", score: 0.99 },
    ]);
    const adapter = new HybridSliceVectorAdapter(fake("slice", sliceChunks), vector, SLICE);

    const result = await adapter.getContext("q", { topK: 5 });

    expect(result.slice(0, 2).map((c) => c.id)).toEqual(["operator.pdf", "probe.pdf"]);
  });

  it("returns nothing for an empty query or a non-positive topK", async () => {
    const vector = fake("local-vector", [
      { id: "manual.pdf__aaa", text: "m", source: "manual.pdf" },
    ]);
    const adapter = new HybridSliceVectorAdapter(fake("slice", sliceChunks), vector, SLICE);

    expect(await adapter.getContext("   ", { topK: 5 })).toEqual([]);
    expect(await adapter.getContext("q", { topK: 0 })).toEqual([]);
  });

  it("still returns the slice when the vector arm finds nothing", async () => {
    const adapter = new HybridSliceVectorAdapter(fake("slice", sliceChunks), fake("v", []), SLICE);

    const result = await adapter.getContext("q", { topK: 5 });

    // The operator tier is the guarantee this arm exists to preserve; a dead vector side must
    // degrade to direct-feed, never to nothing.
    expect(result.map((c) => c.id)).toEqual(["operator.pdf", "probe.pdf"]);
  });
});
