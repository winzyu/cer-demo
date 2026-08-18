/**
 * WS-3 — Input & response controls.
 *
 * Stub. `initInput` will take over the composer: multi-line textarea (enter sends,
 * shift+enter newlines, autosizing), starter prompts, stop generation via AbortController
 * (`api.postChat` already accepts a `signal`), copy answer / copy table, and regenerate.
 *
 * starter-prompts.json shape: { "prompts": ["question", ...] } — a flat array of strings.
 *
 * @param {object} ctx wiring handed in by main.js:
 *   { form, input, sendButton, promptsEl, controlsEl, submit(text), getLastUserTurn() }
 * @returns {void}
 */
export function initInput(ctx) { // eslint-disable-line no-unused-vars
  // no-op until WS-3; the plain <input> in index.html keeps working meanwhile
}
