import { stripCommentaryMarkers } from "../../src/utils/answerFormat";
import { ChatOrchestrator, ROUND_CAP_PLACEHOLDER } from "../../src/services/ChatOrchestrator";
import type { LlmAnswer, LlmService } from "../../src/services/LlmService";
import type { ChatMessage } from "../../src/types/chat.types";
import type { ToolDefinition, ToolHandler } from "../../src/types/tool.types";

/**
 * `【commentary…】` stripping (`CHAT_UX_WORKPLAN.md` WS-5). Offline: a pure function, plus a
 * scripted LLM for the orchestrator wiring. Nothing here needs a key or a network.
 *
 * The brackets throughout are the full-width U+3010 / U+3011 pair, not ASCII `[` / `]`.
 */

describe("stripCommentaryMarkers", () => {
  it("returns text with no marker byte-for-byte", () => {
    // Passthrough must be exact, whitespace included — this function runs on every answer,
    // and an answer with nothing to fix must not be reformatted on the way past.
    const text = "  Dissolved oxygen was 8.4 mg/L.\n\nTrailing space kept.  ";

    expect(stripCommentaryMarkers(text)).toBe(text);
  });

  it("returns an empty string unchanged", () => {
    expect(stripCommentaryMarkers("")).toBe("");
  });

  it("removes a marker mid-sentence without collapsing the sentence around it", () => {
    expect(stripCommentaryMarkers("The pod read 7.2 【commentary user asked for pH】 mg/L at noon."))
      .toBe("The pod read 7.2 mg/L at noon.");
  });

  it("keeps the original spacing when the marker had none around it", () => {
    // No space either side means the sentence never had one; inserting one would be as wrong
    // as leaving a double.
    expect(stripCommentaryMarkers("7.2【commentary aside】mg/L")).toBe("7.2mg/L");
  });

  it("removes several markers from one answer", () => {
    expect(stripCommentaryMarkers("A 【commentary one】 B 【commentary two】 C"))
      .toBe("A B C");
  });

  it("returns an empty string when the answer is nothing but a marker", () => {
    // The load-bearing case. The marker's contents must never be promoted into the answer —
    // the caller can report an empty answer honestly, but not a fabricated one.
    expect(stripCommentaryMarkers("【commentary the user wants pH, let me check】")).toBe("");
  });

  it("returns an empty string when the answer is only markers and whitespace", () => {
    expect(stripCommentaryMarkers("\n【commentary first】\n\n【commentary second】\n")).toBe("");
  });

  it("removes a nested marker with its outer marker, leaving no stray bracket", () => {
    expect(stripCommentaryMarkers("【commentary outer 【commentary inner】 tail】Answer."))
      .toBe("Answer.");
  });

  it("drops the rest of the answer when a marker is never closed", () => {
    // The usual cause is max_tokens cutting the answer off mid-marker. Everything after the
    // opener is commentary either way, and half a marker on screen is the bug being fixed.
    expect(stripCommentaryMarkers("Dissolved oxygen was 8.4 mg/L. 【commentary now I should"))
      .toBe("Dissolved oxygen was 8.4 mg/L.");
  });

  it("leaves a closing bracket that never had an opener alone", () => {
    // Malformed, but there is no marker here to remove — only prose that happens to contain a
    // full-width bracket, and guessing at it would edit the answer.
    const text = "The range is 4】8 mg/L.";

    expect(stripCommentaryMarkers(text)).toBe(text);
  });

  it("leaves citation markers in the same brackets untouched", () => {
    // The trap. Captured transcripts are full of these, and `invalid_citations` is a graded
    // column in GRADING_GUIDE.md — stripping every bracketed span would delete the evidence
    // the grading packet scores.
    const text = "Turbidity is reported in NTU 【1†L1-L6】, per the manual 【Authoritative Normal Ranges】.";

    expect(stripCommentaryMarkers(text)).toBe(text);
  });

  it("removes a commentary marker while keeping a citation beside it", () => {
    expect(stripCommentaryMarkers("Calibrate quarterly 【3†L2-L4】. 【commentary done】"))
      .toBe("Calibrate quarterly 【3†L2-L4】.");
  });

  it("matches the channel name regardless of case or leading space", () => {
    expect(stripCommentaryMarkers("Answer. 【 Commentary tail】")).toBe("Answer.");
  });
});

