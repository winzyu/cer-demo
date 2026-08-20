import { FieldValue } from "@google-cloud/firestore";
import {
  CHUNK_COLLECTION,
  DISTANCE_FIELD,
  DISTANCE_MEASURE,
  FirestoreVectorAdapter,
  VECTOR_FIELD,
  chunkDocumentFields,
  chunkDocumentId,
} from "../../src/retrieval/adapters/FirestoreVectorAdapter";
import { EmbeddingService } from "../../src/services/EmbeddingService";

/**
 * The `firestore-vector` arm without Firestore.
 *
 * The failure mode this suite guards against is silence. An embedding written as a plain array, a
 * wrong distance measure, or a dropped nomic prefix all leave the arm running and answering — just
 * retrieving nothing, or retrieving worse. That reads as "Firestore vector search loses" and would
 * quietly decide ◆G10.
 */

const embeddings = {
  embedQuery: jest.fn(async () => new Array(768).fill(0.1)),
} as unknown as EmbeddingService;

interface FakeDoc {
  id: string;
  data: Record<string, unknown>;
}

/** Captures what the adapter asked Firestore for, and replays canned documents back. */
const dbReturning = (docs: FakeDoc[]) => {
  const calls: { collection: string; options: Record<string, unknown> }[] = [];

  const db = {
    collection: (collection: string) => ({
      findNearest: (options: Record<string, unknown>) => {
        calls.push({ collection, options });
        return {
          get: async () => ({
            docs: docs
              .slice(0, options.limit as number)
              .map((doc) => ({ id: doc.id, data: () => doc.data })),
          }),
        };
      },
    }),
  };

  return { db, calls };
};

const doc = (id: string, distance: number, extra: Record<string, unknown> = {}): FakeDoc => ({
  id,
  data: {
    filename: "doc.pdf",
    title: "Title",
    sourceUrl: null,
    chunkIndex: 0,
    text: `content ${id}`,
    [DISTANCE_FIELD]: distance,
    ...extra,
  },
});

