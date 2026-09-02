import { buildMessages, formatContext } from "../../src/prompt/promptBuilder";
import {
  REFUSAL_SENTENCE, REPORT_TOOL_BLOCK, TOOL_BLOCK, buildSystemPrompt,
} from "../../src/prompt/systemPrompt";
import type { Chunk } from "../../src/types/retrieval.types";
import type { ChatMessage } from "../../src/types/chat.types";

const chunks: Chunk[] = [
  { id: "c1", text: "DO below 5 mg/L stresses aquatic life.", source: "doc://epa-do" },
  { id: "c2", text: "ORP is measured in millivolts.", source: "doc://usgs-orp" },
];

describe("buildSystemPrompt", () => {
  it("states the authoritative normal ranges", () => {
    const prompt = buildSystemPrompt("freshwater");

    expect(prompt).toContain("pH: 6.5 to 8.5");
    expect(prompt).toContain("ORP: 200 to 400 mV");
    expect(prompt).toContain("Dissolved oxygen: 5 to 14 mg/L");
    expect(prompt).toContain("Temperature: 32 to 95 °F");
    expect(prompt).toContain("Turbidity: 0 to 25 NTU");
  });

  it("interpolates the conductivity range from water type", () => {
    expect(buildSystemPrompt("freshwater")).toContain("0 to 1,500");
    expect(buildSystemPrompt("saltwater")).toContain("40,000 to 50,000");
  });

  it("interpolates the turbidity range from water type", () => {
    expect(buildSystemPrompt("freshwater")).toContain("Turbidity: 0 to 25 NTU");
    expect(buildSystemPrompt("saltwater")).toContain("Turbidity: 0 to 10 NTU");
  });

  it("keeps 0 inside the turbidity range", () => {
    // 0 is a valid turbidity reading and must never be flagged as erroneous
    // (same rule as ORP — see timeline.md).
    expect(buildSystemPrompt("freshwater")).toContain("Turbidity: 0 to");
  });

  it("embeds the refusal sentence verbatim", () => {
    expect(buildSystemPrompt("freshwater")).toContain(REFUSAL_SENTENCE);
  });

  it("keeps the refusal sentence character-for-character stable", () => {
    // Pinned deliberately: the legacy service's exact string (MIGRATION_SPEC §11).
    // If this fails, refusal behavior and the eval fixtures have drifted.
    expect(REFUSAL_SENTENCE).toBe(
      "I can only answer questions grounded in this sensor's readings or the loaded water-quality documents, and I don't have enough information to answer that.",
    );
  });

  it("puts turbidity in scope and keeps pathogens and nutrients out", () => {
    // Corrected 2026-07-29: the legacy prompt declared turbidity unmeasured. It is one of the
    // six parameters the DataPod reads, so leaving it out refused every turbidity question
    // before retrieval ran — see systemPrompt.ts.
    const prompt = buildSystemPrompt("freshwater");

    expect(prompt).toContain("does NOT measure pathogens, bacteria, nutrients, or");
    expect(prompt).not.toContain("or turbidity.");
    expect(prompt).toContain("temperature, and\n  turbidity (in NTU)");
    expect(prompt).toContain("public-health authorities");
  });

  it("is identical across calls for the same water type", () => {
    // The cacheability precondition: nothing per-request may leak into this block.
    expect(buildSystemPrompt("freshwater")).toBe(buildSystemPrompt("freshwater"));
  });
});

