/**
 * Transport: the `?backend=` override, the chat POST, the SSE reader, and the health poll.
 * Moved out of index.html in Phase 0 — behavior is unchanged.
 */

export const BACKEND = (new URLSearchParams(location.search)).get("backend") || "http://localhost:8000";
export const API_PATH = "/api/v1/chat";

/**
 * POSTs one turn and returns the raw Response so the caller can branch on `r.ok`
 * before touching the stream. `history` must exclude the turn being sent as `query`.
 */
export function postChat(query, history, options = {}) {
  return fetch(BACKEND + API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, history, stream: true }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/** Minimal SSE parser over a fetch body stream. Yields { event, data }. */
export async function* readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Events are separated by a blank line; keep any partial tail in the buffer.
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop();
    for (const block of blocks) {
      if (!block.trim()) continue;
      const event = (block.match(/^event: (.*)$/m) || [])[1] || "message";
      const raw = (block.match(/^data: (.*)$/m) || [])[1] || "{}";
      let data = {};
      try { data = JSON.parse(raw); } catch (e) { /* ignore malformed frame */ }
      yield { event, data };
    }
  }
}

/** Writes backend status into `healthEl`, marking it `.error` when the key is missing. */
export async function refreshHealth(healthEl) {
  try {
    const r = await fetch(BACKEND + "/health");
    const j = await r.json();
    const key = j.checks?.fireworksConfigured ? "key ok" : "NO API KEY";
    healthEl.textContent = `${j.status} · ${j.environment} · ${key}`;
    if (!j.checks?.fireworksConfigured) healthEl.classList.add("error");
  } catch (e) {
    healthEl.textContent = "backend unreachable @ " + BACKEND;
    healthEl.classList.add("error");
  }
}
