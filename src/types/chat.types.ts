import type { ToolCall } from "./tool.types";

/**
 * Message roles used on the wire. Fireworks speaks the OpenAI chat-completions shape.
 *
 * `tool` arrived with the Phase N3 orchestration loop: a tool result is appended as its own
 * message keyed by `tool_call_id`, not folded into the assistant turn (`MIGRATION_SPEC.md` §3).
 */
export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  /**
   * An assistant turn that only asks for tools carries **no** content — the provider sends
   * `null`, and it is stored as `""`. Anything reading this for an answer must check for tool
   * calls first, or an empty string reads as a silent model.
   */
  content: string;
  /** Present on an assistant turn that asked for tools. Replayed verbatim on the next round. */
  tool_calls?: ToolCall[];
  /** Required on a `role: "tool"` message; ties the result to the call that asked for it. */
  tool_call_id?: string;
  /** Optional on a `role: "tool"` message. Some providers use it, none require it. */
  name?: string;
}