/**
 * The tool flags are **purely additive** to the base prompt.
 *
 * This block used to pin two sha256 digests of the base prompt, under an instruction not to
 * update them, because the prompt was a pinned control for the Phase N2 bake-off. **That control
 * was released on 2026-08-26** when ◆G7 was split and its retrieval half closed
 * (`docs/timeline.md`, `HANDOFF_2026-08-27.md` §"the system prompt is unpinned"), and every
 * transcript captured against those bytes was archived out of the tree on 2026-09-01 under
 * `eval-archive-2026-09-01`. There is nothing left for a digest to protect, and `EVAL_REBUILD.md`
 * Phase 2a's whole job is to rewrite this prompt to ask for verbatim quotes — so the pin had
 * become a test that fails the next sanctioned change while telling the author not to touch it.
 *
 * What replaces it is the property that actually has to hold and is not a snapshot: **a flag may
 * only append.** Turning a tool on must leave the base prompt a byte-exact prefix, so operator
 * ranges and refusal contract cannot shift underneath it and the cacheable prefix stays stable.
 * That catches a stray edit above the tool blocks, which is what the digest was really for,
 * without going stale every time the prompt is legitimately revised.
 *
 * **Every call here passes all three arguments.** They default to `config.tools.*`, so a
 * two-argument call silently reads ambient `REPORT_TOOL` — and `.env` sets it to `true`. The
 * digests only ever passed because `test/setupEnv.ts` neutralises `.env` under jest; exporting
 * `REPORT_TOOL=true` in the shell (which `setupEnv.ts` documents as still working) would have
 * failed the pin for a reason that had nothing to do with the prompt text.
 */
describe("the tool flags are additive", () => {
  const base = buildSystemPrompt("freshwater", false, false);

  it("says nothing about tools when both flags are off", () => {
    expect(base).not.toContain("query_sensor_data");
    expect(base).not.toContain("generate_report");
    expect(base).not.toContain("TOOLS:");
  });

  it("carries the operator ranges and the refusal contract regardless of the flags", () => {
    // The content the flags must never disturb, asserted on all four combinations.
    [[false, false], [true, false], [false, true], [true, true]].forEach(([sensor, report]) => {
      const prompt = buildSystemPrompt("freshwater", sensor, report);
      expect(prompt).toContain("AUTHORITATIVE NORMAL RANGES");
      expect(prompt).toContain(REFUSAL_SENTENCE);
    });
  });

  it("appends the sensor tool block, and only that, when SENSOR_TOOL is on", () => {
    const on = buildSystemPrompt("freshwater", true, false);

    expect(on.startsWith(base)).toBe(true);
    expect(on.slice(base.length)).toBe(`\n\n${TOOL_BLOCK}`);
  });

  it("appends the report tool block, and only that, when REPORT_TOOL is on alone", () => {
    // REPORT_TOOL does not require SENSOR_TOOL — a deployment can turn it on by itself, and the
    // block is written to read correctly in that case. Untested until now.
    const on = buildSystemPrompt("freshwater", false, true);

    expect(on.startsWith(base)).toBe(true);
    expect(on.slice(base.length)).toBe(`\n\n${REPORT_TOOL_BLOCK}`);
  });

  it("appends sensor then report, in that order, when both are on", () => {
    // Both blocks open with their own "TOOLS:" header, so `indexOf("TOOLS:")` and
    // `not.toContain("TOOLS:")` cannot tell them apart. Slicing is what distinguishes them.
    const both = buildSystemPrompt("freshwater", true, true);
    const sensorOnly = buildSystemPrompt("freshwater", true, false);

    expect(both.startsWith(sensorOnly)).toBe(true);
    expect(both.slice(sensorOnly.length)).toBe(`\n\n${REPORT_TOOL_BLOCK}`);
    expect(both.indexOf(TOOL_BLOCK)).toBeLessThan(both.indexOf(REPORT_TOOL_BLOCK));
  });

  it("keeps the authoritative ranges above both tool blocks", () => {
    const both = buildSystemPrompt("freshwater", true, true);

    expect(both.indexOf("AUTHORITATIVE NORMAL RANGES")).toBeLessThan(both.indexOf(TOOL_BLOCK));
    expect(both.indexOf("AUTHORITATIVE NORMAL RANGES"))
      .toBeLessThan(both.indexOf(REPORT_TOOL_BLOCK));
  });

  it("keeps the two water types different only in their ranges block", () => {
    // What the saltwater digest was really asserting: the two prompts are the same document
    // with one substituted section, not two independently drifting texts.
    const salt = buildSystemPrompt("saltwater", false, false);

    expect(salt).not.toBe(base);
    expect(salt).toContain("AUTHORITATIVE NORMAL RANGES");
    expect(salt).toContain(REFUSAL_SENTENCE);
  });
});

