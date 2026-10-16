#!/usr/bin/env node
/**
 * Shows what each answer in a persona's most recent Gilligan chat did with reports, for the paid
 * chat steps of docs/migration/REPORT_OMIT_MIRROR_RUNBOOK.md §7. Free: it reads the saved chat
 * through the Mirror's cer-api and calls no model.
 *
 *   node scripts/mirror/reportOmitLastChat.mjs <persona-email>
 *
 * For every turn it prints the question, each `generate_report` call's arguments (with `omit`),
 * whether the server forced a retry (`report_retried`), the delivery line the server wrote, and
 * the download offers the page shows. The token stays in memory and is never printed.
 */
const API = "http://localhost:5101/api/v1";
const email = process.argv[2];
if (!email || !email.endsWith("@mirror.example.invalid")) {
  console.error("usage: node scripts/mirror/reportOmitLastChat.mjs <persona>@mirror.example.invalid");
  process.exit(2);
}

const seconds = (value) => value?._seconds ?? value?.seconds ?? (value ? Date.parse(value) / 1000 : 0);

const main = async () => {
  const login = await fetch(`${API}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "mirror-dev-password" }),
  });
  const { accessToken } = await login.json();
  if (!accessToken) throw new Error(`login failed: ${login.status}`);
  const chats = await (await fetch(`${API}/gilligan/chats`, { headers: { Authorization: `Bearer ${accessToken}` } })).json();
  const chat = [...chats].sort((a, b) => seconds(b.lastInteraction) - seconds(a.lastInteraction))[0];
  if (!chat) {
    console.log("no Gilligan chats for this persona");
    return;
  }
  console.log(`chat ${chat.id}, ${chat.messages.length} turn(s)`);
  chat.messages.forEach((message, index) => {
    const answer = message.answer ?? {};
    const text = String(answer.text ?? "");
    const calls = (answer.tool_calls ?? []).filter((call) => call.name === "generate_report");
    const delivery = text.split("\n").filter((line) => /^(New PDF in this reply:|No new PDF was made in this reply\.)/.test(line.trim()));
    console.log(`\n#${index + 1} Q: ${message.question?.text ?? ""}`);
    console.log(`   generate_report calls: ${calls.length === 0 ? "none" : ""}`);
    for (const call of calls) {
      const error = call.result && typeof call.result === "object" ? call.result.error : undefined;
      console.log(`     - ${JSON.stringify(call.arguments)}${call.deduped ? " (deduped)" : ""}${error ? ` error: ${error}` : ""}`);
    }
    console.log(`   report_retried: ${answer.report_retried === true}`);
    console.log(`   delivery line: ${delivery.length === 0 ? "none" : delivery.join(" / ")}`);
    for (const offer of answer.reports ?? []) {
      console.log(`   download offer: ${offer.siteName ?? "?"} ${JSON.stringify(offer.request)}`);
    }
    console.log(`   answer: ${text.replace(/\s+/g, " ").slice(0, 300)}${text.length > 300 ? " ..." : ""}`);
  });
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
