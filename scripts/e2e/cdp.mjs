// A small Chrome DevTools Protocol driver for the Gilligan end-to-end bot.
// Dependency-free like scripts/taskCBrowser.mjs: Node's WebSocket, the Chromium Playwright caches.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_CHROME = path.join(homedir(), ".cache/ms-playwright/chromium-1140/chrome-linux/chrome");

export class Browser {
  static async launch({ port = 9231, profileDir }) {
    const executable = process.env.E2E_CHROME ?? DEFAULT_CHROME;
    await fs.rm(profileDir, { recursive: true, force: true });
    const proc = spawn(executable, [
      "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking",
      "--disable-component-update", "--disable-sync", "--no-first-run", "--hide-scrollbars",
      `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "about:blank",
    ], { stdio: "ignore" });
    let version;
    for (let i = 0; i < 80 && !version; i++) {
      try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await delay(250); }
    }
    if (!version) { proc.kill(); throw new Error("Chromium did not start"); }
    const browser = new Browser(proc, version.webSocketDebuggerUrl);
    await browser.connect();
    return browser;
  }

  constructor(proc, wsUrl) {
    this.proc = proc;
    this.wsUrl = wsUrl;
    this.serial = 0;
    this.pending = new Map();
    this.listeners = new Set();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id !== undefined) {
        const call = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (!call) return;
        if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`));
        else call.resolve(message.result);
      } else {
        for (const listener of this.listeners) listener(message);
      }
    });
  }

  /** Every call times out, so a command Chromium never answers fails the scenario instead of hanging the run. */
  send(method, params = {}, sessionId, timeout = 90000) {
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: no reply within ${timeout} ms`));
      }, timeout);
      const settle = (fn) => (value) => { clearTimeout(timer); fn(value); };
      this.pending.set(id, { resolve: settle(resolve), reject: settle(reject), method });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** An isolated profile: its own localStorage, so each persona starts logged out. */
  async newContext(downloadPath) {
    const { browserContextId } = await this.send("Target.createBrowserContext", { disposeOnDetach: true });
    await fs.mkdir(downloadPath, { recursive: true });
    await this.send("Browser.setDownloadBehavior", {
      behavior: "allow", browserContextId, downloadPath, eventsEnabled: true,
    });
    return new Context(this, browserContextId, downloadPath);
  }

  async close() {
    try { await this.send("Browser.close"); } catch { /* already gone */ }
    this.proc.kill();
  }
}

export class Context {
  constructor(browser, id, downloadPath) {
    this.browser = browser;
    this.id = id;
    this.downloadPath = downloadPath;
    this.downloads = [];
    const names = new Map();
    this.off = browser.on(({ method, params }) => {
      if (method === "Browser.downloadWillBegin") names.set(params.guid, params.suggestedFilename);
      if (method === "Browser.downloadProgress" && params.state === "completed" && names.has(params.guid)) {
        this.downloads.push({ filename: names.get(params.guid), at: Date.now() });
      }
    });
  }

  async newPage() {
    const { targetId } = await this.browser.send("Target.createTarget", { url: "about:blank", browserContextId: this.id });
    const { sessionId } = await this.browser.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new Page(this.browser, sessionId, targetId);
    await page.init();
    return page;
  }

  async close() {
    this.off();
    try { await this.browser.send("Target.disposeBrowserContext", { browserContextId: this.id }); } catch { /* gone */ }
  }
}

export class Page {
  constructor(browser, sessionId, targetId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.exceptions = [];
    this.consoleErrors = [];
    this.requests = [];
    const byId = new Map();
    this.off = browser.on((message) => {
      if (message.sessionId !== sessionId) return;
      const { method, params } = message;
      if (method === "Runtime.exceptionThrown") {
        const details = params.exceptionDetails;
        this.exceptions.push({ at: Date.now(), text: (details.exception?.description ?? details.text ?? "").slice(0, 600) });
      } else if (method === "Runtime.consoleAPICalled" && params.type === "error") {
        const text = params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
        this.consoleErrors.push({ at: Date.now(), text: text.slice(0, 600) });
      } else if (method === "Log.entryAdded" && params.entry.level === "error" && params.entry.source !== "network") {
        this.consoleErrors.push({ at: Date.now(), text: params.entry.text.slice(0, 600) });
      } else if (method === "Network.requestWillBeSent") {
        const request = { id: params.requestId, at: Date.now(), method: params.request.method, url: params.request.url, type: params.type };
        byId.set(params.requestId, request);
        this.requests.push(request);
      } else if (method === "Network.responseReceived") {
        const request = byId.get(params.requestId);
        if (request) {
          request.status = params.response.status;
          const headers = Object.fromEntries(Object.entries(params.response.headers).map(([k, v]) => [k.toLowerCase(), v]));
          if (headers["retry-after"]) request.retryAfter = headers["retry-after"];
        }
      } else if (method === "Network.loadingFailed") {
        const request = byId.get(params.requestId);
        if (request) request.failed = params.errorText;
      }
    });
  }

  send(method, params) { return this.browser.send(method, params, this.sessionId); }

  async init() {
    for (const method of ["Page.enable", "Runtime.enable", "Network.enable", "Log.enable"]) await this.send(method);
  }

  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(`eval: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    }
    return result.result.value;
  }

  async goto(url) {
    await this.send("Page.navigate", { url });
    await delay(300);
    await this.waitFor("document.readyState === 'complete'", 30000);
  }

  async waitFor(expression, timeout = 15000, interval = 200) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        const value = await this.eval(expression);
        if (value) return value;
      } catch { /* mid-navigation */ }
      await delay(interval);
    }
    throw new Error(`timed out after ${timeout} ms waiting for ${expression.slice(0, 140)}`);
  }

  /** A real mouse click at the element's centre, which MUI's Select and buttons both honour. */
  async click(elementExpression) {
    const point = await this.eval(`(() => {
      const el = (${elementExpression});
      if (!el) return null;
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!point) throw new Error(`nothing to click: ${elementExpression.slice(0, 140)}`);
    await this.front();
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  }

  async type(elementExpression, text) {
    await this.click(elementExpression);
    await this.eval(`(${elementExpression}).focus()`);
    await this.send("Input.insertText", { text });
  }

  async key(key) {
    const codes = { Enter: { code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, Escape: { code: "Escape", windowsVirtualKeyCode: 27 } };
    const { text, ...code } = codes[key];
    await this.front();
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, ...code, ...(text ? { text } : {}) });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, ...code });
  }

  /** Headless Chromium delivers input only to the tab in front, so a second tab must not strand the first. */
  async front() {
    await this.send("Page.bringToFront");
  }

  async screenshot(file) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(file, Buffer.from(data, "base64"));
  }

  async viewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  }

  async close() {
    this.off();
    try { await this.browser.send("Target.closeTarget", { targetId: this.targetId }); } catch { /* gone */ }
  }
}
