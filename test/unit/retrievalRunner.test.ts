import fs from "fs";
import os from "os";
import path from "path";
import { runRetrievalEval, type AdapterLike } from "../../src/eval/retrieval/runner";
import type { LoadedLabels } from "../../src/eval/retrieval/labels";
import type { Chunk } from "../../src/types/retrieval.types";

/**
 * The behaviour under test is the granularity bridge: adapters retrieve different *kinds* of
 * thing, and the labels are chunk-level.
 *
 * `firestore-direct` returns whole documents — the fixed ◆G9 slice, on every request. The vector
 * arms return chunks. Scoring them against chunk labels only means something if a document result
 * is expanded into the chunks it actually puts in the prompt, which is what these tests pin.
 */

const writeCorpus = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "retrieval-runner-"));
  const file = path.join(dir, "corpus.json");
  fs.writeFileSync(file, JSON.stringify({
    generatedAt: "2026-08-24T00:00:00.000Z",
    documents: [
      {
        filename: "slice.pdf",
        title: "Slice",
        method: "pdf",
        chars: 10,
        text: "whole doc",
        chunksBeforeFilter: 2,
        inDirectFeedSlice: true,
        chunks: [
          { id: "slice.pdf__aaa", contentHash: "aaa", index: 0, text: "a" },
          { id: "slice.pdf__bbb", contentHash: "bbb", index: 1, text: "b" },
        ],
      },
      {
        filename: "manual.pdf",
        title: "Manual",
        method: "pdf",
        chars: 10,
        text: "manual",
        chunksBeforeFilter: 1,
        inDirectFeedSlice: false,
        chunks: [{ id: "manual.pdf__ccc", contentHash: "ccc", index: 0, text: "c" }],
      },
    ],
  }), "utf8");
  return file;
};

const labelsFor = (relevantId: string): LoadedLabels => ({
  fixtures: [],
  queries: [{
    fixtureId: "f1",
    fixtureClass: "definitional",
    label: {
      turn: 1,
      query: "what is it",
      relevant: [{
        chunkId: relevantId, contentHash: "x", filename: "slice.pdf", grade: 2, evidence: "a",
      }],
    },
  }],
});

const adapterReturning = (mode: string, chunks: Chunk[]): AdapterLike => ({
  mode,
  getContext: async () => chunks,
});

describe("runRetrievalEval", () => {
  let corpusPath: string;
  beforeAll(() => { corpusPath = writeCorpus(); });

  it("expands a document-level result into the chunks it puts in the prompt", async () => {
    // A document-level adapter names the corpus filename as the chunk id.
    const adapter = adapterReturning("firestore-direct", [
      { id: "slice.pdf", text: "whole doc", source: "slice.pdf" },
    ]);

    const result = await runRetrievalEval(adapter, { labels: labelsFor("slice.pdf__bbb"), corpusPath });

    // Both of slice.pdf's chunks reached the prompt, so the labelled one counts as retrieved
    // even though it is the second chunk of the document.
    expect(result.retrieved["f1#1"]).toEqual(["slice.pdf__aaa", "slice.pdf__bbb"]);
    expect(result.summary.recall).toBe(1);
    expect(result.meanChunksInContext).toBe(2);
  });

  it("scores a document-level adapter as a miss when the answer is outside its slice", async () => {
    const adapter = adapterReturning("firestore-direct", [
      { id: "slice.pdf", text: "whole doc", source: "slice.pdf" },
    ]);

    const result = await runRetrievalEval(adapter, { labels: labelsFor("manual.pdf__ccc"), corpusPath });

    // This is the direct-feed shape: perfect on in-slice material, structurally blind elsewhere.
    expect(result.summary.recall).toBe(0);
  });

  it("passes chunk-level results through unexpanded", async () => {
    const adapter = adapterReturning("local-vector", [
      { id: "manual.pdf__ccc", text: "c", source: "manual.pdf", score: 0.9 },
    ]);

    const result = await runRetrievalEval(adapter, { labels: labelsFor("manual.pdf__ccc"), corpusPath });

    expect(result.retrieved["f1#1"]).toEqual(["manual.pdf__ccc"]);
    expect(result.summary.recall).toBe(1);
    expect(result.meanChunksInContext).toBe(1);
  });

  it("records precision, so a slice adapter's recall is not read without its cost", async () => {
    const adapter = adapterReturning("firestore-direct", [
      { id: "slice.pdf", text: "whole doc", source: "slice.pdf" },
    ]);

    const result = await runRetrievalEval(adapter, { labels: labelsFor("slice.pdf__aaa"), corpusPath });

    // 1 relevant of 2 chunks placed in context.
    expect(result.summary.precision).toBe(0.5);
  });

  it("reports an empty result as a miss rather than throwing", async () => {
    const adapter = adapterReturning("broken", []);
    const result = await runRetrievalEval(adapter, { labels: labelsFor("slice.pdf__aaa"), corpusPath });

    expect(result.summary.recall).toBe(0);
    expect(result.meanChunksInContext).toBe(0);
    expect(result.retrieved["f1#1"]).toEqual([]);
  });
});
