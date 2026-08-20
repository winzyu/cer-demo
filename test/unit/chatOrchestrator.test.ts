import { ChatOrchestrator, ROUND_CAP_PLACEHOLDER } from "../../src/services/ChatOrchestrator";
import type { LlmAnswer, LlmService } from "../../src/services/LlmService";
import type { ChatMessage } from "../../src/types/chat.types";
import type { ToolDefinition, ToolHandler } from "../../src/types/tool.types";

/**
 * The tool-round loop (`MIGRATION_SPEC.md` §3). Entirely offline: the LLM is a scripted queue
 * of responses and the tools are local functions, so nothing here needs a key or a network.
 */

const definition = (
  name: string,
  properties: Record<string, unknown> = {},
): ToolDefinition => ({
  type: "function",
  function: {
    name,
    description: `the ${name} tool`,
    parameters: { type: "object", properties, required: [] },
  },
});

const answer = (overrides: Partial<LlmAnswer> = {}): LlmAnswer => ({
  content: "",
  model: "test-model",
  toolCalls: [],
  usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
  ...overrides,
});

const toolCall = (id: string, name: string, args: unknown) => ({
  id,
  type: "function" as const,
  function: { name, arguments: JSON.stringify(args) },
});

/** An LLM that replays a scripted list of answers and records what it was sent. */
const scriptedLlm = (script: LlmAnswer[]): {
  llm: LlmService;
  seen: Array<{ messages: ChatMessage[]; tools?: ToolDefinition[] }>;
} => {
  const seen: Array<{ messages: ChatMessage[]; tools?: ToolDefinition[] }> = [];
  let index = 0;

  const llm = {
    complete: async (messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LlmAnswer> => {
      // Deep-copied: the loop appends to its own conversation, and a stored reference would
      // show the final state on every recorded round.
      seen.push({ messages: JSON.parse(JSON.stringify(messages)), tools });
      const next = script[Math.min(index, script.length - 1)];
      index += 1;
      return next;
    },
  } as unknown as LlmService;

  return { llm, seen };
};

/** Declares an optional `device`, the way the real `query_sensor_data` schema does. */
const sensorTool = (run: ToolHandler["run"]): ToolHandler => ({
  definition: definition("query_sensor_data", { device: { type: "string" } }),
  run,
});

const messages: ChatMessage[] = [
  { role: "system", content: "system prompt" },
  { role: "user", content: "what is the pH?" },
];

describe("ChatOrchestrator with no tools", () => {
  it("makes exactly one call and offers nothing", async () => {
    // The SENSOR_TOOL-off path. It must stay identical to the pre-N3 single call the bake-off
    // arms were captured against — one round, no tools key.
    const { llm, seen } = scriptedLlm([answer({ content: "pH is 7.1." })]);
    const result = await new ChatOrchestrator(llm, []).run(messages);

    expect(result.content).toBe("pH is 7.1.");
    expect(result.rounds).toBe(1);
    expect(result.invocations).toEqual([]);
    expect(seen).toHaveLength(1);
    expect(seen[0].tools).toBeUndefined();
  });

  it("reports that it has no tools", () => {
    expect(new ChatOrchestrator(scriptedLlm([]).llm, []).hasTools).toBe(false);
  });
});

describe("ChatOrchestrator tool rounds", () => {
  it("runs a tool, feeds the result back, and returns the follow-up answer", async () => {
    const run = jest.fn().mockResolvedValue({ value: 7.1, unit: "unitless" });
    const { llm, seen } = scriptedLlm([
      answer({ toolCalls: [toolCall("call_1", "query_sensor_data", { metric: "ph" })] }),
      answer({ content: "pH is 7.1." }),
    ]);

    const result = await new ChatOrchestrator(llm, [sensorTool(run)]).run(messages);

    expect(result.content).toBe("pH is 7.1.");
    expect(result.rounds).toBe(2);
    expect(run.mock.calls[0][0]).toEqual({ metric: "ph" });

    // The second round must carry the assistant turn with its tool_calls, then the tool result
    // keyed by tool_call_id — providers reject a tool message whose id has no matching call.
    const second = seen[1].messages;
    expect(second[second.length - 2]).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "call_1" }],
    });
    expect(second[second.length - 1]).toMatchObject({
      role: "tool",
      tool_call_id: "call_1",
      content: JSON.stringify({ value: 7.1, unit: "unitless" }),
    });
  });

  it("handles several tool calls in one round", async () => {
    const run = jest.fn().mockImplementation(async (args: Record<string, unknown>) => ({
      metric: args.metric,
    }));
    const { llm } = scriptedLlm([
      answer({
        toolCalls: [
          toolCall("a", "query_sensor_data", { metric: "ph" }),
          toolCall("b", "query_sensor_data", { metric: "orp" }),
        ],
      }),
      answer({ content: "done" }),
    ]);

    const result = await new ChatOrchestrator(llm, [sensorTool(run)]).run(messages);

    expect(run).toHaveBeenCalledTimes(2);
    expect(result.invocations.map((entry) => entry.arguments)).toEqual([
      { metric: "ph" }, { metric: "orp" },
    ]);
  });

  it("does not mutate the caller's message list", async () => {
    const { llm } = scriptedLlm([
      answer({ toolCalls: [toolCall("call_1", "query_sensor_data", {})] }),
      answer({ content: "done" }),
    ]);
    const original = [...messages];

    await new ChatOrchestrator(llm, [sensorTool(async () => ({}))]).run(messages);

    expect(messages).toEqual(original);
  });

  it("sums usage across every round rather than reporting only the last", async () => {
    const { llm } = scriptedLlm([
      answer({ toolCalls: [toolCall("call_1", "query_sensor_data", {})] }),
      answer({ content: "done" }),
    ]);

    const result = await new ChatOrchestrator(llm, [sensorTool(async () => ({}))]).run(messages);

    expect(result.usage.promptTokens).toBe(200);
    expect(result.usage.totalTokens).toBe(220);
  });

  it("keeps an unreported cached-token count undefined rather than summing it to zero", async () => {
    // `undefined` means the provider did not report it, which is not the same as a 0% cache
    // rate — and that number is what decides ◆G7 (see LlmUsage.cachedPromptTokens).
    const { llm } = scriptedLlm([answer({ content: "done", usage: { promptTokens: 5 } })]);
    const result = await new ChatOrchestrator(llm, []).run(messages);

    expect(result.usage.cachedPromptTokens).toBeUndefined();
    expect(result.usage.promptTokens).toBe(5);
  });
});

