import express from "express";
import request from "supertest";
import { ChatController } from "../../src/controllers/ChatController";
import { ChatOrchestrator } from "../../src/services/ChatOrchestrator";
import { LlmService } from "../../src/services/LlmService";
import { RetrievalRegistry } from "../../src/retrieval/RetrievalRegistry";

it.each([false, true])("audits mixed markers and exposes tool handles over HTTP (stream=%s)", async (stream) => {
  const llm = { complete: jest.fn()
    .mockResolvedValueOnce({ content: "", model: "controlled", toolCalls: [{ id: "call", type: "function", function: { name: "fixture", arguments: "{}" } }] })
    .mockResolvedValueOnce({ content: 'Zero 【T1】. Quote 【1†"unique evidence"】. Bad 【】 【?】 【T9】 【9】.', model: "controlled", toolCalls: [] }) } as unknown as LlmService;
  const registry = { resolve: () => ({ mode: "stub", getContext: async () => [{ id: "a", source: "a", text: "different" }, { id: "b", source: "b", text: "unique evidence" }] }) } as unknown as RetrievalRegistry;
  const orchestrator = new ChatOrchestrator(llm, [{ definition: { type: "function", function: { name: "fixture", description: "controlled", parameters: { type: "object", properties: {} } } }, run: async () => ({ value: 0, n_samples: 1 }) }], 1);
  const app = express();
  app.use(express.json());
  app.post("/api/v1/chat", new ChatController(registry, llm, orchestrator).postChat);
  const response = await request(app).post("/api/v1/chat").send({ query: "fixture", stream }).expect(200);
  const body = stream
    ? JSON.parse(response.text.split("\n\n").find((frame) => frame.startsWith("event: done"))!.split("data: ")[1])
    : response.body;
  expect(body.tool_calls[0].handle).toBe("T1");
  expect(body.tool_round_cap_reached).toBe(true);
  expect(body.answer).toContain('【2†"unique evidence"】');
  expect(body.audit.invalid_citations).toHaveLength(4);
  expect(body.audit.original_answer).toContain("【T9】");
});

it("finalizes document-only SSE with correction and a preserved audit", async () => {
  const llm = { completeStream: async function* stream() {
    yield { text: 'Quote 【9†"unique ' };
    yield { text: 'evidence"】 unknown 【T1】' };
  } } as unknown as LlmService;
  const registry = { resolve: () => ({ mode: "stub", getContext: async () => [{ id: "a", source: "a", text: "unique evidence" }] }) } as unknown as RetrievalRegistry;
  const app = express();
  app.use(express.json());
  app.post("/chat", new ChatController(registry, llm, new ChatOrchestrator(llm, [])).postChat);
  const response = await request(app).post("/chat").send({ query: "fixture", stream: true }).expect(200);
  const done = JSON.parse(response.text.split("\n\n").find((frame) => frame.startsWith("event: done"))!.split("data: ")[1]);
  expect(done.answer).toBe('Quote 【1†"unique evidence"】 unknown ');
  expect(done.audit.original_answer).toBe('Quote 【9†"unique evidence"】 unknown 【T1】');
  expect(done.audit.invalid_citations).toHaveLength(1);
  expect(done).not.toHaveProperty("tool_calls");
});
