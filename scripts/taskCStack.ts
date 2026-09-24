/** Controlled local stack for Task C. No external fetches, credentials or model calls. */
process.env.SENSOR_TOOL = "false";
process.env.REPORT_TOOL = "false";
process.env.DEFAULT_RETRIEVAL = "stub";
process.env.AUDIT_LOG = "false";
process.env.QUERY_QUOTA = "false";
process.env.GILLIGAN_BACKEND = "rag";
process.env.CER_RAG_BASE_URL = "http://127.0.0.1:8010";
process.env.DOTENV_CONFIG_PATH = "/dev/null";
const express = require("express");
const cors = require("cors");
const path = require("path");
const { ChatController } = require("../src/controllers/ChatController");
const { ChatOrchestrator } = require("../src/services/ChatOrchestrator");
const { REFUSAL_SENTENCE } = require("../src/prompt/systemPrompt");
const serverRoot = process.env.TASK_C_SERVER_WORKTREE;
if (!serverRoot) throw new Error("TASK_C_SERVER_WORKTREE is required");
const { GilliganController } = require(path.join(serverRoot, "src/controllers/GilliganController"));
const { GilliganService } = require(path.join(serverRoot, "src/services/GilliganService"));
const { DevFirestoreService } = require(path.join(serverRoot, "src/services/DevChatStore"));
const nativeFetch = global.fetch;
global.fetch = (input: any, init: any) => {
  const url = new URL(String(input));
  if (url.hostname !== "127.0.0.1" || url.port !== "8010") throw new Error("Fixture blocked nonlocal fetch");
  return nativeFetch(input, init);
};
const results: Record<string, unknown> = {
  empty: { value: null, n_samples: 0, metric: "turbidity", device_last_reported: "2026-08-07T00:00:00Z", window_actually_searched: { start: "2026-08-01", end: "2026-08-07", complete: false, reason: "Controlled incomplete window" }, note: "provisional, uncalibrated index" },
  zero: { value: 0, n_samples: 3, metric: "temperature", unit: "C" },
  error: { error: "Controlled device timeout" },
};
const tool = (name: string, args: object, id: string) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const llm = {
  complete: async (messages: any[]) => {
    const question = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    if (question.includes("refusal")) return { content: REFUSAL_SENTENCE, model: "controlled", toolCalls: [] };
    if (question.includes("legacy")) return { content: "Legacy readable answer.", model: "controlled", toolCalls: [] };
    if (!messages.some((m) => m.role === "tool")) return { content: "", model: "controlled", toolCalls: [tool("query_sensor_data", { metric: "turbidity", scenario: "empty" }, "a"), tool("query_sensor_data", { scenario: "zero" }, "b"), tool("query_sensor_data", { scenario: "error" }, "c"), tool("generate_report", { time_range: "last 7 days" }, "d"), tool("query_sensor_data", { metric: "turbidity", scenario: "empty" }, "e")] };
    return { content: 'No readings in the requested window 【T1】. Temperature was actually 0 C 【T2】. One query failed 【T3】. Report 2026‑09‑01 to 2026‑09‑08 【T4】. Repeated lookup 【T5】. Document 【1†"unique evidence"】. Invalid 【】 【?】 【T99】 【99】 【2†"unique evidence"}】. Ambiguous 【99†"shared quote"】.', model: "controlled", toolCalls: [] };
  },
};
const handlers = [
  { definition: { type: "function", function: { name: "query_sensor_data", description: "fixture", parameters: { type: "object", properties: {} } } }, run: async (args: any) => results[args.scenario] },
  { definition: { type: "function", function: { name: "generate_report", description: "fixture", parameters: { type: "object", properties: {} } } }, run: async () => ({ report_period: "2026-09-01 to 2026-09-08", report_request: { time_range: "last 7 days" }, site_name: "Fixture pod", status: "Watch" }) },
];
const registry = { resolve: () => ({ mode: "stub", getContext: async () => [{ id: "one", source: "fixture-one", text: "shared quote" }, { id: "two", source: "fixture-two", text: "shared quote and unique evidence" }] }) };
const rag = express();
rag.use(cors()); rag.use(express.json());
rag.get("/health", (_req: any, res: any) => res.json({ controlled: true }));
rag.post("/api/v1/chat", new ChatController(registry, llm, new ChatOrchestrator(llm, handlers, 1)).postChat);
rag.use(express.static(path.resolve(__dirname, "../frontend")));
const store = new DevFirestoreService();
const service = new GilliganService(store, null, {});
const relayController = new GilliganController(service, {}, {});
const relay = express();
relay.use(cors()); relay.use(express.json());
relay.use((req: any, _res: any, next: any) => { req.user = { id: "fixture-user", role: "superadmin" }; next(); });
relay.get("/api/v1/gilligan/question", relayController.question);
relay.get("/api/v1/gilligan/chats", relayController.chats);
relay.get("/api/v1/gilligan/check-quota", (_req: any, res: any) => res.json({ available: true, enabled: false }));
relay.get("/api/v1/devices", (_req: any, res: any) => res.json([]));
relay.use((_req: any, res: any) => res.status(404).json({ error: "Fixture route only" }));
void service.addQuestionAnswer("", "fixture-user", "legacy saved message", null, "Legacy readable answer.", undefined, "cer-rag");
const servers = [rag.listen(8010, "127.0.0.1"), relay.listen(5001, "127.0.0.1")];
console.log("Controlled stack: rag 8010, relay 5001. External fetches blocked.");
process.on("SIGINT", () => { servers.forEach((server) => server.close()); });
