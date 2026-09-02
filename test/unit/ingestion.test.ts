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

    it("KEEPS low-ratio text by default, which is what the corpus is ingested with", () => {
      // The default is `false` and `src/ingestion/ingest.ts` is the only production caller.
      // Measured 2026-08-31: turning the filter on removes 42 numeric-table chunks (34 of them
      // the `usgs-nfm-a6.2` oxygen-solubility tables) and zero chunks of genuine OCR noise.
      // Direct-feed consumes whole documents and keeps those tables; every vector arm loses
      // them — so a threshold question would be decided by the filter, not by the retrieval
      // strategy (`EVAL_REBUILD.md` §2b).
      expect(isQualityChunk(table)).toBe(true);
    });

    it("drops low-ratio text only when the escape hatch is switched on", () => {
      // `checkAlphaRatio` survives for a genuinely OCR-noisy document, should one be added.
      // Nothing in this corpus is one, so no caller sets it.
      expect(isQualityChunk(table, { checkAlphaRatio: true })).toBe(false);
    });

    it("still applies length and boilerplate rules with the ratio check off", () => {
      expect(isQualityChunk("short")).toBe(false);
      expect(isQualityChunk(`${table} click here to download`)).toBe(false);
    });
  });
});

describe("filterChunks", () => {
  it("passes options through to every chunk", () => {
    const table = `| a | 1 |\n${"| b | 2.34 |\n".repeat(20)}`;

    expect(filterChunks([table])).toHaveLength(1);
    expect(filterChunks([table], { checkAlphaRatio: true })).toHaveLength(0);
  });
});

describe("corpus metadata", () => {
  it("resolves known documents to their titles", () => {
    expect(metaFor("water-quality-metrics-source-of-truth.pdf").title).toMatch(/Source of Truth/);
    expect(metaFor("IORP_probe.pdf").title).toMatch(/ORP Probe/);
  });

  it("falls back to the filename for unknown documents", () => {
    expect(metaFor("mystery.pdf")).toEqual({ title: "mystery.pdf" });
  });

  it("excludes the corpus manifest from ingestion", () => {
    expect(EXCLUDED_FILES).toContain("README.md");
  });

  it("scopes the direct-feed slice to the operator reference and the probe datasheets", () => {
    // Every entry must be about a parameter the DataPod actually measures — the previous
    // slice was 83% a mangled table covering pollutants this sensor cannot detect.
    expect(DIRECT_FEED_SLICE).toHaveLength(5);
    expect(DIRECT_FEED_SLICE).toContain("water-quality-metrics-source-of-truth.pdf");
    expect(DIRECT_FEED_SLICE.filter((f) => f.includes("probe"))).toHaveLength(4);
  });
});

describe("estimateTokens", () => {
  it("uses the legacy 4-chars-per-token heuristic", () => {
    expect(estimateTokens(4000)).toBe(1000);
  });
});
