// E2E_CHECKLIST groups B, D, E, H and I on an already running mirror stack (2026-09-29).
// Unlike gilliganE2E.mjs it starts, stops and restarts nothing: the server, cer-demo, emulator
// and dashboard belong to other sessions. It records every turn; judging is done by a person.
//
//   node scripts/e2e/mirrorChecklist.mjs [--run-id ID] [--groups B,D,E,H,I]
import fs from "node:fs/promises";
import path from "node:path";
import { Browser, delay } from "./cdp.mjs";

const argv = process.argv.slice(2);
const option = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at === -1 ? fallback : argv[at + 1]; };
const RUN_DIR = path.resolve("data/e2e", option("run-id", "mirror-bdehi-2026-09-29"));
const GROUPS = option("groups", "B,D,E,H,I").split(",");
const DASHBOARD = "http://localhost:3000";
const EMULATOR = "http://127.0.0.1:8080/v1/projects/demo-cer-mirror/databases/(default)/documents";
const PASSWORD = "mirror-dev-password";

const INPUT = `[...document.querySelectorAll("textarea")].find((t) => !t.getAttribute("aria-hidden") && t.offsetParent !== null)`;
const SEND = `document.querySelector('button[aria-label="Send question"]')`;
const SPINNER = `document.querySelector(".MuiCircularProgress-root")`;
const POD_SELECT = `document.querySelector("#gilligan-pod-label")?.parentElement?.querySelector(".MuiSelect-select")`;
const OPTIONS = `[...document.querySelectorAll("[role=listbox] [role=option]")]`;
const INPUT_LABEL = `(${INPUT})?.closest(".MuiFormControl-root")?.querySelector("label")?.innerText ?? ""`;
const QUOTA_LINE = `(${INPUT})?.closest(".items-end")?.querySelector("span.text-xs")?.innerText ?? ""`;
const byText = (selector, text) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.innerText.trim() === ${JSON.stringify(text)})`;
const JWT = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]+/g;
const redact = (text) => (text == null ? text : String(text).replace(JWT, "<jwt>"));

const transcript = [];
let shots = 0;
let current = "";

const screenshot = async (page, label) => {
  shots += 1;
  const file = `screenshots/${String(shots).padStart(3, "0")}-${`${current}-${label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 70)}.png`;
  await page.screenshot(path.join(RUN_DIR, file)).catch(() => {});
  return file;
};

const record = (entry) => { transcript.push({ group: current, at: new Date().toISOString(), ...entry }); };

class Session {
  static async open(browser, persona, { width = 1366, height = 900 } = {}) {
    const context = await browser.newContext(path.join(RUN_DIR, "downloads", persona));
    const page = await context.newPage();
    await page.viewport(width, height);
    const s = Object.assign(new Session(), { persona, context, page });
    await page.goto(`${DASHBOARD}/login`);
    await page.waitFor(`(() => { const e = document.querySelector("input[type=email]"); if (!e) return false; const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; })()`, 45000);
    await page.type(`document.querySelector("input[type=email]")`, `user-${persona}@mirror.example.invalid`);
    await page.type(`document.querySelector("input[type=password]")`, PASSWORD);
    await page.click(`document.querySelector("button[type=submit]")`);
    await page.waitFor(`location.pathname.startsWith("/home")`, 45000);
    await s.openGilligan();
    return s;
  }

  async openGilligan() {
    await this.page.goto(`${DASHBOARD}/gilligan`);
    await this.page.waitFor(`document.body.innerText.includes("Chat history")`, 45000);
    await delay(2500);
    record({ persona: this.persona, action: "opened Gilligan", quotaLine: await this.quotaLine(), screenshot: await screenshot(this.page, `${this.persona}-open`) });
  }

  quotaLine() { return this.page.eval(QUOTA_LINE); }
  inputLabel() { return this.page.eval(INPUT_LABEL); }

  async pickPod(name) {
    const label = name || "No pod selected";
    for (let attempt = 1; ; attempt++) {
      await this.page.click(POD_SELECT);
      await this.page.waitFor(`${OPTIONS}.length > 0`, 8000);
      await this.page.click(`${OPTIONS}.find((o) => o.innerText.trim() === ${JSON.stringify(label)})`);
      try { await this.page.waitFor(`!document.querySelector("[role=listbox]")`, 8000); break; } catch (error) {
        if (attempt > 1) throw error;
        await this.page.key("Escape");
        await delay(1000);
      }
    }
    const shown = await this.page.eval(`(${POD_SELECT})?.innerText.trim() ?? ""`);
    record({ persona: this.persona, action: `picked ${label}`, shown });
  }

