import { HYBRID_FETCH, RRF_K, fuseRrf } from "../../src/retrieval/rrf";
import { PgVectorRagAdapter } from "../../src/retrieval/adapters/PgVectorRagAdapter";
import type { ChunkRow, QueryClient } from "../../src/retrieval/adapters/PgVectorRagAdapter";
import {
  DOCUMENT_PREFIX,
  EMBED_BATCH,
  EmbeddingService,
  QUERY_PREFIX,
  batched,
} from "../../src/services/EmbeddingService";

/**
 * The `pgvector-rag` arm without a database.
 *
 * Everything here is about parity with `MIGRATION_SPEC.md` §7 and §4.4. The failure mode this
 * suite guards against is subtle: a wrong RRF constant or a dropped nomic prefix still returns
 * plausible chunks, just worse ones — which would read as "RAG loses to direct-feed" and quietly
 * decide ◆G7.
 */

const row = (id: number, filename = "doc.pdf"): ChunkRow => ({
  chunk_id: id,
  filename,
  title: `Title of ${filename}`,
  source_url: null,
  content: `content ${id}`,
});

describe("fuseRrf", () => {
  it("uses the legacy constants", () => {
    // Pinned: changing either silently changes every ranking in the experiment.
    expect(RRF_K).toBe(60);
    expect(HYBRID_FETCH).toBe(20);
  });

  it("scores a single list as 1 / (k + rank + 1) with zero-based ranks", () => {
    const fused = fuseRrf([[row(1), row(2)]], (r) => String(r.chunk_id), 2);

    // The legacy formula's `+ 1` makes rank 0 contribute 1/61, not 1/60.
    expect(fused[0].score).toBeCloseTo(1 / 61, 10);
    expect(fused[1].score).toBeCloseTo(1 / 62, 10);
  });

  it("sums contributions for a chunk both branches returned", () => {
    const dense = [row(1), row(2)];
    const lexical = [row(3), row(1)];

    const fused = fuseRrf([dense, lexical], (r) => String(r.chunk_id), 3);

    // Chunk 1 is rank 0 dense and rank 1 lexical — appearing in both is what RRF rewards.
    expect(fused[0].item.chunk_id).toBe(1);
    expect(fused[0].score).toBeCloseTo(1 / 61 + 1 / 62, 10);
  });

  it("lets agreement beat a single top-ranked hit", () => {
    // The whole reason for hybrid retrieval: a chunk both rankers like outranks one only
    // the dense branch put first.
    const fused = fuseRrf(
      [[row(1), row(2)], [row(2), row(3)]],
      (r) => String(r.chunk_id),
      3,
    );

    expect(fused[0].item.chunk_id).toBe(2);
  });

  it("truncates to topK", () => {
    const many = [row(1), row(2), row(3), row(4), row(5), row(6)];

    expect(fuseRrf([many], (r) => String(r.chunk_id), 5)).toHaveLength(5);
  });

  it("returns nothing for a non-positive topK", () => {
    expect(fuseRrf([[row(1)]], (r) => String(r.chunk_id), 0)).toEqual([]);
  });

  it("breaks ties deterministically by first appearance", () => {
    // Nondeterministic ordering would make cold and warm passes incomparable.
    const a = fuseRrf([[row(1)], [row(2)]], (r) => String(r.chunk_id), 2);
    const b = fuseRrf([[row(1)], [row(2)]], (r) => String(r.chunk_id), 2);

    expect(a.map((x) => x.item.chunk_id)).toEqual([1, 2]);
    expect(b.map((x) => x.item.chunk_id)).toEqual([1, 2]);
  });

  it("deduplicates a chunk returned by both branches", () => {
    const fused = fuseRrf([[row(1)], [row(1)]], (r) => String(r.chunk_id), 5);

    expect(fused).toHaveLength(1);
  });
});

