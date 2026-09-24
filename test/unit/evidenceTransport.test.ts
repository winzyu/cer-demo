import { createJsonTransport, createSseTransport } from "../../src/eval/transport";

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
it.each([false, true])("captures tool evidence and authoritative final answer (stream=%s)", async (stream) => {
  const evidence = {
    tool_calls: [{ handle: "T1", round: 1, arguments: {}, name: "fixture", result: { value: 0 }, deduped: true }],
    tool_round_cap_reached: false,
    audit: { original_answer: "raw 【?】", corrections: [], invalid_citations: [{ marker: "【?】", reason: "malformed", offset: 4 }] },
  };
  const done = { answer: "clean", ...evidence };
  const data = stream
    ? `event: meta\ndata: {"mode":"stub","citations":[]}\n\nevent: token\ndata: {"text":"raw 【?】"}\n\nevent: done\ndata: ${JSON.stringify(done)}\n\nevent: end\ndata: {}\n\n`
    : JSON.stringify({ ...done, mode: "stub", citations: [] });
  global.fetch = jest.fn(async () => new Response(data)) as typeof fetch;
  const transport = (stream ? createSseTransport : createJsonTransport)({ baseUrl: "http://fixture.invalid/api/v1" });
  const result = await transport({ query: "q", retrieval: "stub", history: [] });
  expect(result).toMatchObject({ answer: "clean", ...evidence });
});
