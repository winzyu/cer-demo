import {
  DOCUMENT_PREFIX,
  EMBED_BATCH,
  EmbeddingService,
  QUERY_PREFIX,
  batched,
} from "../../src/services/EmbeddingService";

/**
 * The embedding path, without a network call.
 *
 * These guards protect live code: `EmbeddingService` is what the `firestore-vector` arm embeds
 * queries with and what `scripts/seedFirestoreChunks.ts` embeds the corpus with. The failure
 * modes are silent ones — a dropped nomic prefix, a shuffled batch, or the documented Fireworks
 * bug where omitting `encoding_format` returns a corrupt 192-element all-zero vector with no
 * error — all of which degrade retrieval while looking healthy.
 *
 * Carved out of `pgvectorRag.test.ts` when the pgvector arm was archived on 2026-08-19; the arm
 * went, this did not. Kept separate after the arm was restored on 2026-08-21 — `EmbeddingService`
 * serves `firestore-vector` and `seedFirestoreChunks.ts` too, and these guards must never again be
 * able to leave the tree with one arm.
 */

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

    // Caught at embed time, naming the expected 768, rather than downstream at write time
    // where the store reports it — if it reports it at all.
    await expect(service.embedQuery("q")).rejects.toThrow(/768/);
  });

  it("batches exactly at the boundary", () => {
    expect(batched(new Array(32).fill("x"), 32)).toHaveLength(1);
    expect(batched(new Array(33).fill("x"), 32)).toHaveLength(2);
    expect(batched([], 32)).toEqual([]);
  });
});