describe("EmbeddingService", () => {
  const fakeClient = (capture: { inputs: string[][] }) => ({
    embeddings: {
      create: jest.fn(async ({ input }: { input: string[] }) => {
        capture.inputs.push(input);
        return {
          data: input.map((_, index) => ({
            index,
            embedding: new Array(768).fill(0.1),
          })),
        };
      }),
    },
  });

  it("prefixes a query with search_query:", async () => {
    const capture = { inputs: [] as string[][] };
    const service = new EmbeddingService(fakeClient(capture) as never);

    await service.embedQuery("what is ORP?");

    // Dropping the prefix degrades retrieval with no error anywhere — MIGRATION_SPEC §4.4.
    expect(capture.inputs[0]).toEqual([`${QUERY_PREFIX}what is ORP?`]);
  });

  it("prefixes documents with search_document:", async () => {
    const capture = { inputs: [] as string[][] };
    const service = new EmbeddingService(fakeClient(capture) as never);

    await service.embedDocuments(["chunk one", "chunk two"]);

    expect(capture.inputs[0]).toEqual([
      `${DOCUMENT_PREFIX}chunk one`,
      `${DOCUMENT_PREFIX}chunk two`,
    ]);
  });

  it("batches document embedding at the legacy size", async () => {
    const capture = { inputs: [] as string[][] };
    const service = new EmbeddingService(fakeClient(capture) as never);
    const texts = new Array(70).fill("x");

    const vectors = await service.embedDocuments(texts);

    expect(EMBED_BATCH).toBe(32);
    expect(capture.inputs.map((batch) => batch.length)).toEqual([32, 32, 6]);
    expect(vectors).toHaveLength(70);
  });

  it("reorders results by the API's index rather than trusting array order", async () => {
    // Pairing a chunk with another chunk's vector corrupts the index in a way that looks
    // like poor retrieval quality, not like a bug.
    const shuffled = {
      embeddings: {
        create: jest.fn(async () => ({
          data: [
            { index: 1, embedding: new Array(768).fill(0.2) },
            { index: 0, embedding: new Array(768).fill(0.1) },
          ],
        })),
      },
    };
    const service = new EmbeddingService(shuffled as never);

    const [first, second] = await service.embedDocuments(["a", "b"]);

    expect(first[0]).toBeCloseTo(0.1);
    expect(second[0]).toBeCloseTo(0.2);
  });

  it("always sends encoding_format explicitly", async () => {
    // Omitting it against Fireworks returns a corrupt 192-element all-zero vector with no
    // error (observed 2026-07-30). Dense retrieval on zero vectors ranks arbitrarily.
    const create = jest.fn(async () => ({
      data: [{ index: 0, embedding: new Array(768).fill(0.1) }],
    }));
    const service = new EmbeddingService({ embeddings: { create } } as never);

    await service.embedQuery("q");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ encoding_format: "float" }),
    );
  });

  it("rejects an all-zero vector even when the dimensions are right", async () => {
    const zeros = {
      embeddings: {
        create: jest.fn(async () => ({
          data: [{ index: 0, embedding: new Array(768).fill(0) }],
        })),
      },
    };
    const service = new EmbeddingService(zeros as never);

    await expect(service.embedQuery("q")).rejects.toThrow(/all-zero/);
  });

  it("rejects a wrong embedding dimension with a message naming the schema", async () => {
    const wrongDims = {
      embeddings: {
        create: jest.fn(async () => ({ data: [{ index: 0, embedding: [0.1, 0.2] }] })),
      },
    };
    const service = new EmbeddingService(wrongDims as never);

    // Caught here rather than as an opaque Postgres type error at INSERT.
    await expect(service.embedQuery("q")).rejects.toThrow(/768/);
  });

  it("batches exactly at the boundary", () => {
    expect(batched(new Array(32).fill("x"), 32)).toHaveLength(1);
    expect(batched(new Array(33).fill("x"), 32)).toHaveLength(2);
    expect(batched([], 32)).toEqual([]);
  });
});

