import {
  CHUNK_SIZE_CHARS,
  MIN_QUALITY_CHARS,
  OVERLAP_CHARS,
  chunkText,
  filterChunks,
  isQualityChunk,
} from "../../src/ingestion/chunk";
import { DIRECT_FEED_SLICE, EXCLUDED_FILES, metaFor } from "../../src/ingestion/corpus";
import { estimateTokens } from "../../src/ingestion/ingest";

const prose = (n: number) => "The quick brown fox jumps over the lazy dog. ".repeat(n);

describe("chunkText", () => {
  it("keeps short text as a single chunk", () => {
    expect(chunkText("a short document")).toEqual(["a short document"]);
  });

  it("splits long text into multiple chunks", () => {
    const chunks = chunkText(prose(400));
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("prepends the previous chunk's tail as overlap, so boundaries are not lossy", () => {
    const chunks = chunkText(prose(400));
    const [first, second] = chunks;

    expect(second.startsWith(first.slice(-OVERLAP_CHARS))).toBe(true);
  });

  it("does not exceed the size limit before overlap is added", () => {
    // Overlap is prepended after splitting, so base pieces must respect the limit.
    chunkText(prose(600)).slice(1).forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE_CHARS + OVERLAP_CHARS);
    });
  });

  it("returns nothing for empty or whitespace input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
  });
});

describe("isQualityChunk", () => {
  it("drops chunks below the minimum length", () => {
    expect(isQualityChunk("too short")).toBe(false);
    expect("too short".length).toBeLessThan(MIN_QUALITY_CHARS);
  });

  it("keeps ordinary prose", () => {
    expect(isQualityChunk(prose(5))).toBe(true);
  });

  it("drops PDF boilerplate regardless of length", () => {
    expect(isQualityChunk(`${prose(5)} click here to download`)).toBe(false);
    expect(isQualityChunk(`${prose(5)} Adobe Acrobat Reader required`)).toBe(false);
  });

  describe("alphabetic-ratio test", () => {
    // A markdown table: mostly pipes, digits and URLs. Ratio ~0.1.
    const table = `| Pollutant | CMC | CCC | Year |\n${
      "| ---- | 0.0123 | 0.0456 | 1980 |\n".repeat(20)}`;

    it("drops low-ratio text by default (OCR noise, PDF furniture)", () => {
      expect(isQualityChunk(table)).toBe(false);
    });

    it("KEEPS low-ratio text when the ratio check is disabled (structured sources)", () => {
      // The confound this prevents: without the exemption the vector arms lose most of the
      // criteria table while direct-feed keeps it, so threshold questions would be decided
      // by the filter rather than by the retrieval strategy.
      expect(isQualityChunk(table, { checkAlphaRatio: false })).toBe(true);
    });

    it("still applies length and boilerplate rules when the ratio check is off", () => {
      expect(isQualityChunk("short", { checkAlphaRatio: false })).toBe(false);
      expect(
        isQualityChunk(`${table} click here to download`, { checkAlphaRatio: false }),
      ).toBe(false);
    });
  });
});

describe("filterChunks", () => {
  it("passes options through to every chunk", () => {
    const table = `| a | 1 |\n${"| b | 2.34 |\n".repeat(20)}`;

    expect(filterChunks([table])).toHaveLength(0);
    expect(filterChunks([table], { checkAlphaRatio: false })).toHaveLength(1);
  });
});

describe("corpus metadata", () => {
  it("resolves known documents to their titles", () => {
    expect(metaFor("aquatic-life-criteria-table.md").title).toMatch(/Aquatic Life Criteria/);
  });

  it("falls back to the filename for unknown documents", () => {
    expect(metaFor("mystery.pdf")).toEqual({ title: "mystery.pdf" });
  });

  it("excludes the corpus manifest from ingestion", () => {
    expect(EXCLUDED_FILES).toContain("README.md");
  });

  it("defines the direct-feed slice as the three small-tier documents", () => {
    expect(DIRECT_FEED_SLICE).toHaveLength(3);
    expect(DIRECT_FEED_SLICE).toContain("aquatic-life-criteria-table.md");
  });
});

describe("estimateTokens", () => {
  it("uses the legacy 4-chars-per-token heuristic", () => {
    expect(estimateTokens(4000)).toBe(1000);
  });
});
