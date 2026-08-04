import {
  CORPUS_DOCUMENT_WARN_BYTES, FIRESTORE_DOCUMENT_LIMIT_BYTES, corpusDocumentBytes,
  corpusDocumentFields,
} from "../../src/retrieval/sources/FirestoreCorpusSource";

const document = {
  filename: "a.pdf",
  title: "A",
  sourceUrl: "https://example.test/a",
  text: "body text",
  inDirectFeedSlice: true,
  chars: 9,
  method: "pdf",
};

describe("corpusDocumentFields", () => {
  it("writes exactly the fields FirestoreCorpusSource reads back", () => {
    expect(corpusDocumentFields(document, "2026-08-03T00:00:00.000Z")).toEqual({
      filename: "a.pdf",
      title: "A",
      sourceUrl: "https://example.test/a",
      text: "body text",
      inDirectFeedSlice: true,
      chars: 9,
      method: "pdf",
      generatedAt: "2026-08-03T00:00:00.000Z",
    });
  });

  /**
   * The regression this whole change exists for. `chunks` took the largest corpus document to 96%
   * of Firestore's per-document limit, where one more chunk would have broken `seed:firestore`.
   */
  it("does NOT store chunks — nothing reads them and they nearly broke the size limit", () => {
    const fields = corpusDocumentFields(
      { ...document, chunks: ["one", "two"] } as typeof document,
      "2026-08-03T00:00:00.000Z",
    );

    expect(fields).not.toHaveProperty("chunks");
    expect(JSON.stringify(fields)).not.toContain("two");
  });

  it("normalises a missing sourceUrl to null rather than dropping the field", () => {
    const { sourceUrl, ...withoutUrl } = document;
    expect(corpusDocumentFields(withoutUrl, "t").sourceUrl).toBeNull();
  });
});

describe("corpus document size guard", () => {
  it("leaves headroom below Firestore's hard limit", () => {
    expect(CORPUS_DOCUMENT_WARN_BYTES).toBeLessThan(FIRESTORE_DOCUMENT_LIMIT_BYTES);
    expect(FIRESTORE_DOCUMENT_LIMIT_BYTES).toBe(1_048_576);
  });

  it("measures the serialised size of what is actually written", () => {
    const fields = corpusDocumentFields({ ...document, text: "x".repeat(1000) }, "t");
    expect(corpusDocumentBytes(fields)).toBeGreaterThan(1000);
    expect(corpusDocumentBytes(fields)).toBeLessThan(1200);
  });

  it("counts multi-byte characters by bytes, not by length", () => {
    const ascii = corpusDocumentFields({ ...document, text: "aaa" }, "t");
    const multiByte = corpusDocumentFields({ ...document, text: "日本語" }, "t");

    expect(corpusDocumentBytes(multiByte)).toBeGreaterThan(corpusDocumentBytes(ascii));
  });
});