/**
 * Wiring. `ChatOrchestrator.run` is the single call site, and both the JSON path and the
 * SSE path in `ChatController` read their answer from it.
 */

const answer = (overrides: Partial<LlmAnswer> = {}): LlmAnswer => ({
  content: "",
  model: "test-model",
  toolCalls: [],
  usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
  ...overrides,
});

/** An LLM that replays a scripted list of answers and records what it was sent. */
const scriptedLlm = (script: LlmAnswer[]): {
  llm: LlmService;
  seen: ChatMessage[][];
} => {
  const seen: ChatMessage[][] = [];
  let index = 0;

  const llm = {
    complete: async (messages: ChatMessage[]): Promise<LlmAnswer> => {
      seen.push(JSON.parse(JSON.stringify(messages)));
      const next = script[Math.min(index, script.length - 1)];
      index += 1;
      return next;
    },
  } as unknown as LlmService;

  return { llm, seen };
};

const definition: ToolDefinition = {
  type: "function",
  function: {
    name: "query_sensor_data",
    description: "the query_sensor_data tool",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const sensorTool: ToolHandler = { definition, run: async () => ({}) };

const alwaysCalls = answer({
  content: "【commentary calling the tool again】",
  toolCalls: [{
    id: "call_1",
    type: "function",
    function: { name: "query_sensor_data", arguments: "{}" },
  }],
});

const messages: ChatMessage[] = [
  { role: "system", content: "system prompt" },
  { role: "user", content: "what is the pH?" },
];

describe("ChatOrchestrator answer formatting", () => {
  it("strips markers from the answer it returns", async () => {
    const { llm } = scriptedLlm([
      answer({ content: "【commentary the user asked for pH】pH was 7.1 on Tuesday." }),
    ]);

    const result = await new ChatOrchestrator(llm, []).run(messages);

    expect(result.content).toBe("pH was 7.1 on Tuesday.");
  });

  it("returns an empty answer rather than inventing one from the marker", async () => {
    // Empty is what the caller reports; the marker's contents are not an answer.
    const { llm } = scriptedLlm([answer({ content: "【commentary I should look this up】" })]);

    const result = await new ChatOrchestrator(llm, []).run(messages);

    expect(result.content).toBe("");
  });

  it("does not send the stripped text back to the provider", async () => {
    // The assistant turn is replayed verbatim, tool_calls included. Rewriting it would perturb
    // the cacheable prefix the bake-off measures, so only the outgoing answer is cleaned.
    const { llm, seen } = scriptedLlm([
      alwaysCalls,
      answer({ content: "pH was 7.1." }),
    ]);

    await new ChatOrchestrator(llm, [sensorTool], 2).run(messages);

    const replayed = seen[1].find((message) => message.role === "assistant");
    expect(replayed?.content).toBe("【commentary calling the tool again】");
  });

  it("strips markers from the last prose kept for the round-cap fallback", async () => {
    const { llm } = scriptedLlm([
      answer({
        content: "Checking the sensors… 【commentary one more lookup】",
        toolCalls: [{
          id: "call_1",
          type: "function",
          function: { name: "query_sensor_data", arguments: "{}" },
        }],
      }),
      alwaysCalls,
    ]);

    const result = await new ChatOrchestrator(llm, [sensorTool], 2).run(messages);

    expect(result.capped).toBe(true);
    expect(result.content).toBe("Checking the sensors…");
  });

  it("falls back to the placeholder when every round was nothing but markers", async () => {
    // A marker-only round is not prose. Returning the stripped empty string here would drop
    // the one honest thing left to say — that the loop ran out of steps.
    const { llm } = scriptedLlm([alwaysCalls]);

    const result = await new ChatOrchestrator(llm, [sensorTool], 2).run(messages);

    expect(result.capped).toBe(true);
    expect(result.content).toBe(ROUND_CAP_PLACEHOLDER);
  });
});
