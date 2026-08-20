/**
 * Transport: the `?backend=` override, the chat POST, the SSE reader, and the health poll.
 * Moved out of index.html in Phase 0 — behavior is unchanged.
 */

// Exported so other modules can resolve a server-relative path (e.g. generate_report's
// `report_url`) against the same backend this page is actually talking to, rather than
// `location.origin` — the frontend's static server and the API are different origins in dev.
export const BACKEND = (new URLSearchParams(location.search)).get("backend") || "http://localhost:8000";
const API_PATH = "/api/v1/chat";

/**
 * POSTs one turn and returns the raw Response so the caller can branch on `r.ok`
 * before touching the stream. `history` must exclude the turn being sent as `query`.
 */
export function postChat(query, history, options = {}) {
  return fetch(BACKEND + API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `device` is omitted when no pod is selected, so the server keeps its existing behaviour
    // of asking rather than guessing between pods on opposite coasts.
    body: JSON.stringify({
      query,
      history,
      stream: true,
      ...(options.device ? { device: options.device } : {}),
    }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/**
 * The pod list for the context bar. Returns { devices: [...], water_type } or throws.
 *
 * Read-only, and sent with no `Authorization` header — this demo client has no token to send.
 * `DeviceController` reads one when a caller supplies it and otherwise falls back to the
 * deployment's `DEVICE_API_TOKEN`, which is the path every request from this page takes.
 */
export async function getDevices() {
  const r = await fetch(BACKEND + "/api/v1/devices");
  if (!r.ok) {
    // Carry the server's machine-readable `code` through to the caller. Throwing a bare
    // status string forces the UI to re-derive the reason by parsing text, and loses the
    // distinction between an expired token and an unconfigured deployment.
    const body = await r.json().catch(() => ({}));
    const err = new Error(body.error || "devices " + r.status);
    err.status = r.status;
    err.code = body.code;
    err.body = body;
    throw err;
  }
  return r.json();
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
