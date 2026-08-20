import crypto from "crypto";
import { buildMessages, formatContext } from "../../src/prompt/promptBuilder";
import { REFUSAL_SENTENCE, TOOL_BLOCK, buildSystemPrompt } from "../../src/prompt/systemPrompt";
import type { Chunk } from "../../src/types/retrieval.types";
import type { ChatMessage } from "../../src/types/chat.types";

const sha256 = (value: string): string => crypto.createHash("sha256").update(value, "utf8").digest("hex");

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

describe("the pinned bake-off prompt (SENSOR_TOOL off)", () => {
  /**
   * The system prompt is a **pinned control** for the Phase N2 bake-off (`RETRIEVAL_BAKEOFF.md`
   * §4), and ◆G7 is still open on ungraded quality. Three arms were swept against the exact
   * bytes below; changing them voids all three and forces a paid re-run.
   *
   * Hashed rather than eyeballed because the failure this guards is invisible in review — a
   * trailing space or a swapped newline reads as identical on screen and produces a different
   * cache prefix and a different prompt. These digests were taken from the prompt as it stood
   * at the merge commit `fa299ef`, immediately before the N3 tool block was added, and verified
   * equal to the pre-change function's output for both water types.
   *
   * **If this fails, do not update the hash to make it pass.** Either the change is unintended
   * and belongs reverted, or ◆G7 has closed and the arms are being deliberately re-run — in
   * which case update the digest *and* say so in `RETRIEVAL_BAKEOFF.md`.
   */
  it("is byte-identical to the prompt the captured arms ran against", () => {
    expect(sha256(buildSystemPrompt("freshwater", false)))
      .toBe("5c00189b647d59b552027d2bc16835de02ba63a9e6ddcbfea6c3ef12b87eb39a");
    expect(sha256(buildSystemPrompt("saltwater", false)))
      .toBe("01eb2effc857d3a26ec2b972c86d501be657dd83201a5cb0ede52acb103d3503");
  });

  it("says nothing about tools when the flag is off", () => {
    const prompt = buildSystemPrompt("freshwater", false);

    expect(prompt).not.toContain("query_sensor_data");
    expect(prompt).not.toContain("TOOLS:");
  });

  it("appends the tool block, and only the tool block, when the flag is on", () => {
    // The flag must be purely additive: an arm's prompt is a prefix of the tool-enabled one,
    // so nothing above the appended block can have shifted.
    const off = buildSystemPrompt("freshwater", false);
    const on = buildSystemPrompt("freshwater", true);

    expect(on.startsWith(off)).toBe(true);
    expect(on.slice(off.length)).toBe(`\n\n${TOOL_BLOCK}`);
  });

  it("keeps the authoritative ranges above the tool block", () => {
    // Ordering is the reason the flag-off prompt stays a prefix: ranges are static content and
    // must not move below anything added later.
    const on = buildSystemPrompt("freshwater", true);

    expect(on.indexOf("AUTHORITATIVE NORMAL RANGES")).toBeLessThan(on.indexOf("TOOLS:"));
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