describe("ChatOrchestrator error recovery", () => {
  it("feeds an unknown tool name back instead of raising", async () => {
    const { llm } = scriptedLlm([
      answer({ toolCalls: [toolCall("call_1", "search_documents", {})] }),
      answer({ content: "recovered" }),
    ]);

    const result = await new ChatOrchestrator(llm, [sensorTool(async () => ({}))]).run(messages);

    expect(result.content).toBe("recovered");
    expect(result.invocations[0].result).toEqual({ error: "unknown tool 'search_documents'" });
  });

  it("feeds malformed tool arguments back instead of raising", async () => {
    // `arguments` is a model-generated JSON string, so this is routine rather than exceptional.
    const run = jest.fn();
    const { llm } = scriptedLlm([
      answer({
        toolCalls: [{
          id: "call_1",
          type: "function",
          function: { name: "query_sensor_data", arguments: "{metric: ph" },
        }],
      }),
      answer({ content: "recovered" }),
    ]);

    const result = await new ChatOrchestrator(llm, [sensorTool(run)]).run(messages);

    expect(run).not.toHaveBeenCalled();
    expect(result.content).toBe("recovered");
    expect(String((result.invocations[0].result as { error: string }).error))
      .toContain("not valid JSON");
  });

  it("rejects arguments that parse to something other than an object", async () => {
    const { llm } = scriptedLlm([
      answer({
        toolCalls: [{
          id: "call_1",
          type: "function",
          function: { name: "query_sensor_data", arguments: "[1,2,3]" },
        }],
      }),
      answer({ content: "recovered" }),
    ]);

    const result = await new ChatOrchestrator(llm, [sensorTool(async () => ({}))]).run(messages);

    expect((result.invocations[0].result as { error: string }).error)
      .toContain("must be a JSON object");
  });
});

