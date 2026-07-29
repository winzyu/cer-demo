import { DirectFeedAdapter } from "../../src/retrieval/adapters/DirectFeedAdapter";
import { ArtifactCorpusSource } from "../../src/retrieval/sources/ArtifactCorpusSource";
import { FirestoreCorpusSource } from "../../src/retrieval/sources/FirestoreCorpusSource";
import type { CorpusDocument, CorpusSource } from "../../src/retrieval/sources/corpusSource";

const docs: CorpusDocument[] = [
  {
    filename: "a.md", title: "A", sourceUrl: "https://example.test/a", text: "alpha text",
  },
  { filename: "b.pdf", title: "B", text: "bravo text" },
];

const sourceOf = (
  documents: CorpusDocument[],
  loadSlice = jest.fn().mockResolvedValue(documents),
): { source: CorpusSource; loadSlice: jest.Mock } => ({
  source: { name: "fake", loadSlice } as CorpusSource,
  loadSlice,
});

describe("DirectFeedAdapter", () => {
  it("registers under the firestore-direct mode", () => {
    expect(new DirectFeedAdapter(sourceOf(docs).source).mode).toBe("firestore-direct");
  });

  it("returns every slice document whole, in source order", async () => {
    const adapter = new DirectFeedAdapter(sourceOf(docs).source);

    const chunks = await adapter.getContext("what is ORP?");

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      id: "a.md", text: "alpha text", source: "https://example.test/a",
    });
    // No sourceUrl => cite the filename rather than emitting undefined.
    expect(chunks[1].source).toBe("b.pdf");
  });

  it("assigns no score — the slice is unranked", async () => {
    const chunks = await new DirectFeedAdapter(sourceOf(docs).source).getContext("q");
    chunks.forEach((chunk) => expect(chunk.score).toBeUndefined());
  });

  it("IGNORES topK — truncating an unranked slice would drop documents arbitrarily", async () => {
    const adapter = new DirectFeedAdapter(sourceOf(docs).source);

    expect(await adapter.getContext("q", { topK: 1 })).toHaveLength(2);
  });

  it("returns nothing for an empty query, like every other adapter", async () => {
    const { source, loadSlice } = sourceOf(docs);

    expect(await new DirectFeedAdapter(source).getContext("   ")).toEqual([]);
    expect(loadSlice).not.toHaveBeenCalled();
  });

  it("loads the slice once per process, not once per request", async () => {
    // The slice is identical every time; re-reading would add cost and latency for the same
    // bytes, and on Firestore would burn free-tier read quota for nothing.
    const { source, loadSlice } = sourceOf(docs);
    const adapter = new DirectFeedAdapter(source);

    await adapter.getContext("first");
    await adapter.getContext("second");
    await adapter.getContext("third");

    expect(loadSlice).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure, so a transient error cannot disable the arm", async () => {
    const loadSlice = jest
      .fn()
      .mockRejectedValueOnce(new Error("datastore unavailable"))
      .mockResolvedValue(docs);
    const adapter = new DirectFeedAdapter(sourceOf(docs, loadSlice).source);

    await expect(adapter.getContext("q")).rejects.toThrow("datastore unavailable");
    expect(await adapter.getContext("q")).toHaveLength(2);
    expect(loadSlice).toHaveBeenCalledTimes(2);
  });

  it("returns nothing rather than throwing when the slice is empty", async () => {
    // Setup failure, not a request failure — logged loudly, but the request still completes.
    expect(await new DirectFeedAdapter(sourceOf([]).source).getContext("q")).toEqual([]);
  });
});

describe("ArtifactCorpusSource", () => {
  it("reads the real ingestion artifact and returns only the slice", async () => {
    // Depends on `npm run ingest` having been run; that is the documented prerequisite.
    const slice = await new ArtifactCorpusSource().loadSlice();

    expect(slice).toHaveLength(5);
    expect(slice.map((d) => d.filename)).toContain("water-quality-metrics-source-of-truth.pdf");
    slice.forEach((document) => expect(document.text.length).toBeGreaterThan(0));
  });

  it("fails loudly when the artifact is missing", async () => {
    await expect(new ArtifactCorpusSource("data/corpus/nope.json").loadSlice()).rejects.toThrow(
      /npm run ingest/,
    );
  });
});

describe("FirestoreCorpusSource", () => {
  it("queries the slice ordered by filename for a stable prompt prefix", async () => {
    // Order matters beyond tidiness: an unstable order changes the prompt prefix between runs
    // and destroys the cache-hit rate this arm's cost case depends on.
    const get = jest.fn().mockResolvedValue({
      docs: [{ data: () => ({ filename: "a.md", title: "A", text: "alpha" }) }],
    });
    const orderBy = jest.fn().mockReturnValue({ get });
    const where = jest.fn().mockReturnValue({ orderBy });
    const collection = jest.fn().mockReturnValue({ where });

    const slice = await new FirestoreCorpusSource({ collection } as never).loadSlice();

    expect(collection).toHaveBeenCalledWith("corpus_documents");
    expect(where).toHaveBeenCalledWith("inDirectFeedSlice", "==", true);
    expect(orderBy).toHaveBeenCalledWith("filename");
    expect(slice[0].filename).toBe("a.md");
  });
});
