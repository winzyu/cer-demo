import fs from "fs";
import os from "os";
import path from "path";
import {
  AVAILABLE_CAPABILITIES,
  countTurns,
  loadFixtures,
  runnableFixtures,
} from "../../src/eval/fixtures";
import { EVAL_CLASSES } from "../../src/eval/types";
import { DIRECT_FEED_SLICE, DOC_META } from "../../src/ingestion/corpus";

/**
 * The fixtures are committed before any arm runs, so this suite is the only thing standing
 * between a typo and a wasted sweep. It validates the real committed set, then proves the
 * loader actually rejects the malformed cases it claims to.
 */

const writeFixtureDir = (files: Record<string, unknown>): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-fixtures-"));
  Object.entries(files).forEach(([name, body]) => {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(body), "utf8");
  });
  return dir;
};

const validFixture = {
  id: "sample",
  class: "definitional",
  expected_to_favor: "tie",
  answerable_from: ["water-quality-metrics-source-of-truth.pdf"],
  requires: [],
  notes: "A minimal valid fixture used to isolate one validation rule at a time.",
  turns: [
    {
      role: "user",
      content: "What is ORP?",
      rubric: { must_contain: ["expands the acronym"], must_not: ["invents a unit"] },
    },
    {
      role: "user",
      content: "Why does it matter?",
      rubric: { must_contain: ["resolves the pronoun"], must_not: [] },
    },
  ],
};

const withFixture = (patch: Record<string, unknown>, name = "sample.json"): string => writeFixtureDir(
  { [name]: { ...validFixture, ...patch } },
);

describe("committed eval fixtures", () => {
  const fixtures = loadFixtures();

  it("loads the whole set without validation errors", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(25);
    expect(fixtures.length).toBeLessThanOrEqual(30);
  });

  it("gives every fixture a unique id", () => {
    const ids = fixtures.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every declared question class", () => {
    const covered = new Set(fixtures.map((fixture) => fixture.class));
    expect([...EVAL_CLASSES].filter((cls) => !covered.has(cls))).toEqual([]);
  });

  it("makes every conversation multi-turn", () => {
    // Single-turn fixtures cannot measure follow-up or pronoun behaviour, which is the
    // stated reason the eval set is conversations rather than questions (§5).
    fixtures.forEach((fixture) => {
      expect(fixture.turns.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("only cites documents that are in the corpus", () => {
    fixtures.forEach((fixture) => {
      fixture.turns.forEach((turn) => {
        (turn.rubric.cite ?? []).forEach((filename) => {
          expect(Object.keys(DOC_META)).toContain(filename);
        });
      });
    });
  });

  it("keeps slice coverage consistent with the ◆G9 slice", () => {
    fixtures.forEach((fixture) => {
      const inSlice = fixture.answerable_from
        .filter((filename) => DIRECT_FEED_SLICE.includes(filename));
      if (fixture.sliceCoverage === "full") {
        expect(inSlice.length).toBe(fixture.answerable_from.length);
      }
      if (fixture.sliceCoverage === "none") {
        expect(inSlice).toEqual([]);
      }
    });
  });

  it("includes fixtures the direct-feed slice cannot answer", () => {
    // Without these the eval would flatter direct-feed by construction — the long manuals
    // are outside the slice and questions needing them are expected to fail there.
    const outOfSlice = fixtures.filter((fixture) => fixture.sliceCoverage !== "full");
    expect(outOfSlice.length).toBeGreaterThan(0);
  });

  it("marks fixtures that depend on capabilities the service lacks", () => {
    // Stated as an equivalence rather than a hard-coded list, so landing a capability
    // (turbidity in N4, the sensor tool in N3) flips the fixtures without editing this test.
    fixtures.forEach((fixture) => {
      const satisfied = fixture.requires.every((req) => AVAILABLE_CAPABILITIES.includes(req));
      expect(fixture.runnable).toBe(satisfied);
    });
    expect(runnableFixtures(fixtures).every((fixture) => fixture.runnable)).toBe(true);
  });

  it("still has fixtures waiting on the sensor tool", () => {
    // If this ever passes vacuously, N3 landed and `sensor-tool` should be in
    // AVAILABLE_CAPABILITIES — the two sensor fixtures are not meant to be quietly dropped.
    const blocked = fixtures.filter((fixture) => !fixture.runnable);
    blocked.forEach((fixture) => {
      expect(fixture.requires).toContain("sensor-tool");
    });
  });

  it("counts turns for sweep costing", () => {
    expect(countTurns(fixtures)).toBe(
      fixtures.reduce((total, fixture) => total + fixture.turns.length, 0),
    );
  });
});

describe("fixture validation", () => {
  it("rejects an id that does not match the filename", () => {
    expect(() => loadFixtures(withFixture({ id: "mismatched" }))).toThrow(/must match the filename/);
  });

  it("rejects an unknown question class", () => {
    expect(() => loadFixtures(withFixture({ class: "vibes" }))).toThrow(/not a known eval class/);
  });

  it("rejects a source document that is not in the corpus", () => {
    expect(() => loadFixtures(withFixture({ answerable_from: ["nope.pdf"] })))
      .toThrow(/not a corpus document/);
  });

  it("rejects a citation missing from answerable_from", () => {
    const turns = [
      {
        ...validFixture.turns[0],
        rubric: { must_contain: ["something"], must_not: [], cite: ["tm9a6.2.pdf"] },
      },
      validFixture.turns[1],
    ];
    expect(() => loadFixtures(withFixture({ turns })))
      .toThrow(/missing from answerable_from/);
  });

  it("rejects an empty must_contain", () => {
    const turns = [
      { ...validFixture.turns[0], rubric: { must_contain: [], must_not: [] } },
      validFixture.turns[1],
    ];
    // An empty rubric grades every answer, including an empty one, as a pass.
    expect(() => loadFixtures(withFixture({ turns }))).toThrow(/must_contain/);
  });

  it("rejects a single-turn conversation", () => {
    expect(() => loadFixtures(withFixture({ turns: [validFixture.turns[0]] })))
      .toThrow(/at least 2 user turns/);
  });

  it("rejects an assistant turn", () => {
    const turns = [{ ...validFixture.turns[0], role: "assistant" }, validFixture.turns[1]];
    expect(() => loadFixtures(withFixture({ turns }))).toThrow(/role must be "user"/);
  });

  it("rejects a rag prediction that the slice fully answers", () => {
    expect(() => loadFixtures(withFixture({ expected_to_favor: "rag" })))
      .toThrow(/every source is inside/);
  });

  it("rejects a direct-feed prediction with no in-slice source", () => {
    expect(() => loadFixtures(withFixture({
      expected_to_favor: "direct-feed",
      answerable_from: ["tm9a6.2.pdf"],
      turns: validFixture.turns.map((turn) => ({ ...turn, rubric: { ...turn.rubric } })),
    }))).toThrow(/no source is inside/);
  });

  it("reports every problem at once rather than the first", () => {
    let message = "";
    try {
      loadFixtures(withFixture({ id: "mismatched", class: "vibes" }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/must match the filename/);
    expect(message).toMatch(/not a known eval class/);
  });

  it("throws when the directory holds no fixtures", () => {
    expect(() => loadFixtures(writeFixtureDir({}))).toThrow(/No eval fixtures found/);
  });
});
