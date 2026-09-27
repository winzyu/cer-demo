const fs = require("fs");
const S = process.argv[2];
const token = require(`${S}/login.json`).accessToken;
const dev = "dev:100000000000001";
const convs = [
  [{ q: "What is the latest dissolved oxygen reading on this pod?", device: dev }],
  [{ q: "How has pH trended over the last week?", device: dev }],
  [{ q: "Is the water temperature in range for this pod?", device: dev }],
  [{ q: "What were the minimum and maximum conductivity over the last 30 days?", device: dev }],
  [{ q: "Did the pod record anything in the last 24 hours?", device: dev }],
  [{ q: "Compare ORP this week against the week before.", device: dev },
   { q: "And is that change something I should worry about?", device: dev }],
  [{ q: "Generate a report for the last 7 days.", device: dev }],
  [{ q: "What's the turbidity doing, is the water clear?", device: dev }],
  [{ q: "Which pods can I see?" }],
];
(async () => {
  const out = [];
  for (const conv of convs) {
    const history = [];
    for (const turn of conv) {
      const t0 = Date.now();
      const res = await fetch("http://localhost:8011/api/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: turn.q, device: turn.device, history, stream: false }),
      });
      const body = await res.json();
      out.push({ q: turn.q, status: res.status, ms: Date.now() - t0, body });
      history.push({ role: "user", content: turn.q }, { role: "assistant", content: body.answer ?? "" });
      process.stdout.write(`${res.status} ${Date.now() - t0}ms ${turn.q}\n`);
    }
  }
  fs.writeFileSync(`${S}/toolcheck.json`, JSON.stringify(out, null, 2));
})();
