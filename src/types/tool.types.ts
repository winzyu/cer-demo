/**
 * Tool-calling shapes for the orchestration loop restored in Phase N3
 * (`MIGRATION_SPEC.md` §3, §4.3).
 *
 * These mirror the OpenAI function-calling wire format, which is what Fireworks speaks. They are
 * declared locally rather than imported from the SDK because the loop stores and replays them:
 * an assistant turn carrying `tool_calls` has to be appended back to the message list verbatim,
 * and typing that against the SDK's response types drags streaming and completion generics
 * through the whole pipeline for no benefit.
 */

/** JSON Schema for a tool's arguments. Loose on purpose — this is data sent to a provider. */
export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  /** The provider SDK types this as an open JSON-Schema object; extra keywords pass through. */
  [keyword: string]: unknown;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
}

/** One call the model asked for. `arguments` is a JSON **string**, and may be malformed. */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** A tool the loop can dispatch to. */
export interface ToolHandler {
  definition: ToolDefinition;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

/** One executed call, kept for the response trace. Results are traced, never cited (§3 rule 4). */
export interface ToolInvocation {
  /**
   * 1-based round the call was made in, so a multi-round conversation stays legible
   * after the fact.
   */
  round: number;
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  /** True when the loop served this from an earlier identical call instead of re-running it. */
  deduped?: boolean;
}
