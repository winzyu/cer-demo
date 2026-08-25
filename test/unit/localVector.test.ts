import fs from "fs";
import os from "os";
import path from "path";
import {
  BUILD_COMMAND,
  LocalVectorAdapter,
  cosineSimilarity,
  dotProduct,
  magnitude,
  readEmbeddingCache,
} from "../../src/retrieval/adapters/LocalVectorAdapter";
import type { CachedChunk, EmbeddingCache } from "../../src/retrieval/adapters/LocalVectorAdapter";
import { EMBEDDING_DIMENSIONS, EmbeddingService } from "../../src/services/EmbeddingService";
import { MAX_TOP_K } from "../../src/retrieval/options";
import { config } from "../../src/config";

/**
 * The `local-vector` arm, offline.
 *
 * This arm's entire justification over `firestore-vector` is that a setup problem *fails* instead
 * of returning nothing. So the assertions that matter most here are the negative ones: a missing
 * cache, a cache from another embedding model, a wrong-width vector, and an all-zero vector must
 * each throw with the command that fixes them. A regression that turned any of those back into an
 * empty result would leave the bot answering fluently and ungrounded — which is precisely the
 * failure the whole adapter was written to delete.
 */

/** Pads a hand-written prefix out to the real embedding width, so the guards see a valid shape. */
const vec = (values: number[]): number[] => {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  values.forEach((value, index) => { vector[index] = value; });
  return vector;
};

const chunk = (id: string, embedding: number[]): CachedChunk => ({
  id,
  source: `https://example.test/${id}`,
  text: `content ${id}`,
  embedding,
});

let directory: string;
let counter = 0;

beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "local-vector-"));
});

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Writes a cache fixture and returns its path. Defaults are the *valid* values. */
const writeCache = (overrides: Partial<EmbeddingCache> = {}): string => {
  counter += 1;
  const cachePath = path.join(directory, `cache-${counter}.json`);
  const chunks = overrides.chunks ?? [chunk("a", vec([1]))];

  const cache: EmbeddingCache = {
    model: config.fireworks.embeddingModel,
    dimensions: EMBEDDING_DIMENSIONS,
    chunkCount: chunks.length,
    generatedAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
    chunks,
  };

  fs.writeFileSync(cachePath, JSON.stringify(cache));
  return cachePath;
};

const embeddingsReturning = (vector: number[]) => {
  const service = { embedQuery: jest.fn(async () => vector) };
  return { service: service as unknown as EmbeddingService, spy: service.embedQuery };
};

describe("cosine arithmetic", () => {
  it("computes a dot product", () => {
    expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it("refuses vectors of different widths rather than scoring a prefix", () => {
    expect(() => dotProduct([1, 2], [1, 2, 3])).toThrow(/dot product/);
  });

  it("computes a magnitude", () => {
    expect(magnitude([3, 4])).toBe(5);
  });

  it("computes a hand-checkable cosine", () => {
    // (3·4 + 4·3) / (5 · 5) = 24 / 25.
    expect(cosineSimilarity([3, 4], [4, 3])).toBeCloseTo(0.96, 12);
  });

  it("scores an identical vector at 1 and an opposite one at -1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 12);
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 12);
  });

  it("throws on a zero vector instead of returning NaN", () => {
    // NaN scores sort arbitrarily, which is a silently wrong ranking rather than a failure.
    expect(() => cosineSimilarity([0, 0], [1, 1])).toThrow(/zero vector/);
  });
});

