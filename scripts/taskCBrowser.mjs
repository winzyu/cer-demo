import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import path from 'node:path';

const executable = process.env.TASK_C_CHROME ?? path.join(homedir(), '.cache/ms-playwright/chromium-1140/chrome-linux/chrome');
const chrome = spawn(executable, ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--remote-debugging-port=9223', '--user-data-dir=/tmp/task-c-browser-profile', 'about:blank'], { stdio: 'ignore' });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;
try {
  let tab;
  for (let i = 0; i < 40; i++) {
    try { tab = await (await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' })).json(); break; } catch { await delay(250); }
  }
  assert(tab, 'Chromium debugging endpoint ready');
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let serial = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const promise = pending.get(message.id); pending.delete(message.id);
      if (message.error) promise?.reject(new Error(JSON.stringify(message.error))); else promise?.resolve(message.result);
    } else if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const local = /^(http:\/\/(127\.0\.0\.1|localhost)(:|\/)|data:|about:)/.test(request.url);
      void send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId } : { requestId, errorReason: 'BlockedByClient' });
    }
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 180; i++) {
      try { if (await evaluate(expression)) return; } catch { /* Navigation replaces the execution context. */ }
      await delay(500);
    }
    throw new Error(`${label}: ${await evaluate('document.body.innerText.slice(-3000)')}`);
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.enable'); await send('Runtime.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.setItem("token", "fixture-only");' });
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/gilligan?question=fixture%20provenance' });
  await waitFor('document.body.innerText.includes("Tool evidence (5)")', 'Dashboard answer');
  const visible = await evaluate('document.body.innerText');
  for (const text of ['Search is incomplete', 'No readings in this window', 'Temperature was actually 0 C', 'Controlled device timeout', 'Tool round limit reached', 'Turbidity is provisional', 'Download report']) assert(visible.includes(text), text);
  for (const text of ['【】', '【?】', '【T99】', '【99】', '】】']) assert(!visible.includes(text), `invalid display ${text}`);
  assert.equal(await evaluate('document.querySelector("details").open'), false);
  await evaluate('[...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "Source 2").click()');
  assert((await evaluate('document.body.innerText')).includes('fixture-two'));
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent === "T5").click()');
  assert.equal(await evaluate('document.querySelector("details").open'), true);
  assert((await evaluate('document.body.innerText')).includes('Reused earlier result'));
  await evaluate('[...document.querySelectorAll("button")].find(b => /New chat/i.test(b.textContent)).click()');
  await waitFor('!document.body.innerText.includes("Tool evidence (5)")', 'New chat clears answer');
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("fixture provenance")).click()');
  await waitFor('document.body.innerText.includes("Tool evidence (5)")', 'Reopened history');
  assert.equal(await evaluate('document.querySelector("details").open'), false);
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent === "T1").click()');
  assert.equal(await evaluate('document.querySelector("details").open'), true);
  assert((await evaluate('document.body.innerText')).includes('"value": null'));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile('/tmp/task-c-dashboard.png', Buffer.from(shot.data, 'base64'));
  console.log('PASS dashboard: mixed citations, tool links, duplicate, zero/null, qualifications, report offer, reopened history');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/gilligan?question=refusal' });
  await waitFor('document.body.innerText.includes("Outside supported scope")', 'Refusal style');
  console.log('PASS dashboard: explicit refusal presentation');
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("legacy saved message")).click()');
  await waitFor('document.body.innerText.includes("Legacy readable answer.")', 'Legacy saved answer');
  assert.equal(await evaluate('document.querySelectorAll("details").length'), 0);
  console.log('PASS dashboard: legacy saved answer without invented provenance');
  // Use the actual demo renderer and parser in Chromium, with the same HTTP evidence.
  await send('Page.navigate', { url: 'http://127.0.0.1:8010/' });
  await waitFor('document.readyState === "complete"', 'Demo loaded');
  const demo = await evaluate(`(async () => {
    const {initRender, renderMessage, renderCitations, updateMessageBody} = await import('/js/render.js');
    const {renderProvenance} = await import('/js/provenance.js');
    const payload = await (await fetch('/api/v1/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:'fixture'})})).json();
    const container = document.createElement('div'); document.body.appendChild(container); initRender(container);
    const target = renderMessage('assistant',''); renderCitations(target.wrap,payload.citations);
    target.toolCalls=payload.tool_calls; updateMessageBody(target,payload.answer); renderProvenance(target.slots.provenance,payload);
    const button=[...target.body.querySelectorAll('button')].find(b=>b.textContent==='T5'); button.click();
    return {open:target.slots.provenance.querySelector('details').open, body:target.body.textContent, evidence:target.slots.provenance.textContent};
  })()`);
  assert(demo.open); assert(demo.body.includes('T5')); assert(!demo.body.includes('】')); assert(demo.evidence.includes('"value": null'));
  console.log('PASS demo: actual parser/rendering and answer-local provenance navigation');
} finally {
  ws?.close(); chrome.kill('SIGTERM');
}