const adapterFor = (docs: FakeDoc[]) => {
  const { db, calls } = dbReturning(docs);
  return { adapter: new FirestoreVectorAdapter(db as never, embeddings), calls };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("chunkDocumentFields", () => {
  const source = { filename: "a.pdf", title: "A", sourceUrl: "https://example.test/a" };

  /**
   * The trap this arm was warned about before a line of it existed. A plain `number[]` stores an
   * array; the vector index never matches it and `findNearest` returns nothing with no error.
   */
  it("wraps the embedding in FieldValue.vector, not a plain array", () => {
    const fields = chunkDocumentFields(source, 0, "text", [0.1, 0.2, 0.3]);

    expect(Array.isArray(fields.embedding)).toBe(false);
    expect(fields.embedding).toBeInstanceOf(FieldValue.vector([0]).constructor);
    expect(fields.embedding.toArray()).toEqual([0.1, 0.2, 0.3]);
  });

  it("writes exactly the fields getContext reads back", () => {
    const fields = chunkDocumentFields(source, 3, "chunk text", [0.1]);

    expect(Object.keys(fields).sort()).toEqual(
      ["chunkIndex", "embedding", "filename", "sourceUrl", "text", "title"],
    );
    expect(fields.text).toBe("chunk text");
    expect(fields.chunkIndex).toBe(3);
  });

  it("normalises a missing sourceUrl to null rather than dropping the field", () => {
    const withoutUrl = { filename: source.filename, title: source.title };
    expect(chunkDocumentFields(withoutUrl, 0, "t", [0.1]).sourceUrl).toBeNull();
  });
});

describe("chunkDocumentId", () => {
  it("is derived and stable, so re-seeding overwrites rather than duplicating", () => {
    expect(chunkDocumentId("a.pdf", 7)).toBe(chunkDocumentId("a.pdf", 7));
    expect(chunkDocumentId("a.pdf", 7)).not.toBe(chunkDocumentId("a.pdf", 8));
  });

  it("strips characters Firestore ids cannot contain", () => {
    expect(chunkDocumentId("dir/sub file.pdf", 0)).not.toContain("/");
    expect(chunkDocumentId("dir/sub file.pdf", 0)).not.toContain(" ");
  });

  it("zero-pads the index so ids sort in chunk order", () => {
    // Lexical id ordering is the only ordering a Firestore id scan gives; unpadded, chunk 10
    // would sort before chunk 2.
    expect([chunkDocumentId("a.pdf", 10), chunkDocumentId("a.pdf", 2)].sort())
      .toEqual([chunkDocumentId("a.pdf", 2), chunkDocumentId("a.pdf", 10)]);
  });
});

describe("FirestoreVectorAdapter", () => {
  it("registers under the mode the bake-off selects", () => {
    expect(adapterFor([]).adapter.mode).toBe("firestore-vector");
  });

  it("searches the per-chunk collection, not the direct-feed one", () => {
    // corpus_documents cannot carry a searchable vector — Firestore will not index one inside
    // an array element, which is the whole reason this collection exists.
    expect(CHUNK_COLLECTION).toBe("corpus_chunks");
  });

  it("queries with cosine, matching pgvector's <=>", async () => {
    const { adapter, calls } = adapterFor([]);

    await adapter.getContext("what is ORP?");

    expect(DISTANCE_MEASURE).toBe("COSINE");
    expect(calls[0].collection).toBe(CHUNK_COLLECTION);
    expect(calls[0].options).toMatchObject({
      vectorField: VECTOR_FIELD,
      distanceMeasure: "COSINE",
      distanceResultField: DISTANCE_FIELD,
    });
  });

  it("sends the query embedding as a vector, not a raw array", async () => {
    const { adapter, calls } = adapterFor([]);

    await adapter.getContext("q");

    expect(Array.isArray(calls[0].options.queryVector)).toBe(false);
  });

  it("embeds the query through EmbeddingService, so the nomic prefix is applied", async () => {
    const { adapter } = adapterFor([]);

    await adapter.getContext("what is ORP?");

    // Dropping search_query: degrades retrieval with no error anywhere — MIGRATION_SPEC §4.4.
    expect(embeddings.embedQuery).toHaveBeenCalledWith("what is ORP?");
  });

  it("returns chunks in the order Firestore ranked them", async () => {
    const { adapter } = adapterFor([doc("a", 0.1), doc("b", 0.3), doc("c", 0.5)]);

    const chunks = await adapter.getContext("q");

    expect(chunks.map((chunk) => chunk.id)).toEqual(["a", "b", "c"]);
    expect(chunks[0].text).toBe("content a");
  });

  it("converts cosine distance to a higher-is-better score", async () => {
    const { adapter } = adapterFor([doc("a", 0.25)]);

    const [chunk] = await adapter.getContext("q");

    // Firestore returns distance (0 = identical); pgvector's fused score is higher-is-better.
    // Reporting distance verbatim would invert the ranking signal between the two RAG arms.
    expect(chunk.score).toBeCloseTo(0.75, 10);
  });

  it("orders scores consistently with the returned ranking", async () => {
    const { adapter } = adapterFor([doc("a", 0.1), doc("b", 0.4)]);

    const chunks = await adapter.getContext("q");

    expect(chunks[0].score as number).toBeGreaterThan(chunks[1].score as number);
  });

  it("omits score when Firestore returned no distance", async () => {
    const withoutDistance: FakeDoc = {
      id: "a",
      data: { filename: "doc.pdf", sourceUrl: null, text: "content a" },
    };
    const { adapter } = adapterFor([withoutDistance]);

    const [chunk] = await adapter.getContext("q");

    // `score` is optional in the seam precisely so an unranked result is expressible.
    expect(chunk).not.toHaveProperty("score");
  });

  it("requests topK documents, not the pgvector arm's fetch depth", async () => {
    const { adapter, calls } = adapterFor([]);

    await adapter.getContext("q");

    // No fusion here, so over-fetching would pay for reads the arm discards.
    expect(calls[0].options.limit).toBe(5);
  });

  it("honours an explicit topK", async () => {
    const many = [doc("a", 0.1), doc("b", 0.2), doc("c", 0.3)];
    const { adapter, calls } = adapterFor(many);

    const chunks = await adapter.getContext("q", { topK: 2 });

    expect(calls[0].options.limit).toBe(2);
    expect(chunks).toHaveLength(2);
  });

  it("caps topK at the shared maximum", async () => {
    const { adapter, calls } = adapterFor([]);

    await adapter.getContext("q", { topK: 999 });

    // Shared with every other adapter (options.ts), not a local constant.
    expect(calls[0].options.limit).toBe(10);
  });

  it("returns nothing — and queries nothing — for an empty query", async () => {
    const { adapter, calls } = adapterFor([doc("a", 0.1)]);

    const chunks = await adapter.getContext("   ");

    expect(chunks).toEqual([]);
    expect(calls).toHaveLength(0);
    // No embedding call either: an empty query must not cost money.
    expect(embeddings.embedQuery).not.toHaveBeenCalled();
  });

  it("returns nothing for a non-positive topK", async () => {
    const { adapter, calls } = adapterFor([doc("a", 0.1)]);

    const chunks = await adapter.getContext("q", { topK: 0 });

    expect(chunks).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(embeddings.embedQuery).not.toHaveBeenCalled();
  });

  it("prefers sourceUrl over filename for citations, matching the other arms", async () => {
    const { adapter } = adapterFor([doc("a", 0.1, { sourceUrl: "https://example.gov/doc" })]);

    const [chunk] = await adapter.getContext("q");

    expect(chunk.source).toBe("https://example.gov/doc");
  });

  it("falls back to filename when there is no sourceUrl", async () => {
    const { adapter } = adapterFor([doc("a", 0.1)]);

    const [chunk] = await adapter.getContext("q");

    expect(chunk.source).toBe("doc.pdf");
  });

  it("returns an empty array rather than throwing when nothing matches", async () => {
    // The arm's silent-failure mode: unseeded collection, missing index, or embeddings written
    // as plain arrays all look like this. It must not become an exception the runner records as
    // an error, nor pass unnoticed — the adapter logs a warning.
    const { adapter } = adapterFor([]);

    await expect(adapter.getContext("q")).resolves.toEqual([]);
  });
});