describe("LocalVectorAdapter", () => {
  it("registers under the mode the registry selects", () => {
    expect(new LocalVectorAdapter(writeCache()).mode).toBe("local-vector");
  });

  it("ranks by cosine similarity, highest first", async () => {
    // Query is e0. cos(e0, [3,4]) = 0.6; cos(e0, [1,1]) = 0.707…; cos(e0, [1,0]) = 1.
    const cachePath = writeCache({
      chunks: [chunk("far", vec([3, 4])), chunk("mid", vec([1, 1])), chunk("near", vec([1]))],
    });
    const { service } = embeddingsReturning(vec([1]));

    const chunks = await new LocalVectorAdapter(cachePath, service).getContext("q", { topK: 3 });

    expect(chunks.map((c) => c.id)).toEqual(["near", "mid", "far"]);
    expect(chunks[0].score).toBeCloseTo(1, 12);
    expect(chunks[1].score).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(chunks[2].score).toBeCloseTo(0.6, 12);
  });

  it("returns the cosine as a higher-is-better score, matching 1 - Firestore's distance", async () => {
    // FirestoreVectorAdapter reports `1 - cosine_distance`, which is the same quantity. The two
    // arms' scores have to be directly comparable for the equivalence check to mean anything.
    const cachePath = writeCache({ chunks: [chunk("a", vec([4, 3]))] });
    const { service } = embeddingsReturning(vec([3, 4]));

    const [only] = await new LocalVectorAdapter(cachePath, service).getContext("q");

    expect(only.score).toBeCloseTo(0.96, 12);
  });

  it("respects topK", async () => {
    const cachePath = writeCache({
      chunks: [chunk("a", vec([1])), chunk("b", vec([1, 1])), chunk("c", vec([1, 9]))],
    });
    const { service } = embeddingsReturning(vec([1]));

    const chunks = await new LocalVectorAdapter(cachePath, service).getContext("q", { topK: 2 });

    expect(chunks.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("clamps topK to MAX_TOP_K rather than returning the whole corpus", async () => {
    // Sized off MAX_TOP_K rather than a literal, so the ceiling can move without this test
    // quietly becoming a no-op (it did move, 10 -> 50, on 2026-08-24).
    const chunks = Array.from({ length: MAX_TOP_K + 10 }, (_, i) => chunk(`c${i}`, vec([1, i])));
    const cachePath = writeCache({ chunks });
    const { service } = embeddingsReturning(vec([1]));

    const result = await new LocalVectorAdapter(cachePath, service).getContext("q", { topK: 9999 });

    expect(result).toHaveLength(MAX_TOP_K);
  });

  it("breaks exact ties by id, so a ranking is reproducible", async () => {
    const cachePath = writeCache({
      chunks: [chunk("z", vec([1])), chunk("a", vec([2])), chunk("m", vec([3]))],
    });
    const { service } = embeddingsReturning(vec([1]));

    const chunks = await new LocalVectorAdapter(cachePath, service).getContext("q", { topK: 3 });

    // All three are collinear with the query, so every cosine is exactly 1.
    expect(chunks.map((c) => c.id)).toEqual(["a", "m", "z"]);
  });

  it("carries the citation source through unchanged", async () => {
    const cachePath = writeCache({ chunks: [chunk("a", vec([1]))] });
    const { service } = embeddingsReturning(vec([1]));

    const [only] = await new LocalVectorAdapter(cachePath, service).getContext("q");

    expect(only.source).toBe("https://example.test/a");
    expect(only.text).toBe("content a");
  });

  it("embeds through EmbeddingService, so the nomic search_query prefix is applied", async () => {
    const cachePath = writeCache();
    const { service, spy } = embeddingsReturning(vec([1]));

    await new LocalVectorAdapter(cachePath, service).getContext("what is ORP?");

    // Dropping search_query: degrades retrieval with no error anywhere — MIGRATION_SPEC §4.4.
    expect(spy).toHaveBeenCalledWith("what is ORP?");
  });

  describe("degenerate-case guards", () => {
    it("returns nothing for an empty query, without paying for an embedding", async () => {
      const { service, spy } = embeddingsReturning(vec([1]));

      expect(await new LocalVectorAdapter(writeCache(), service).getContext("   ")).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });

    it("returns nothing for topK 0, without paying for an embedding", async () => {
      const { service, spy } = embeddingsReturning(vec([1]));

      const chunks = await new LocalVectorAdapter(writeCache(), service)
        .getContext("q", { topK: 0 });

      expect(chunks).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("failing loudly", () => {
    it("throws when the cache does not exist, naming the command that builds it", async () => {
      const { service } = embeddingsReturning(vec([1]));
      const missing = path.join(directory, "not-built.json");

      await expect(new LocalVectorAdapter(missing, service).getContext("q"))
        .rejects.toThrow(new RegExp(BUILD_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    });

    it("checks the cache before embedding, so a broken setup costs nothing", async () => {
      const { service, spy } = embeddingsReturning(vec([1]));
      const missing = path.join(directory, "not-built.json");

      await expect(new LocalVectorAdapter(missing, service).getContext("q")).rejects.toThrow();
      expect(spy).not.toHaveBeenCalled();
    });

    it("throws when the cache was built with a different embedding model", async () => {
      const cachePath = writeCache({ model: "some-other/embedding-model" });
      const { service } = embeddingsReturning(vec([1]));

      await expect(new LocalVectorAdapter(cachePath, service).getContext("q"))
        .rejects.toThrow(/some-other\/embedding-model/);
    });

    it("throws when the cache declares the wrong dimension", async () => {
      const cachePath = writeCache({ dimensions: 192 });
      const { service } = embeddingsReturning(vec([1]));

      await expect(new LocalVectorAdapter(cachePath, service).getContext("q"))
        .rejects.toThrow(/192 dimensions/);
    });

    it("throws when a stored vector is the wrong width", async () => {
      const cachePath = writeCache({ chunks: [chunk("a", [0.1, 0.2, 0.3])] });
      const { service } = embeddingsReturning(vec([1]));

      await expect(new LocalVectorAdapter(cachePath, service).getContext("q"))
        .rejects.toThrow(/3-dimension vector for chunk "a"/);
    });

    it("throws on an all-zero vector — the encoding_format bug's signature", async () => {
      const cachePath = writeCache({ chunks: [chunk("a", vec([]))] });
      const { service } = embeddingsReturning(vec([1]));

      await expect(new LocalVectorAdapter(cachePath, service).getContext("q"))
        .rejects.toThrow(/all-zero vector for chunk "a"/);
    });

    it("throws on an empty cache rather than returning no context", async () => {
      const cachePath = writeCache({ chunks: [] });
      const { service } = embeddingsReturning(vec([1]));

      await expect(new LocalVectorAdapter(cachePath, service).getContext("q"))
        .rejects.toThrow(/holds no chunks/);
    });

    it("detects a truncated write via the declared chunk count", async () => {
      const cachePath = writeCache({ chunks: [chunk("a", vec([1]))], chunkCount: 393 });
      const { service } = embeddingsReturning(vec([1]));

      await expect(new LocalVectorAdapter(cachePath, service).getContext("q"))
        .rejects.toThrow(/declares 393 chunks but holds 1/);
    });

    it("throws when the query embeds to a different width than the cache", async () => {
      const cachePath = writeCache();
      const { service } = embeddingsReturning([0.1, 0.2, 0.3]);

      await expect(new LocalVectorAdapter(cachePath, service).getContext("q"))
        .rejects.toThrow(/the query embedded to 3/);
    });

    it("reports every problem at once, like config validation does", async () => {
      const cachePath = writeCache({ model: "wrong/model", dimensions: 192 });
      const { service } = embeddingsReturning(vec([1]));

      await expect(new LocalVectorAdapter(cachePath, service).getContext("q"))
        .rejects.toThrow(/wrong\/model[\s\S]*192 dimensions/);
    });
  });

  describe("caching", () => {
    it("reads the cache once per process, not once per query", async () => {
      const cachePath = writeCache();
      const { service } = embeddingsReturning(vec([1]));
      const adapter = new LocalVectorAdapter(cachePath, service);

      await adapter.getContext("first");
      fs.rmSync(cachePath);

      // Still answers: the index is in memory, and re-reading it per request would add disk
      // work to every query for bytes that never change.
      await expect(adapter.getContext("second")).resolves.toHaveLength(1);
    });

    it("does not cache a failure, so rebuilding the cache fixes the arm without a restart", async () => {
      counter += 1;
      const cachePath = path.join(directory, `late-${counter}.json`);
      const { service } = embeddingsReturning(vec([1]));
      const adapter = new LocalVectorAdapter(cachePath, service);

      await expect(adapter.getContext("q")).rejects.toThrow();

      fs.copyFileSync(writeCache(), cachePath);

      await expect(adapter.getContext("q")).resolves.toHaveLength(1);
    });
  });
});

describe("readEmbeddingCache", () => {
  it("rejects a file that is not JSON at all", () => {
    counter += 1;
    const cachePath = path.join(directory, `garbage-${counter}.json`);
    fs.writeFileSync(cachePath, "not json {");

    expect(() => readEmbeddingCache(cachePath)).toThrow(/not valid JSON/);
  });

  it("returns the parsed cache when everything checks out", () => {
    const cache = readEmbeddingCache(writeCache());

    expect(cache.model).toBe(config.fireworks.embeddingModel);
    expect(cache.dimensions).toBe(EMBEDDING_DIMENSIONS);
    expect(cache.chunks).toHaveLength(1);
  });
});
