import { config } from "../config";
import type { ChatMessage } from "../types/chat.types";
import type {
  ToolCall, ToolDefinition, ToolHandler, ToolInvocation,
} from "../types/tool.types";
import { stripCommentaryMarkers } from "../utils/answerFormat";
import { createLogger } from "../utils/logger";
import type { LlmService, LlmUsage } from "./LlmService";

const log = createLogger("Orchestrator");

/**
 * The tool-round loop (`MIGRATION_SPEC.md` §3), deferred from Phase N1 and restored in N3.
 *
 * Per request: up to `MAX_TOOL_ROUNDS` tool-enabled rounds, then **one final round with tools
 * omitted** to force a text answer. A round that comes back without tool calls ends the loop
 * immediately and its content is the answer.
 *
 * **The cap is 16, not the legacy 5.** The heaviest eval fixture asks for all six parameters and
 * then a follow-up over them, which cannot fit in five rounds. Raising it is N5's "raise the
 * tool-round cap" item landing early; `timeline.md` records it there.
 *
 * A high cap changes the shape of the *failure*, not the success: a model stuck in a loop now has
 * 16 paid LLM calls to burn instead of 5. Two things bound that. Identical repeated calls are
 * served from the round's own cache instead of re-running (`deduped`), which is the common stuck
 * pattern — the model re-asking the question it just asked. And every round's usage is summed
 * into the reported total, so an expensive conversation is visible in the response rather than
 * only on the invoice.
 */

/**
 * Per-request inputs to one `run()`. Everything here is scoped to a single call and lives on
 * that call's stack — never on the orchestrator, which is constructed once per process and
 * shared by every concurrent request.
 */
export interface RunOptions {
  /**
   * The pod the caller already chose, used as the **default** `device` argument for any tool
   * that declares one and was called without it.
   *
   * **The model's choice wins.** This only fills the gap where the tool would otherwise have to
   * come back and ask which pod was meant (`SENSOR_DEVICE_LABEL` is deliberately unset, so with
   * several pods visible that question is the tool's normal answer). If the model names a device
   * in its arguments — because the user asked about a different pod in the question itself —
   * that name is used and this one is ignored.
   */
  device?: string;
}

export interface OrchestratorResult {
  content: string;
  model: string;
  /** Summed across every round — this is what a request actually cost, not just its last call. */
  usage: LlmUsage;
  /** Every tool call executed, in order. Traced, never cited (§3 rule 4). */
  invocations: ToolInvocation[];
  /** LLM calls made, including the forced final round. */
  rounds: number;
  /** True when the loop hit the cap without the model producing a tool-free answer. */
  capped: boolean;
}

/** Returned when the cap is hit and the model never produced any prose at all (§3 rule 5). */
export const ROUND_CAP_PLACEHOLDER = "I could not finish working through that question — I kept "
  + "needing more sensor lookups and ran out of steps. Please ask about one metric or one time "
  + "range at a time.";

const sumUsage = (total: LlmUsage, round?: LlmUsage): LlmUsage => {
  if (!round) {
    return total;
  }
  const add = (a?: number, b?: number): number | undefined => (
    // `undefined` means "not reported", which is not zero — adding it in as 0 would silently
    // turn a provider that omits cached-token counts into one reporting a 0% cache rate, and
    // that number decides ◆G7 (see LlmUsage.cachedPromptTokens).
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0)
  );
  return {
    promptTokens: add(total.promptTokens, round.promptTokens),
    completionTokens: add(total.completionTokens, round.completionTokens),
    totalTokens: add(total.totalTokens, round.totalTokens),
    cachedPromptTokens: add(total.cachedPromptTokens, round.cachedPromptTokens),
  };
};

/** Stable key for the dedupe cache: same tool, same arguments, regardless of key order. */
const callKey = (name: string, args: Record<string, unknown>): string => {
  const ordered = Object.keys(args).sort().map((key) => [key, args[key]]);
  return `${name}(${JSON.stringify(ordered)})`;
};

export class ChatOrchestrator {
  private readonly llm: LlmService;

  private readonly handlers: Map<string, ToolHandler>;

