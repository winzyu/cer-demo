import {
  cleanSubQueries, decomposeQuery, DECOMPOSE_MAX_CHARS, DECOMPOSE_MAX_QUERIES, mergeRankings,
} from "../../src/retrieval/queryDecompose";
import { rewriteFirstTurn } from "../../src/retrieval/queryRewrite";
import type { Chunk } from "../../src/types/retrieval.types";

const replying = (content: string) => ({ complete: jest.fn().mockResolvedValue({ content }) });
const failing = () => ({ complete: jest.fn().mockRejectedValue(new Error("provider down")) });
const chunks = (...ids: string[]): Chunk[] => ids.map((id) => ({ id, text: id, source: `${id}.md` }));

describe("cleanSubQueries", () => {
  it("strips bullets, numbering and quotes, and drops blank lines", () => {
    expect(cleanSubQueries("1. \"ORP drift\"\n\n- dissolved oxygen steady state\n2) salinity")).toEqual([
      "ORP drift", "dissolved oxygen steady state", "salinity",
    ]);
  });

  it("drops case-insensitive duplicates and caps the count", () => {
    const raw = ["a", "A", "b", "c", "d"].join("\n");
    expect(cleanSubQueries(raw)).toEqual(["a", "b", "c"].slice(0, DECOMPOSE_MAX_QUERIES));
  });

  it("drops an overlong line as an answer rather than a query", () => {
    expect(cleanSubQueries(`${"x".repeat(DECOMPOSE_MAX_CHARS + 1)}\nshort`)).toEqual(["short"]);
  });
});

describe("decomposeQuery", () => {
  it("returns the sub-queries when the model splits the question", async () => {
    const result = await decomposeQuery(replying("ORP drift\nDO steady state"), "ORP drift and DO?");
    expect(result).toMatchObject({ queries: ["ORP drift", "DO steady state"], decomposed: true });
  });

  it("keeps a single-subject question as the query alone", async () => {
    const result = await decomposeQuery(replying("pH calibration"), "pH calibration");
    expect(result).toMatchObject({ queries: ["pH calibration"], decomposed: false });
  });

  it("falls back to the query on empty output or a failed call", async () => {
    await expect(decomposeQuery(replying("\n  \n"), "q")).resolves.toMatchObject({ queries: ["q"], decomposed: false });
    await expect(decomposeQuery(failing(), "q")).resolves.toMatchObject({ queries: ["q"], decomposed: false });
  });
});

describe("mergeRankings", () => {
  it("interleaves rank by rank, first ranking first, and drops repeats", () => {
    const merged = mergeRankings([chunks("a1", "a2", "s"), chunks("b1", "a1", "b3")], 10);
    expect(merged.map((c) => c.id)).toEqual(["a1", "b1", "a2", "s", "b3"]);
  });

  it("cuts at k", () => {
    expect(mergeRankings([chunks("a1", "a2"), chunks("b1", "b2")], 3).map((c) => c.id)).toEqual(["a1", "b1", "a2"]);
  });

  it("is the first ranking unchanged when it is the only one", () => {
    expect(mergeRankings([chunks("a", "b")], 2).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("rewriteFirstTurn", () => {
  it("returns the model's query", async () => {
    const result = await rewriteFirstTurn(replying("turbidity after storm runoff"), "readings weird after the storm?");
    expect(result).toMatchObject({ query: "turbidity after storm runoff", rewritten: true });
  });

  it("falls back to the question on empty output or a failed call", async () => {
    await expect(rewriteFirstTurn(replying(""), "q")).resolves.toMatchObject({ query: "q", rewritten: false });
    await expect(rewriteFirstTurn(failing(), "q")).resolves.toMatchObject({ query: "q", rewritten: false });
  });
});