describe("PgVectorRagAdapter", () => {
  const embeddings = {
    embedQuery: jest.fn(async () => new Array(768).fill(0.1)),
  } as unknown as EmbeddingService;

  const clientReturning = (dense: ChunkRow[], lexical: ChunkRow[]) => {
    const calls: { text: string; values: unknown[] }[] = [];
    // The generic signature cannot be expressed by a jest.fn, so the fake is a plain
    // function and the branch is chosen by looking for the pgvector distance operator.
    const client: QueryClient = {
      query: async <R>(text: string, values: unknown[]): Promise<{ rows: R[] }> => {
        calls.push({ text, values });
        const rows = text.includes("<=>") ? dense : lexical;
        return { rows: rows as unknown as R[] };
      },
    };
    return { client, calls };
  };

  it("registers under the mode the bake-off selects", () => {
    const { client } = clientReturning([], []);

    expect(new PgVectorRagAdapter(client, embeddings).mode).toBe("pgvector-rag");
  });

  it("fuses both branches and returns top-k chunks with scores", async () => {
    const { client } = clientReturning([row(1), row(2)], [row(2), row(3)]);
    const adapter = new PgVectorRagAdapter(client, embeddings);

    const chunks = await adapter.getContext("what is ORP?");

    expect(chunks.map((chunk) => chunk.id)).toEqual(["2", "1", "3"]);
    expect(chunks[0].score).toBeGreaterThan(chunks[1].score as number);
    expect(chunks[0].text).toBe("content 2");
  });

  it("fetches 20 candidates per branch before fusing", async () => {
    const { client, calls } = clientReturning([], []);

    await new PgVectorRagAdapter(client, embeddings).getContext("q");

    // Fetch depth is pinned to the legacy value; changing it changes what fusion can see.
    expect(calls).toHaveLength(2);
    calls.forEach((call) => expect(call.values).toContain(HYBRID_FETCH));
  });

  it("sends the raw query text to the lexical branch, not the embedding", async () => {
    const { client, calls } = clientReturning([], []);

    await new PgVectorRagAdapter(client, embeddings).getContext("ORP");

    const lexical = calls.find((call) => call.text.includes("to_tsquery"));
    expect(lexical?.values[0]).toBe("ORP");
  });

  it("ORs the query lexemes instead of ANDing them", async () => {
    // **The regression this exists for.** The original port used
    // `websearch_to_tsquery('english', $1)`, which ANDs every content word. Fed a whole user
    // question (retrieval runs up front here, not as a model-composed tool call), it matched
    // nothing on 36 of the eval's 46 questions — so the hybrid arm ran dense-only through an
    // entire sweep while looking healthy. See RETRIEVAL_BAKEOFF.md §4a.
    const { client, calls } = clientReturning([], []);

    await new PgVectorRagAdapter(client, embeddings).getContext("What is ORP and what does it measure?");

    const lexical = calls.find((call) => call.text.includes("to_tsquery"));
    expect(lexical?.text).toContain("' | '");
    expect(lexical?.text).not.toContain("websearch_to_tsquery");
  });

  it("derives lexemes with to_tsvector rather than a hand-rolled word list", async () => {
    // Postgres' own stemming and stopword list must do the splitting, or the query analysis
    // drifts from the index analysis and matches degrade silently.
    const { client, calls } = clientReturning([], []);

    await new PgVectorRagAdapter(client, embeddings).getContext("ORP drift");

    const lexical = calls.find((call) => call.text.includes("to_tsquery"));
    expect(lexical?.text).toContain("to_tsvector('english', $1)");
  });

  it("guards against a NULL tsquery from an all-stopword question", async () => {
    // "is it the a of" produces an empty tsvector, so string_agg returns NULL. Without the
    // guard the branch would throw rather than simply contributing nothing to the fusion.
    const { client, calls } = clientReturning([], []);

    await new PgVectorRagAdapter(client, embeddings).getContext("is it the a of");

    const lexical = calls.find((call) => call.text.includes("to_tsquery"));
    expect(lexical?.text).toContain("IS NOT NULL");
  });

  it("caps results at the resolved topK", async () => {
    const many = [row(1), row(2), row(3), row(4), row(5), row(6), row(7)];
    const { client } = clientReturning(many, []);

    const chunks = await new PgVectorRagAdapter(client, embeddings).getContext("q");

    // Legacy default of 5 (options.ts), shared with every other adapter.
    expect(chunks).toHaveLength(5);
  });

  it("honours an explicit topK", async () => {
    const many = [row(1), row(2), row(3), row(4), row(5), row(6), row(7)];
    const { client } = clientReturning(many, []);

    const chunks = await new PgVectorRagAdapter(client, embeddings).getContext("q", { topK: 2 });

    expect(chunks).toHaveLength(2);
  });

  it("returns nothing — and queries nothing — for an empty query", async () => {
    const { client, calls } = clientReturning([row(1)], []);

    const chunks = await new PgVectorRagAdapter(client, embeddings).getContext("   ");

    expect(chunks).toEqual([]);
    // No embedding call either: an empty query must not cost money.
    expect(calls).toHaveLength(0);
  });

  it("returns nothing for a non-positive topK", async () => {
    const { client, calls } = clientReturning([row(1)], []);

    const chunks = await new PgVectorRagAdapter(client, embeddings).getContext("q", { topK: 0 });

    expect(chunks).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("prefers source_url over filename for citations, matching direct-feed", async () => {
    const withUrl: ChunkRow = { ...row(1), source_url: "https://example.gov/doc" };
    const { client } = clientReturning([withUrl], []);

    const [chunk] = await new PgVectorRagAdapter(client, embeddings).getContext("q");

    expect(chunk.source).toBe("https://example.gov/doc");
  });

  it("falls back to the filename when there is no source url", async () => {
    const { client } = clientReturning([row(1, "tm9a6.2.pdf")], []);

    const [chunk] = await new PgVectorRagAdapter(client, embeddings).getContext("q");

    expect(chunk.source).toBe("tm9a6.2.pdf");
  });

  it("returns an empty array when neither branch matches", async () => {
    const { client } = clientReturning([], []);

    expect(await new PgVectorRagAdapter(client, embeddings).getContext("q")).toEqual([]);
  });
});