  private readonly definitions: ToolDefinition[];

  private readonly maxToolRounds: number;

  constructor(
    llm: LlmService,
    tools: ToolHandler[] = [],
    maxToolRounds: number = config.tools.maxToolRounds,
  ) {
    this.llm = llm;
    this.handlers = new Map(tools.map((tool) => [tool.definition.function.name, tool]));
    this.definitions = tools.map((tool) => tool.definition);
    this.maxToolRounds = maxToolRounds;
  }

  /** True when this orchestrator has anything to offer the model. */
  get hasTools(): boolean {
    return this.definitions.length > 0;
  }

  async run(messages: ChatMessage[], options: RunOptions = {}): Promise<OrchestratorResult> {
    // Copied, not mutated in place: the caller's message list is built per request and reused
    // by the streaming path, and a loop that appends to it would leak tool turns across calls.
    const conversation: ChatMessage[] = [...messages];
    const invocations: ToolInvocation[] = [];
    const resultCache = new Map<string, unknown>();

    let usage: LlmUsage = {};
    let model = "";
    let lastContent = "";
    let rounds = 0;

    // Rounds 1..N offer tools; round N+1 omits them so the model must answer in text.
    const totalRounds = this.maxToolRounds + 1;

    for (let round = 1; round <= totalRounds; round += 1) {
      const offerTools = this.hasTools && round <= this.maxToolRounds;

      // Sequential by nature — each round's input is the previous round's output.
      // eslint-disable-next-line no-await-in-loop
      const answer = await this.llm.complete(
        conversation,
        offerTools ? this.definitions : undefined,
      );

      // The one place `gpt-oss-20b`'s leaked `【commentary…】` markers are stripped (WS-5).
      // Every way out of this loop reads `content`, so both the JSON and SSE paths and the
      // round-cap fallback get the cleaned text from a single call. The raw `answer.content`
      // is kept for the assistant turn replayed to the provider below — that has to go back
      // verbatim, and rewriting it would perturb the cacheable prefix the bake-off measures.
      const content = stripCommentaryMarkers(answer.content);

      rounds = round;
      usage = sumUsage(usage, answer.usage);
      model = answer.model;
      // A round that was nothing but markers is not prose, so it must not become the fallback
      // answer below — the placeholder is honest where a stripped-empty string is not.
      if (content.trim() !== "") {
        lastContent = content;
      }

      // `?? []` rather than trusting the type: `LlmService` always sets this, but a test double
      // or a future caller that does not would otherwise throw a TypeError here and turn every
      // chat request into a 500. Treating "absent" as "no tools requested" is the safe reading.
      const toolCalls = answer.toolCalls ?? [];

      if (toolCalls.length === 0) {
        // An answer that was entirely markers leaves here as `""` rather than as the marker's
        // contents dressed up as prose. Empty is reportable; invented is not.
        return {
          content, model, usage, invocations, rounds, capped: false,
        };
      }

      if (!offerTools) {
        // The final round was not offered tools and asked for them anyway. Running them would
        // hit the device API for results that can never be sent anywhere — this round's output
        // is the last thing the loop will produce. Stop here and fall through to the fallback.
        log.warn("Model requested tools on the forced text-only round; ignoring the calls.");
        break;
      }

      // The assistant turn is replayed verbatim, tool_calls included. Providers reject a
      // `tool` message whose `tool_call_id` has no matching call in the history.
      conversation.push({
        role: "assistant",
        content: answer.content,
        tool_calls: toolCalls,
      });

      // `options.device` is passed down rather than stored: two requests running through this
      // shared orchestrator at the same time must not be able to see each other's pod.
      // eslint-disable-next-line no-await-in-loop
      const results = await this.dispatch(toolCalls, round, resultCache, options.device);
      invocations.push(...results.invocations);
      conversation.push(...results.messages);
    }

    // Round-cap fallback (§3 rule 5): the model never stopped calling tools. Return whatever
    // prose it last produced rather than nothing — a partial answer beats silence — and say
    // plainly that it was cut short when there is no prose at all.
    log.warn(`Hit the ${this.maxToolRounds}-round tool cap after ${invocations.length} tool calls.`);
    return {
      content: lastContent === "" ? ROUND_CAP_PLACEHOLDER : lastContent,
      model,
      usage,
      invocations,
      rounds,
      capped: true,
    };
  }