  async newChat() {
    await this.page.click(byText("button", "New chat"));
    await delay(400);
  }

  async ask(text) {
    const { page } = this;
    const before = await page.eval(`document.querySelectorAll(".gilligan-markdown").length`);
    await page.type(INPUT, text);
    await delay(200);
    const started = Date.now();
    await page.click(SEND);
    try { await page.waitFor(`!!${SPINNER}`, 3000, 50); } catch { /* answered or refused at once */ }
    try { await page.waitFor(`!${SPINNER}`, 150000, 250); } catch { /* recorded as no answer */ }
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    await delay(600);
    const result = await page.eval(`(() => {
      const answers = [...document.querySelectorAll(".gilligan-markdown")];
      const fresh = answers.length > ${before} ? answers[answers.length - 1].closest("div.p-2") : null;
      return {
        answer: fresh ? fresh.innerText : null,
        sources: fresh ? [...fresh.querySelectorAll('button[aria-label^="Source"]')].map((b) => b.innerText.trim()) : [],
        evidence: fresh ? fresh.querySelectorAll('button[aria-label^="Tool evidence"]').length : 0,
        reports: fresh ? [...fresh.querySelectorAll("button")].map((b) => b.innerText.trim()).filter((t) => t.startsWith("Download report")) : [],
        error: [...document.querySelectorAll("span.text-sm.p-2")].map((s) => s.innerText).join(" | "),
        rawMarker: fresh ? /†|【/.test(fresh.innerText) : false,
      };
    })()`);
    const entry = { persona: this.persona, question: text, seconds, ...result, answer: redact(result.answer), quotaLine: await this.quotaLine(), inputLabel: await this.inputLabel() };
    entry.screenshot = await screenshot(page, `${this.persona}-${text.slice(0, 30)}`);
    record(entry);
    return entry;
  }

  async download() {
    const before = this.context.downloads.length;
    await this.page.click(`[...document.querySelectorAll("button")].filter((b) => b.innerText.trim().startsWith("Download report")).pop()`);
    await delay(300);
    const preparing = await this.page.eval(`[...document.querySelectorAll("button")].map((b) => b.innerText.trim()).filter((t) => /report/i.test(t))`);
    const end = Date.now() + 120000;
    while (Date.now() < end && this.context.downloads.length === before) await delay(300);
    const file = this.context.downloads.length > before ? this.context.downloads.at(-1).filename : null;
    record({ persona: this.persona, action: "download", labelsWhilePreparing: preparing, file, screenshot: await screenshot(this.page, `${this.persona}-download`) });
    return file ? path.join(this.context.downloadPath, file) : null;
  }

  async close() { await this.page.close(); await this.context.close(); }
}

/** Sets a persona's question count for today (UTC) in the emulator's quota store; free, local only. */
const setQuestionsUsed = async (userId, organizationId, questions) => {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const doc = `${EMULATOR}/gilligan_usage/${encodeURIComponent(userId)}_${day}`;
  const expire = new Date(now.getTime() + 90 * 86_400_000);
  const response = await fetch(doc, {
    method: "PATCH", headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ fields: {
      userId: { stringValue: userId }, organizationId: { stringValue: organizationId }, day: { stringValue: day },
      questions: { integerValue: String(questions) }, reports: { integerValue: "0" }, tokens: { integerValue: "0" },
      updatedAt: { timestampValue: now.toISOString() }, expireAt: { timestampValue: expire.toISOString() },
    } }),
  });
  if (!response.ok) throw new Error(`quota write failed: ${response.status} ${await response.text()}`);
  record({ action: `set ${userId} questions used to ${questions} for ${day} in the emulator` });
};