describe("TOOL_BLOCK", () => {
  it("tells the model that a null value is not a zero reading", () => {
    // DEVICE_API.md §12b: an empty window comes back from the API as zeros for all six
    // metrics. The tool converts that to null; this line is what stops the model reporting
    // it as a measurement anyway.
    expect(TOOL_BLOCK).toContain('"value": null');
    expect(TOOL_BLOCK).toContain("Never\n  report a missing reading as 0");
  });

  it("states that 0 is a real reading", () => {
    expect(TOOL_BLOCK).toContain("0 is a real measurement for ORP and turbidity");
  });

  it("anchors relative ranges to the last reading, not the wall clock", () => {
    // MIGRATION_SPEC.md §8 rule 2. Load-bearing for the stale pod: without it, "the last day"
    // on a pod silent since 2026-08-07 is an empty window rather than its last day of data.
    expect(TOOL_BLOCK).toContain("not to the\n  current wall-clock time");
  });

  it("marks turbidity as a provisional index rather than a measurement", () => {
    expect(TOOL_BLOCK).toContain("PROVISIONAL, uncalibrated");
  });

  it("does not promise a document-search tool", () => {
    // ◆G11 is open. Retrieval still runs before the call and arrives as CONTEXT; naming a
    // search tool here would invite the model to announce lookups it cannot perform.
    expect(TOOL_BLOCK).not.toContain("search_documents");
  });
});

describe("formatContext", () => {
  it("labels every excerpt with its source so the model can cite it", () => {
    const block = formatContext(chunks);

    expect(block).toContain("doc://epa-do");
    expect(block).toContain("doc://usgs-orp");
    expect(block).toContain("DO below 5 mg/L stresses aquatic life.");
  });

  it("numbers excerpts in the order given", () => {
    const block = formatContext(chunks);
    expect(block.indexOf("[1]")).toBeLessThan(block.indexOf("[2]"));
  });
});

describe("buildMessages", () => {
  it("orders blocks static-first: system, context, history, question last", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "earlier question" },
      { role: "assistant", content: "earlier answer" },
    ];

    const messages = buildMessages({ query: "is my pH normal?", chunks, history });

    expect(messages).toHaveLength(5);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("AUTHORITATIVE NORMAL RANGES");
    expect(messages[1].role).toBe("system");
    expect(messages[1].content).toContain("CONTEXT");
    expect(messages[2]).toEqual(history[0]);
    expect(messages[3]).toEqual(history[1]);
    expect(messages[4]).toEqual({ role: "user", content: "is my pH normal?" });
  });

  it("puts the user question last, always", () => {
    const messages = buildMessages({ query: "what is ORP?", chunks });
    const last = messages[messages.length - 1];

    expect(last.role).toBe("user");
    expect(last.content).toBe("what is ORP?");
  });

  it("omits the context block entirely when there are no chunks", () => {
    const messages = buildMessages({ query: "what is ORP?", chunks: [] });

    // System + question only. Matched on the block header, not the bare word "CONTEXT" —
    // the system prompt's rules mention it too, so a loose match always passes.
    expect(messages).toHaveLength(2);
    expect(messages.some((m) => m.content.includes("CONTEXT — excerpts"))).toBe(false);
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("keeps the cacheable prefix identical when only the question changes", () => {
    // The property the direct-feed arm's cost case depends on: same system + same
    // context => same prefix, regardless of what is asked.
    const a = buildMessages({ query: "question one", chunks });
    const b = buildMessages({ query: "a completely different question", chunks });

    expect(a.slice(0, -1)).toEqual(b.slice(0, -1));
  });

  it("passes history through unchanged", () => {
    const history: ChatMessage[] = [{ role: "assistant", content: "verbatim" }];
    const messages = buildMessages({ query: "q", chunks: [], history });

    expect(messages[1]).toEqual({ role: "assistant", content: "verbatim" });
  });
});