describe("ChatOrchestrator round cap", () => {
  /** A model that never stops asking for tools. */
  const alwaysCalls = answer({
    toolCalls: [toolCall("call_n", "query_sensor_data", { metric: "ph" })],
  });

  it("offers tools on every round but the last", async () => {
    const { llm, seen } = scriptedLlm([alwaysCalls]);

    await new ChatOrchestrator(llm, [sensorTool(async () => ({}))], 3).run(messages);

    // 3 tool-enabled rounds + 1 forced text-only round.
    expect(seen).toHaveLength(4);
    expect(seen.slice(0, 3).every((call) => call.tools !== undefined)).toBe(true);
    expect(seen[3].tools).toBeUndefined();
  });

  it("returns the last prose the model produced when the cap is hit", async () => {
    const { llm } = scriptedLlm([
      answer({
        content: "Checking the sensors…",
        toolCalls: [toolCall("call_1", "query_sensor_data", { metric: "ph" })],
      }),
      alwaysCalls,
    ]);

    const result = await new ChatOrchestrator(llm, [sensorTool(async () => ({}))], 2).run(messages);

    expect(result.capped).toBe(true);
    expect(result.content).toBe("Checking the sensors…");
  });

  it("falls back to a placeholder when the model produced no prose at all", async () => {
    const { llm } = scriptedLlm([alwaysCalls]);

    const result = await new ChatOrchestrator(llm, [sensorTool(async () => ({}))], 2).run(messages);

    expect(result.capped).toBe(true);
    expect(result.content).toBe(ROUND_CAP_PLACEHOLDER);
    expect(result.content).not.toBe("");
  });

  it("defaults to a cap in the raised range rather than the legacy 5", async () => {
    // N5's "raise the tool-round cap" landing early: the six-parameter eval fixture needs one
    // call per metric plus follow-ups, which five rounds cannot fit.
    const { llm, seen } = scriptedLlm([alwaysCalls]);

    await new ChatOrchestrator(llm, [sensorTool(async () => ({}))]).run(messages);

    expect(seen.length).toBeGreaterThanOrEqual(16);
    expect(seen.length).toBeLessThanOrEqual(21);
  });

  it("serves a repeated identical call from cache instead of re-running it", async () => {
    // The stuck-model pattern, and the reason a 16-round cap is affordable: without this a
    // model re-asking one question burns every remaining round on the same lookup.
    const run = jest.fn().mockResolvedValue({ value: 7.1 });
    const { llm } = scriptedLlm([alwaysCalls]);

    const result = await new ChatOrchestrator(llm, [sensorTool(run)], 5).run(messages);

    expect(run).toHaveBeenCalledTimes(1);
    // Five tool-enabled rounds dispatch; the sixth is the forced text-only round, whose calls
    // are ignored because their results could never be sent anywhere.
    expect(result.invocations).toHaveLength(5);
    expect(result.invocations.slice(1).every((entry) => entry.deduped)).toBe(true);
    expect(result.invocations[0].deduped).toBeUndefined();
  });

  it("ignores tool calls made on the forced text-only round", async () => {
    // Nothing downstream can consume them: that round's output is the last the loop produces,
    // so dispatching would hit someone else's production API for a result thrown away.
    const run = jest.fn().mockResolvedValue({ value: 7.1 });
    const { llm } = scriptedLlm([alwaysCalls]);

    const result = await new ChatOrchestrator(llm, [sensorTool(run)], 1).run(messages);

    expect(result.rounds).toBe(2);
    expect(result.invocations).toHaveLength(1);
  });

  it("treats calls with the same arguments in a different key order as identical", async () => {
    const run = jest.fn().mockResolvedValue({ value: 7.1 });
    const { llm } = scriptedLlm([
      answer({ toolCalls: [toolCall("a", "query_sensor_data", { metric: "ph", aggregation: "mean" })] }),
      answer({ toolCalls: [toolCall("b", "query_sensor_data", { aggregation: "mean", metric: "ph" })] }),
      answer({ content: "done" }),
    ]);

    await new ChatOrchestrator(llm, [sensorTool(run)], 5).run(messages);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("still runs genuinely different calls", async () => {
    const run = jest.fn().mockResolvedValue({ value: 1 });
    const { llm } = scriptedLlm([
      answer({ toolCalls: [toolCall("a", "query_sensor_data", { metric: "ph" })] }),
      answer({ toolCalls: [toolCall("b", "query_sensor_data", { metric: "orp" })] }),
      answer({ content: "done" }),
    ]);

    await new ChatOrchestrator(llm, [sensorTool(run)], 5).run(messages);

    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("ChatOrchestrator request device", () => {
  /**
   * The pod chosen in the UI arrives per request and must behave as a *default* for the sensor
   * tool: it fills the gap where the tool would otherwise report that it needs to be told which
   * pod, and it loses to a device the model named itself.
   */

  const oneCall = (args: unknown) => [
    answer({ toolCalls: [toolCall("call_1", "query_sensor_data", args)] }),
    answer({ content: "done" }),
  ];

  /**
   * Order-independent, unlike the scripted queue: it asks for one tool call and then answers,
   * decided from the conversation it is handed rather than from a shared counter. Runs that
   * interleave — or simply reuse one orchestrator — stay legible.
   */
  const toolThenAnswer = (): LlmService => ({
    complete: async (sent: ChatMessage[]): Promise<LlmAnswer> => (
      sent.some((message) => message.role === "tool")
        ? answer({ content: "done" })
        : answer({ toolCalls: [toolCall("call_1", "query_sensor_data", { metric: "ph" })] })
    ),
  } as unknown as LlmService);

  it("passes the request's device to the tool when the model named none", async () => {
    const run = jest.fn().mockResolvedValue({ value: 7.1 });
    const { llm } = scriptedLlm(oneCall({ metric: "ph", time_range: "now" }));

    const result = await new ChatOrchestrator(llm, [sensorTool(run)])
      .run(messages, { device: "Algalita Pod" });

    expect(run.mock.calls[0][0]).toEqual({
      metric: "ph", time_range: "now", device: "Algalita Pod",
    });
    // Traced as it actually ran, so the response says which pod was read.
    expect(result.invocations[0].arguments.device).toBe("Algalita Pod");
  });

  it("lets the model's explicit device win over the request's", async () => {
    // The request device is a default, not an override: a question naming another pod is the
    // more specific instruction and must not be silently redirected to the selected one.
    const run = jest.fn().mockResolvedValue({ value: 7.1 });
    const { llm } = scriptedLlm(oneCall({ metric: "ph", device: "Old Woman Creek 2026" }));

    const result = await new ChatOrchestrator(llm, [sensorTool(run)])
      .run(messages, { device: "Algalita Pod" });

    expect(run.mock.calls[0][0]).toEqual({ metric: "ph", device: "Old Woman Creek 2026" });
    expect(result.invocations[0].arguments.device).toBe("Old Woman Creek 2026");
  });

  it("treats a blank device from the model as no device at all", async () => {
    const run = jest.fn().mockResolvedValue({ value: 7.1 });
    const { llm } = scriptedLlm(oneCall({ metric: "ph", device: "  " }));

    await new ChatOrchestrator(llm, [sensorTool(run)]).run(messages, { device: "Algalita Pod" });

    expect(run.mock.calls[0][0]).toEqual({ metric: "ph", device: "Algalita Pod" });
  });

  it("adds nothing when the request carried no device", async () => {
    const run = jest.fn().mockResolvedValue({ value: 7.1 });
    const { llm } = scriptedLlm(oneCall({ metric: "ph" }));

    await new ChatOrchestrator(llm, [sensorTool(run)]).run(messages);

    expect(run.mock.calls[0][0]).toEqual({ metric: "ph" });
  });

  it("does not inject a device into a tool whose schema has none", async () => {
    const run = jest.fn().mockResolvedValue({ ok: true });
    const { llm } = scriptedLlm([
      answer({ toolCalls: [toolCall("call_1", "other_tool", { foo: 1 })] }),
      answer({ content: "done" }),
    ]);
    const handler: ToolHandler = { definition: definition("other_tool"), run };

    await new ChatOrchestrator(llm, [handler]).run(messages, { device: "Algalita Pod" });

    expect(run.mock.calls[0][0]).toEqual({ foo: 1 });
  });

  it("keeps two concurrent runs on their own devices", async () => {
    // The orchestrator is built once at boot and shared by every request, so the device has to
    // live on the call, not on the instance. Two overlapping runs prove it does.
    const seenDevices: unknown[] = [];
    const run = async (args: Record<string, unknown>): Promise<unknown> => {
      // Yield the event loop mid-dispatch so the two runs genuinely interleave.
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      seenDevices.push(args.device);
      return { value: 1 };
    };

    const orchestrator = new ChatOrchestrator(toolThenAnswer(), [sensorTool(run)]);
    const [algalita, owc] = await Promise.all([
      orchestrator.run(messages, { device: "Algalita Pod" }),
      orchestrator.run(messages, { device: "Old Woman Creek 2026" }),
    ]);

    expect(algalita.invocations[0].arguments.device).toBe("Algalita Pod");
    expect(owc.invocations[0].arguments.device).toBe("Old Woman Creek 2026");
    expect([...seenDevices].sort()).toEqual(["Algalita Pod", "Old Woman Creek 2026"]);
  });

  it("does not carry a device over to the next run on the same orchestrator", async () => {
    const run = jest.fn().mockResolvedValue({ value: 7.1 });
    const orchestrator = new ChatOrchestrator(toolThenAnswer(), [sensorTool(run)]);

    const first = await orchestrator.run(messages, { device: "Algalita Pod" });
    const second = await orchestrator.run(messages, { device: "Old Woman Creek 2026" });
    const third = await orchestrator.run(messages);

    expect(first.invocations[0].arguments.device).toBe("Algalita Pod");
    expect(second.invocations[0].arguments.device).toBe("Old Woman Creek 2026");
    // A request that chose no pod gets none — not the pod the previous caller chose.
    expect(third.invocations[0].arguments).not.toHaveProperty("device");
  });
});

describe("ChatOrchestrator tool context", () => {
  it("hands the caller's token to every tool call", async () => {
    // The device API is organization-scoped, so a tool that does not receive this authenticates
    // with the deployment's own token and answers out of the wrong fleet.
    const run = jest.fn().mockResolvedValue({ ok: true });
    const { llm } = scriptedLlm([
      answer({ toolCalls: [toolCall("c1", "query_sensor_data", { metric: "ph" })] }),
      answer({ content: "pH is 7.9." }),
    ]);

    await new ChatOrchestrator(llm, [sensorTool(run)]).run(messages, { token: "caller-jwt" });

    expect(run.mock.calls[0][1]).toEqual({ token: "caller-jwt" });
  });

  it("stops before the next round once the caller has gone away", async () => {
    // The loop can make MAX_TOOL_ROUNDS + 1 paid calls; a closed tab should not pay for them.
    const controller = new AbortController();
    controller.abort();
    const { llm, seen } = scriptedLlm([answer({ content: "never asked for" })]);

    const result = await new ChatOrchestrator(llm, []).run(messages, {
      signal: controller.signal,
    });

    expect(result.rounds).toBe(0);
    expect(seen).toHaveLength(0);
  });
});
