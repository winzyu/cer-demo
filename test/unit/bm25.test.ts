import { Bm25Index, tokenize, type Bm25Document } from "../../src/retrieval/lexical/Bm25Index";

/**
 * The tokenizer is where this arm earns its keep, so most of these tests are about it. The obvious
 * implementation — lowercase, strip non-alphanumerics, split on whitespace — destroys exactly the
 * rare tokens lexical retrieval exists to catch, and it does so silently.
 */
describe("tokenize", () => {
  it("keeps units whole and also indexes their parts", () => {
    // The whole form is rare, so IDF weights it heavily; the parts keep a query that spells the
    // unit out from missing entirely.
    expect(tokenize("μS/cm")).toEqual(["μs/cm", "μs", "cm"]);
    expect(tokenize("mg/L")).toEqual(["mg/l", "mg"]);
  });

  it("drops single-character compound parts, which match everywhere and mean nothing", () => {
    expect(tokenize("mg/L")).not.toContain("l");
  });

  it("preserves decimals and document numbers rather than splitting them", () => {
    expect(tokenize("pH 6.5")).toEqual(["ph", "6.5"]);
    // "9" is dropped by the same single-character rule that drops the "l" of mg/L — a bare digit
    // matches everywhere and carries no signal. The whole form and "a6.4" both survive.
    expect(tokenize("TM 9-A6.4")).toEqual(["tm", "9-a6.4", "a6.4"]);
  });

  /**
   * The corpus writes micro as U+03BC and a keyboard emits U+00B5. They are visually identical and
   * compare unequal, so without NFKC a user typing the unit would match nothing.
   */
  it("folds the two micro signs onto one term", () => {
    expect(tokenize("µS/cm")).toEqual(tokenize("μS/cm"));
  });

  it("strips trailing sentence punctuation without eating internal punctuation", () => {
    expect(tokenize("6.5, mg/L.")).toEqual(["6.5", "mg/l", "mg"]);
  });

  it("case-folds so acronyms match however they are typed", () => {
    expect(tokenize("NTU")).toEqual(tokenize("ntu"));
    expect(tokenize("KCl")).toEqual(tokenize("kcl"));
  });
});

describe("Bm25Index", () => {
  const docs: Bm25Document[] = [
    { id: "a", source: "a.pdf", text: "turbidity is measured in NTU using white light" },
    { id: "b", source: "b.pdf", text: "turbidity in FNU uses infrared light" },
    { id: "c", source: "c.pdf", text: "turbidity turbidity turbidity everywhere in water" },
    { id: "d", source: "d.pdf", text: "KCl creep on the reference electrode junction" },
  ];
  const index = new Bm25Index(docs);

  it("ranks the chunk containing the rare exact token first", () => {
    // The whole point: "KCl" appears once in the corpus, so IDF makes it decisive.
    expect(index.search("KCl creep", 1)[0].id).toBe("d");
    expect(index.search("FNU", 1)[0].id).toBe("b");
  });

  /**
   * The Lucene `+1` IDF form is used precisely so a near-universal term floors at ~0 instead of
   * going negative — a negative contribution can rank a chunk below one that matched nothing.
   */
  it("gives a term appearing in most documents near-zero weight, never negative", () => {
    const common = index.idf("turbidity");
    expect(common).toBeGreaterThanOrEqual(0);
    expect(common).toBeLessThan(index.idf("kcl"));
  });

  it("does not let term spamming beat a genuine match", () => {
    // "c" repeats "turbidity" three times; "a" actually answers an NTU question.
    expect(index.search("turbidity in NTU", 1)[0].id).toBe("a");
  });

  it("respects topK and returns nothing for degenerate input", () => {
    expect(index.search("turbidity", 2)).toHaveLength(2);
    expect(index.search("", 5)).toEqual([]);
    expect(index.search("turbidity", 0)).toEqual([]);
  });

  it("returns nothing when no query term is in the vocabulary", () => {
    expect(index.search("zzzz nonexistent", 5)).toEqual([]);
  });

  it("refuses to build over an empty corpus rather than silently ranking nothing", () => {
    // Same rule as the vector arm: a setup failure must be loud, because an empty index and a
    // corpus with no answer are indistinguishable downstream.
    expect(() => new Bm25Index([])).toThrow(/zero documents/);
  });

  it("rejects duplicate chunk ids, which would double-count under fusion", () => {
    expect(() => new Bm25Index([docs[0], { ...docs[0] }])).toThrow(/Duplicate chunk id/);
  });
});
