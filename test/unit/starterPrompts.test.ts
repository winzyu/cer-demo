import fs from "fs";
import path from "path";
import {
  eligibleFixtures, renderDocument, selectStarterPrompts, spreadAcrossClasses,
} from "../../scripts/starterPrompts";
import { availableCapabilities, loadFixtures } from "../../src/eval/fixtures";

const OUTPUT_FILE = path.resolve(__dirname, "../../frontend/starter-prompts.json");

describe("starter prompts — generated from the eval fixture set", () => {
  it("emits a non-empty list of first user turns", () => {
    const prompts = selectStarterPrompts({ sensor: false });

    expect(prompts.length).toBeGreaterThan(0);
    const fixtures = loadFixtures();
    prompts.forEach((prompt) => {
      const fixture = fixtures.find((f) => f.id === prompt.id);
      expect(fixture).toBeDefined();
      // The *first* turn specifically — later turns are pronoun follow-ups ("does that
      // mean...") that make no sense as an opening question.
      expect(prompt.text).toBe(fixture!.turns[0].content);
      expect(prompt.text.trim()).not.toBe("");
    });
  });

  it("is deterministic — two runs produce identical bytes", () => {
    const first = renderDocument(selectStarterPrompts({ sensor: false }), false);
    const second = renderDocument(selectStarterPrompts({ sensor: false }), false);

    // Byte equality, not deep equality: the point is that a regeneration diff is empty, so
    // any timestamp, shuffle or set-iteration order that crept in would show up here.
    expect(second).toBe(first);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("excludes the refusal class", () => {
    // A UX call, not a claim the refusals are wrong: they stay in the eval set, they are just
    // a bad suggested first question.
    const prompts = selectStarterPrompts({ sensor: false, perClass: 99 });

    expect(prompts.some((prompt) => prompt.class === "refusal")).toBe(false);
    expect(prompts.some((prompt) => prompt.id.startsWith("refusal-"))).toBe(false);
    // The fixtures are still there — the exclusion is in the generator, not the corpus.
    expect(loadFixtures().some((fixture) => fixture.class === "refusal")).toBe(true);
  });

  it("excludes requires: sensor-tool fixtures by default", () => {
    const prompts = selectStarterPrompts({ sensor: false, perClass: 99 });

    expect(prompts.some((prompt) => prompt.class === "sensor-combined")).toBe(false);
    expect(prompts.map((p) => p.id)).not.toContain("sensor-doc-do-normal");
  });

  it("includes them when --sensor is passed", () => {
    const prompts = selectStarterPrompts({ sensor: true, perClass: 99 });

    expect(prompts.map((p) => p.id)).toContain("sensor-doc-do-normal");
    expect(prompts.map((p) => p.id)).toContain("sensor-doc-event-check");
    expect(renderDocument(prompts, true)).toContain("\"sensorTool\": true");
  });

  it("spreads across classes rather than stacking one", () => {
    const prompts = selectStarterPrompts({ sensor: false });
    const classes = new Set(prompts.map((prompt) => prompt.class));

    // Ten eligible classes with the flag off (twelve, minus refusal and sensor-combined).
    expect(classes.size).toBe(prompts.length);
    expect(classes.size).toBeGreaterThanOrEqual(8);
  });

  it("cuts a limit evenly across classes instead of lopping off the tail", () => {
    const fixtures = eligibleFixtures(loadFixtures(undefined, availableCapabilities(false)));
    const capped = spreadAcrossClasses(fixtures, 2, 4);

    expect(capped).toHaveLength(4);
    // Round-robin: a limit shorter than the class count still takes one per class.
    expect(new Set(capped.map((fixture) => fixture.class)).size).toBe(4);
  });

  it("matches the committed frontend/starter-prompts.json", () => {
    // Guards the generated file against drift — if this fails, run `npm run starter:prompts`.
    const expected = renderDocument(selectStarterPrompts({ sensor: false }), false);

    expect(fs.readFileSync(OUTPUT_FILE, "utf8")).toBe(expected);
  });
});
