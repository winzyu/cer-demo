/** Message roles used on the wire. Fireworks speaks the OpenAI chat-completions shape. */
export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}
