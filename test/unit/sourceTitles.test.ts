import fs from "fs";
import os from "os";
import path from "path";
import { loadSourceTitles, withSourceTitles } from "../../src/retrieval/sourceTitles";

describe("citation titles", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "source-titles-"));
    fs.writeFileSync(path.join(dir, "corpus.json"), JSON.stringify({
      generatedAt: "2026-09-27T00:00:00Z",
      documents: [
        { filename: "ph.pdf", title: "Atlas pH Probe — Datasheet", chunks: [] },
        {
          filename: "tm9.pdf", title: "USGS TM 9-A6.2", sourceUrl: "https://pubs.usgs.gov/tm9.pdf", chunks: [],
        },
      ],
    }));
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("titles each chunk by the same source key the arms cite, and leaves unknown sources alone", () => {
    const titles = loadSourceTitles(path.join(dir, "corpus.json"));
    const chunks = [
      { id: "a", text: "x", source: "ph.pdf" },
      { id: "b", text: "y", source: "https://pubs.usgs.gov/tm9.pdf" },
      { id: "c", text: "z", source: "stub://sensor-reference" },
    ];

    expect(withSourceTitles(chunks, titles)).toEqual([
      { ...chunks[0], title: "Atlas pH Probe — Datasheet" },
      { ...chunks[1], title: "USGS TM 9-A6.2" },
      chunks[2],
    ]);
  });

  it("answers with no titles when the corpus artifact is missing", () => {
    expect(loadSourceTitles(path.join(dir, "absent.json")).size).toBe(0);
  });
});
