import { loadFixtures } from "../../src/eval/fixtures";
import { loadLabels } from "../../src/eval/retrieval/labels";
import { GoldContextAdapter } from "../../src/retrieval/adapters/GoldContextAdapter";

/**
 * Exercised against the real label files and the real ingestion artifact — same pattern as
 * `ArtifactCorpusSource` in `directFeed.test.ts` — since this adapter's entire job is reading
 * those two things correctly. No network, no embeddings.
 */
describe("GoldContextAdapter", () => {
  it("registers under the gold-context mode", () => {
    expect(new GoldContextAdapter().mode).toBe("gold-context");
  });

  it("returns exactly a known turn's labelled chunks, with real text, in document/chunk order", async () => {
    const query = "We put a pod below an old mine adit. Water is running about pH 3.2 and the "
      + "conductivity trace looks wrong to me — higher than the grab samples the lab ran. Is the "
      + "low pH capable of throwing the conductivity off, and if so by how much?";

    const chunks = await new GoldContextAdapter().getContext(query);

    // The label file lists this turn's 9 chunks out of document order (a6.4's chunk 41 appears
    // before chunk 32) — asserting this exact order proves the adapter re-sorts by document
    // position and chunk index rather than replaying the label file's own ordering.
    expect(chunks.map((c) => c.id)).toEqual([
      "usgs-nfm-a6.3-specific-conductance.pdf__361ef9509206",
      "usgs-nfm-a6.3-specific-conductance.pdf__e7c93d2b2493",
      "usgs-nfm-a6.3-specific-conductance.pdf__619a464ebb28",
      "usgs-nfm-a6.4-ph.pdf__1d9450892586",
      "usgs-nfm-a6.4-ph.pdf__b1653e60dd01",
      "usgs-nfm-a6.4-ph.pdf__ff61308669d5",
      "usgs-nfm-a6.4-ph.pdf__434fe1dc3109",
      "usgs-nfm-a6.4-ph.pdf__147ba11e0c62",
      "usgs-nfm-a6.4-ph.pdf__164de423e5e7",
    ]);
    chunks.forEach((chunk) => {
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.source).toBeTruthy();
      expect(chunk.score).toBeUndefined();
    });
    expect(chunks[0].text).toContain("factors can result in");
  });

  it("supplies per-turn explanatory context even when the requested value must be refused", async () => {
    const fixtures = loadFixtures().filter((fixture) => fixture.class === "refusal");
    const labels = loadLabels();
    const adapter = new GoldContextAdapter();
    expect(fixtures).toHaveLength(4);
    for (const fixture of fixtures) {
      for (const turn of fixture.turns) {
        const chunks = await adapter.getContext(turn.content);
        expect(turn.requires_refusal).toBe(true);
        expect(chunks.length).toBeGreaterThan(0);
        for (const evidence of turn.retrieval_evidence ?? []) {
          expect(chunks.some((chunk) => chunk.text.includes(evidence.quote))).toBe(true);
        }
        const label = labels.queries.find((query) => query.label.query === turn.content)?.label;
        expect(label?.noRelevantChunks).toBeUndefined();
      }
    }
    const buffering = fixtures.find((fixture) => fixture.id === "refusal-buffering-capacity-not-measured")!;
    const first = await adapter.getContext(buffering.turns[0].content);
    const second = await adapter.getContext(buffering.turns[1].content);
    expect(first.map((chunk) => chunk.id)).not.toEqual(second.map((chunk) => chunk.id));
  });

  it("includes new source-supported numerical branches and calibration alternatives", async () => {
    const fixtures = loadFixtures();
    const adapter = new GoldContextAdapter();
    const cases = [
      ["deepmanual-sonde-settle-time", 1, "10% of the measured value for turbidity >100 TU"],
      ["probecal-ph-slope-acceptance", 0, "Slope Acceptance Criteria: 95% to 102%"],
      ["crossdoc-sonde-sensor-order", 0, "sodium sulfite"],
    ] as const;
    for (const [id, turn, text] of cases) {
      const fixture = fixtures.find((item) => item.id === id)!;
      const chunks = await adapter.getContext(fixture.turns[turn].content);
      expect(chunks.some((chunk) => chunk.text.includes(text))).toBe(true);
    }
  });

  it("throws on an unknown query, naming the query", async () => {
    const query = "this query is not in any label file";

    await expect(new GoldContextAdapter().getContext(query)).rejects.toThrow(
      /no gold-context label for query "this query is not in any label file"/,
    );
  });

  it("returns chunks in a stable order across repeated calls", async () => {
    const query = "Before we call a pH drop at the mill creek a real event, I want to know how "
      + "much acid that creek can soak up before the pH actually moves. Can our pods tell me that?";
    const other = "We put a pod below an old mine adit. Water is running about pH 3.2 and the "
      + "conductivity trace looks wrong to me — higher than the grab samples the lab ran. Is the "
      + "low pH capable of throwing the conductivity off, and if so by how much?";
    const adapter = new GoldContextAdapter();

    const first = await adapter.getContext(other);
    await adapter.getContext(query);
    const second = await adapter.getContext(other);

    expect(second.map((c) => c.id)).toEqual(first.map((c) => c.id));
  });
});