const groups = {
  async B(browser) {
    const s = await Session.open(browser, "harbor-cust-1");
    const questions = [
      "What does dissolved oxygen measure, and why does it matter for aquatic life?",
      "How accurate is the pH probe, and how often should it be calibrated?",
      "How does water temperature affect dissolved oxygen?",
    ];
    await s.newChat();
    await s.pickPod("");
    for (const q of questions) await s.ask(q);
    await s.newChat();
    await s.pickPod("Harbor Pier Buoy");
    for (const q of questions) await s.ask(q);
    await s.close();
  },
  async D(browser) {
    const s = await Session.open(browser, "seaview-cust-1");
    await s.newChat();
    await s.pickPod("");
    await s.ask("Why did the pH at Seaview Outfall Buoy crash to 3 on September 27?");
    await s.ask("And what about the dissolved oxygen there over the same period?");
    await s.ask("How is the dissolved oxygen looking at Seaview Marina this week?");
    await s.close();
  },
  async E(browser) {
    const s = await Session.open(browser, "lake-cust-1");
    await s.newChat();
    await s.pickPod("Lakeside Buoy 2026");
    await s.ask("Give me a water quality report for the last 7 days");
    await s.download();
    await s.close();
  },
  async H(browser) {
    const s = await Session.open(browser, "harbor-cust-1", { width: 390, height: 844 });
    const layout = await s.page.eval(`(() => {
      const box = (el) => el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
      const input = ${INPUT};
      const send = ${SEND};
      const heading = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.innerText?.trim() === "Chat history");
      const inView = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; };
      return {
        scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
        inputTop: box(input), historyTop: box(heading), pickerTop: box(${POD_SELECT}),
        inputInView: inView(input), sendInView: inView(send),
      };
    })()`);
    record({ persona: s.persona, action: "H1 layout at 390 x 844", layout, screenshot: await screenshot(s.page, "h1-layout") });
    await s.newChat();
    const answer = await s.ask("What units is conductivity measured in?");
    if (answer.sources.length) {
      await s.page.click(`[...document.querySelectorAll('button[aria-label^="Source"]')].pop()`);
      await delay(800);
      const after = await s.page.eval(`({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })`);
      record({ persona: s.persona, action: "H2 tapped a source chip", after, screenshot: await screenshot(s.page, "h2-source") });
    }
    await s.close();
  },
  async I(browser) {
    await setQuestionsUsed("user-super-0000000005", "FF8Syo9Sypomrf4fqOez", 19);
    const s = await Session.open(browser, "super-5");
    record({ persona: s.persona, action: "I1 counter before the last question", quotaLine: await s.quotaLine(), inputLabel: await s.inputLabel() });
    await s.newChat();
    await s.ask("What is ORP?");
    const state = await s.page.eval(`({
      seePlans: [...document.querySelectorAll("a")].some((a) => a.innerText.trim() === "See plans"),
      sendDisabled: !${SEND} || ${SEND}.disabled, inputDisabled: !!(${INPUT})?.disabled,
    })`);
    record({ persona: s.persona, action: "I2 after the last question", quotaLine: await s.quotaLine(), inputLabel: await s.inputLabel(), ...state, screenshot: await screenshot(s.page, "i2-limit") });
    await s.openGilligan();
    const reloaded = await s.page.eval(`({ seePlans: [...document.querySelectorAll("a")].some((a) => a.innerText.trim() === "See plans"), sendDisabled: !${SEND} || ${SEND}.disabled })`);
    record({ persona: s.persona, action: "I3 after reload", quotaLine: await s.quotaLine(), inputLabel: await s.inputLabel(), ...reloaded, screenshot: await screenshot(s.page, "i3-reload") });
    await s.close();
  },
};

const main = async () => {
  await fs.mkdir(path.join(RUN_DIR, "screenshots"), { recursive: true });
  const browser = await Browser.launch({ port: 9241, profileDir: path.join(RUN_DIR, ".chrome-profile") });
  try {
    for (const group of GROUPS) {
      current = group;
      console.log(`[mirror] group ${group}`);
      try { await groups[group](browser); } catch (error) {
        record({ action: "error", error: redact(error.stack ?? error.message).split("\n").slice(0, 3).join(" ") });
        console.log(`[mirror] group ${group} error: ${error.message}`);
      }
      await fs.writeFile(path.join(RUN_DIR, "transcript.json"), JSON.stringify(transcript, null, 2));
    }
  } finally {
    await browser.close();
  }
  console.log(`[mirror] done: ${transcript.filter((t) => t.question).length} questions; ${path.join(RUN_DIR, "transcript.json")}`);
};

main().catch((error) => { console.error(redact(error.stack ?? error)); process.exit(1); });
