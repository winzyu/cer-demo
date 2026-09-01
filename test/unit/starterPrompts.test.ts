import fs from "fs";
import path from "path";
import {
  CLASS_FAMILIES, DEFAULT_LIMIT, eligibleFixtures, renderDocument, selectStarterPrompts,
  spreadAcrossClasses, starterClassOrder,
} from "../../scripts/starterPrompts";
import { availableCapabilities, loadFixtures } from "../../src/eval/fixtures";
import { EVAL_CLASSES } from "../../src/eval/types";
import type { EvalClass } from "../../src/eval/types";

const OUTPUT_FILE = path.resolve(__dirname, "../../frontend/starter-prompts.json");

/** `limit: 0` is the explicit "no cap" — the default is a real cap now, not zero. */
const UNCAPPED = { sensor: false, perClass: 99, limit: 0 };

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
    const prompts = selectStarterPrompts(UNCAPPED);

    expect(prompts.some((prompt) => prompt.class === "refusal")).toBe(false);
    expect(prompts.some((prompt) => prompt.id.startsWith("refusal-"))).toBe(false);
    // The fixtures are still there — the exclusion is in the generator, not the corpus.
    expect(loadFixtures().some((fixture) => fixture.class === "refusal")).toBe(true);
  });

  it("excludes requires: sensor-tool fixtures by default", () => {
    const prompts = selectStarterPrompts(UNCAPPED);

    expect(prompts.some((prompt) => prompt.class === "sensor-combined")).toBe(false);
    expect(prompts.every((prompt) => {
      const fixture = loadFixtures().find((f) => f.id === prompt.id);
      return !fixture!.requires.includes("sensor-tool");
    })).toBe(true);
  });

  it("records the --sensor flag and never narrows the set", () => {
    // The archived set carried `sensor-doc-do-normal` and `sensor-doc-event-check`, so this used
    // to assert those two ids appear. Wave 1 drops the `sensor-combined` class entirely
    // (`EVAL_REBUILD.md` §2) and declares no `requires` at all, so there is nothing for the flag
    // to unlock. What is still testable is the plumbing: the flag reaches the document, and
    // turning it on can only ever add.
    const off = selectStarterPrompts(UNCAPPED);
    const on = selectStarterPrompts({ ...UNCAPPED, sensor: true });

    expect(on.length).toBeGreaterThanOrEqual(off.length);
    expect(on.map((p) => p.id)).toEqual(expect.arrayContaining(off.map((p) => p.id)));
    expect(renderDocument(on, true)).toContain("\"sensorTool\": true");
    expect(renderDocument(off, false)).toContain("\"sensorTool\": false");
  });

  it("defaults to three prompts", () => {
    // Fifteen chips in front of an empty conversation was the complaint; the chips show what
    // the assistant can do and then get out of the way (CHAT_UX_WORKPLAN, "Wave 2 — where
    // things belong").
    expect(DEFAULT_LIMIT).toBe(3);
    expect(selectStarterPrompts({ sensor: false })).toHaveLength(3);
  });

  it("still honours an explicit --limit, including 0 for no cap", () => {
    expect(selectStarterPrompts({ sensor: false, limit: 6 })).toHaveLength(6);

    const uncapped = selectStarterPrompts({ sensor: false, limit: 0 });
    expect(uncapped.length).toBeGreaterThan(DEFAULT_LIMIT);
    // One per eligible class with the default perClass of 1.
    expect(new Set(uncapped.map((p) => p.class)).size).toBe(uncapped.length);
  });

  it("--per-class adds rounds once the cap is lifted", () => {
    const single = selectStarterPrompts({ sensor: false, limit: 0 });
    const double = selectStarterPrompts({ sensor: false, perClass: 2, limit: 0 });

    expect(double.length).toBeGreaterThan(single.length);
    expect(double.slice(0, single.length)).toEqual(single);
  });

  it("spans different question families rather than three flavours of one", () => {
    // EVAL_CLASSES order opens definitional / acronym / threshold — three ways of asking the
    // reference to look something up. Taking its first three would read as a glossary, so the
    // rotation goes family-first.
    const prompts = selectStarterPrompts({ sensor: false });
    const familyOf = (evalClass: EvalClass): number => CLASS_FAMILIES
      .findIndex((family) => family.includes(evalClass));

    const families = prompts.map((prompt) => familyOf(prompt.class));
    expect(families).not.toContain(-1);
    expect(new Set(families).size).toBe(prompts.length);
    expect(new Set(prompts.map((prompt) => prompt.class)).size).toBe(prompts.length);
  });

  it("prefers the shortest question available in each class", () => {
    // A chip has to fit one or two lines beside two others.
    const fixtures = eligibleFixtures(loadFixtures(undefined, availableCapabilities(false)));

    selectStarterPrompts({ sensor: false }).forEach((prompt) => {
      const sameClass = fixtures.filter((fixture) => fixture.class === prompt.class);
      const shortest = Math.min(...sameClass.map((fixture) => fixture.turns[0].content.length));
      expect(prompt.text.length).toBe(shortest);
    });
  });

  it("orders every class exactly once, including any without a family", () => {
    const order = starterClassOrder();

    expect(new Set(order).size).toBe(order.length);
    expect([...order].sort()).toEqual([...EVAL_CLASSES].sort());
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

  it("the committed file is what frontend/js/input.js reads: .prompts[].text, three of them", () => {
    const parsed = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));

    expect(parsed.prompts).toHaveLength(DEFAULT_LIMIT);
    parsed.prompts.forEach((prompt: { id: string; class: string; text: string }) => {
      expect(typeof prompt.id).toBe("string");
      expect(typeof prompt.class).toBe("string");
      expect(typeof prompt.text).toBe("string");
    });
  });
});
