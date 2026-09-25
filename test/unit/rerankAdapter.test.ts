import { RerankAdapter } from "../../src/retrieval/adapters/RerankAdapter";
import { RerankService } from "../../src/services/RerankService";
import type { Reranker } from "../../src/services/RerankService";
import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../src/types/retrieval.types";

const chunk = (id: string, score: number): Chunk => ({
  id, text: `text of ${id}`, source: `${id.split("__")[0]}`, score,
});

/** An inner adapter that records the depth it was asked for and returns `pool` in order. */
const inner = (pool: Chunk[]) => {
  const asked: number[] = [];
  const adapter: RetrievalAdapter = {
    mode: "inner",
    getContext: async (_query: string, opts?: GetContextOptions) => {
      asked.push(opts?.topK ?? -1);
      return pool.slice(0, opts?.topK);
    },
  };
  return { adapter, asked };
};

/** Scores each document by a lookup on its text, so tests state the reorder directly. */
const reranker = (byText: Record<string, number>): Reranker => ({
  score: async (_query, documents) => documents.map((text) => byText[text] ?? 0),
});

describe("RerankAdapter", () => {
  const pool = [chunk("a.pdf__1", 0.9), chunk("b.pdf__2", 0.8), chunk("c.pdf__3", 0.7)];

  it("asks the inner adapter for the pool, reorders by cross-encoder score and keeps top k", async () => {
    const { adapter, asked } = inner(pool);
    const rerank = new RerankAdapter(adapter, reranker({
      "text of a.pdf__1": 0.1, "text of b.pdf__2": 0.3, "text of c.pdf__3": 0.9,
    }), "local-rerank", 3);

    const result = await rerank.getContext("q", { topK: 2 });

    expect(asked).toEqual([3]);
    expect(result.map((c) => c.id)).toEqual(["c.pdf__3", "b.pdf__2"]);
    // The reranker's score replaces the cosine, which is not comparable to it.
    expect(result.map((c) => c.score)).toEqual([0.9, 0.3]);
  });

  it("keeps the inner order on tied scores", async () => {
    const { adapter } = inner(pool);
    const rerank = new RerankAdapter(adapter, reranker({}), "local-rerank", 3);

    const result = await rerank.getContext("q", { topK: 3 });

    expect(result.map((c) => c.id)).toEqual(["a.pdf__1", "b.pdf__2", "c.pdf__3"]);
  });

  it("never asks for a pool smaller than k", async () => {
    const { adapter, asked } = inner(pool);
    const rerank = new RerankAdapter(adapter, reranker({}), "local-rerank", 2);

    await rerank.getContext("q", { topK: 3 });

    expect(asked).toEqual([3]);
  });

  it("returns nothing for an empty query or k=0 without calling the reranker", async () => {
    const { adapter, asked } = inner(pool);
    const score = jest.fn();
    const rerank = new RerankAdapter(adapter, { score }, "local-rerank", 3);

    expect(await rerank.getContext("  ", { topK: 2 })).toEqual([]);
    expect(await rerank.getContext("q", { topK: 0 })).toEqual([]);
    expect(asked).toEqual([]);
    expect(score).not.toHaveBeenCalled();
  });
});

describe("RerankService", () => {
  const client = (data: Array<{ index: number; relevance_score: number }>) => {
    const post = jest.fn().mockResolvedValue({ data });
    return { openai: { post } as never, post };
  };

  it("posts one request and returns scores in input order", async () => {
    const { openai, post } = client([
      { index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.2 },
    ]);

    const scores = await new RerankService(openai, "m").score("q", ["x", "y"]);

    expect(scores).toEqual([0.2, 0.9]);
    expect(post).toHaveBeenCalledWith("/rerank", {
      body: {
        model: "m", query: "q", documents: ["x", "y"], top_n: 2, return_documents: false,
      },
    });
  });

  it("throws when a document comes back unscored, rather than leaving the pool unranked", async () => {
    const { openai } = client([{ index: 0, relevance_score: 0.5 }]);

    await expect(new RerankService(openai, "m").score("q", ["x", "y"])).rejects.toThrow(
      "Reranker returned 1 score(s) for 2 document(s).",
    );
  });

  it("sends nothing for an empty pool", async () => {
    const { openai, post } = client([]);

    expect(await new RerankService(openai, "m").score("q", [])).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });
});
