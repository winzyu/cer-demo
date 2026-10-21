import { IncomingMessage, ServerResponse } from "http";
import type { Socket } from "net";
import { Duplex } from "stream";
import type { ChatMessage } from "../../src/types/chat.types";

const mockComplete = jest.fn().mockResolvedValue({
  content: "Stubbed model answer.",
  model: "test-model",
  toolCalls: [],
});
jest.mock("../../src/services/LlmService", () => ({
  LlmService: jest.fn().mockImplementation(() => ({ complete: mockComplete })),
}));

process.env.DEFAULT_RETRIEVAL = "stub";
process.env.SENSOR_TOOL = "false";
process.env.REPORT_TOOL = "false";
process.env.QUERY_QUOTA = "false";
process.env.AUDIT_LOG = "false";
process.env.MAX_HISTORY_MESSAGES = "20";
// Load after pinning configuration. No credentials, model calls, or device reads are needed.
const app = require("../../src/app").default;

/** Run the real Express HTTP stack over in-memory streams, without a listening socket. */
const post = (path: string, body: unknown): Promise<{
  status: number;
  body: Record<string, unknown>;
}> => new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  const socket = new Duplex({
    read() {},
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  const payload = Buffer.from(JSON.stringify(body));
  const req = new IncomingMessage(socket as Socket);
  req.method = "POST";
  req.url = path;
  req.httpVersion = "1.1";
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  req.headers = { "content-type": "application/json", "content-length": String(payload.length) };
  const res = new ServerResponse(req);
  res.assignSocket(socket as Socket);
  res.on("error", reject);
  res.on("finish", () => {
    socket.destroy();
    try {
      const wire = Buffer.concat(chunks).toString("utf8");
      resolve({ status: res.statusCode, body: JSON.parse(wire.slice(wire.indexOf("\r\n\r\n") + 4)) });
    } catch (error) {
      reject(error);
    }
  });
  app(req, res);
  // Node's HTTP parser sets this before ending a fully received request stream.
  req.complete = true;
  req.push(payload);
  req.push(null);
});

describe("chat request body limits", () => {
  const sizedBody = (bytes: number) => {
    const body = { query: "q", history: [{ role: "user", content: "" }] };
    body.history[0].content = "x".repeat(bytes - Buffer.byteLength(JSON.stringify(body)));
    expect(Buffer.byteLength(JSON.stringify(body))).toBe(bytes);
    return body;
  };

  it("accepts history above 100 KiB and sends only recent complete exchanges to the model", async () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `${i}: ${"x".repeat(6000)}`,
    }));
    const body = { query: "and what about pH?", history };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(100 * 1024);

    const response = await post("/api/v1/chat", body);
    expect(response.status).toBe(200);
    expect(response.body.answer).toBe("Stubbed model answer.");

    const [messages] = mockComplete.mock.calls[0] as [ChatMessage[]];
    const modelHistory = messages.filter((message) => message.role !== "system").slice(0, -1);
    expect(modelHistory).toEqual(history.slice(-10));
    expect(Buffer.byteLength(JSON.stringify(modelHistory))).toBeLessThanOrEqual(64 * 1024);
    expect(messages[messages.length - 1]).toEqual({ role: "user", content: body.query });
  });

  it("accepts exactly 1 MiB and discards an oversized history message", async () => {
    const response = await post("/api/v1/chat", sizedBody(1024 * 1024));
    expect(response.status).toBe(200);
    const [messages] = mockComplete.mock.calls[0] as [ChatMessage[]];
    expect(messages.filter((message) => message.role !== "system")).toEqual([
      { role: "user", content: "q" },
    ]);
  });

  it("returns a JSON 413 above 1 MiB before calling the model", async () => {
    const response = await post("/api/v1/chat", sizedBody(1024 * 1024 + 1));
    expect(response.status).toBe(413);
    expect(response.body.error).toMatch(/too large/i);
    expect(response.body.message).toBe(response.body.error);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("applies the chat limit with a trailing slash and query parameters", async () => {
    const response = await post("/api/v1/chat/?test=1", sizedBody(110 * 1024));
    expect(response.status).toBe(200);
  });

  it.each(["/api/v1/reports", "/api/v1/chat/extra"])("keeps the 100 KiB limit on %s", async (path) => {
    const response = await post(path, sizedBody(100 * 1024 + 1));
    expect(response.status).toBe(413);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("still validates oversized history after parsing it", async () => {
    const body = sizedBody(110 * 1024);
    body.history[0].role = "system";
    const response = await post("/api/v1/chat", body);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/role.*must be one of/);
    expect(mockComplete).not.toHaveBeenCalled();
  });
});