  /**
   * Runs every call the model asked for in one round.
   *
   * Sequential rather than parallel: the calls hit someone else's production API, and the
   * exploration script already established the rule of not bursting against it.
   */
  private async dispatch(
    toolCalls: ToolCall[],
    round: number,
    resultCache: Map<string, unknown>,
    requestDevice?: string,
  ): Promise<{ messages: ChatMessage[]; invocations: ToolInvocation[] }> {
    const messages: ChatMessage[] = [];
    const invocations: ToolInvocation[] = [];

    // The array methods cannot await sequentially, and these calls hit someone else's
    // production API — `map` would burst them in parallel.
    // eslint-disable-next-line no-restricted-syntax
    for (const call of toolCalls) {
      const { name } = call.function;
      const handler = this.handlers.get(name);

      let args: Record<string, unknown> = {};
      let result: unknown;
      let deduped = false;

      if (!handler) {
        // Fed back rather than raised (§3): an unknown name is usually a near-miss the model
        // can correct on the next round, and killing the request denies it the chance.
        result = { error: `unknown tool '${name}'` };
      } else {
        const parsedArgs = ChatOrchestrator.parseArguments(call.function.arguments);
        if ("error" in parsedArgs) {
          result = parsedArgs;
        } else {
          args = ChatOrchestrator.withRequestDevice(
            parsedArgs.args,
            handler.definition,
            requestDevice,
          );
          // Keyed on the *effective* arguments, so the dedupe cache cannot serve a reading from
          // one pod as the answer for another, and the trace records the pod actually queried.
          const key = callKey(name, args);
          if (resultCache.has(key)) {
            // The stuck-model pattern: re-asking a question it already asked. Serving the
            // stored answer costs nothing and leaves the round budget for real progress.
            deduped = true;
            result = resultCache.get(key);
            log.warn(`Repeated identical call to ${name}; serving the earlier result.`);
          } else {
            // eslint-disable-next-line no-await-in-loop
            result = await handler.run(args);
            resultCache.set(key, result);
          }
        }
      }

      invocations.push({
        round, name, arguments: args, result, ...(deduped ? { deduped: true } : {}),
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name,
        content: JSON.stringify(result),
      });
    }

    return { messages, invocations };
  }

  /**
   * Fills in the request's device where the model left one out.
   *
   * **Precedence: the model's explicit `device` beats the request's.** The request device is a
   * default, not an override — the caller picked a pod for the session, but a question naming
   * another pod is a more specific instruction and must not be silently redirected. Only an
   * absent or blank argument is filled.
   *
   * Applied only to tools whose schema actually declares `device`, so nothing is injected into a
   * tool that would not understand it and then have it recorded in the trace as if it mattered.
   */
  private static withRequestDevice(
    args: Record<string, unknown>,
    definition: ToolDefinition,
    requestDevice?: string,
  ): Record<string, unknown> {
    if (requestDevice === undefined || requestDevice.trim() === "") {
      return args;
    }
    if (!("device" in definition.function.parameters.properties)) {
      return args;
    }
    if (typeof args.device === "string" && args.device.trim() !== "") {
      return args;
    }
    return { ...args, device: requestDevice };
  }

  /**
   * Parses a tool call's arguments.
   *
   * `arguments` is a model-generated JSON *string*, so malformed JSON is a routine event rather
   * than an exceptional one. It comes back as a tool-result error the model can see and fix.
   */
  private static parseArguments(
    raw: string,
  ): { args: Record<string, unknown> } | { error: string } {
    try {
      const parsed = JSON.parse(raw === "" ? "{}" : raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { error: "tool arguments must be a JSON object" };
      }
      return { args: parsed as Record<string, unknown> };
    } catch {
      return { error: `tool arguments were not valid JSON: ${raw.slice(0, 200)}` };
    }
  }
}
