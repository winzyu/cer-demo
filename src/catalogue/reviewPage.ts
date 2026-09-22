import type {
  AppliesTo, Catalogue, CatalogueEntry, Referral, Review,
} from "./types";

/**
 * Renders the supervisor's review page from the catalogue, so the page can never disagree with
 * what ships. `npm run catalogue:review` writes it to `docs/catalogue/review.html`; never edit
 * that file by hand.
 *
 * Deterministic on purpose (no timestamps): regenerating an unchanged catalogue leaves the file
 * unchanged, so a diff on the page is always a diff in the content.
 */

const escape = (text: string): string => text
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const KIND_LABEL: Readonly<Record<CatalogueEntry["kind"], string>> = {
  explanation: "Possible cause",
  limitation: "Limitation",
  "next-step": "Next step",
};

const statusBadge = (review: Review): string => `<span class="badge ${review.status}">${review.status}</span>`;

const usedIn = (a: AppliesTo, slot?: string): string => {
  if (!a.triggers) {
    return "Chat only";
  }
  const where = slot ? `Report (${slot})` : "Report";
  return `${where} and chat`;
};

const selection = (a: AppliesTo): string => {
  if (!a.triggers) {
    return "Chosen by the assistant from the conditions below";
  }
  const parts = [
    a.triggers.map((t) => (t === "threshold-crossing" ? "any threshold crossing" : t)).join(", "),
    a.water ? `${a.water.join(" or ")} water only` : "any water",
    ...(a.minConfidence !== undefined ? [`confidence at least ${Math.round(a.minConfidence * 100)}%`] : []),
    ...(a.minSeverity !== undefined ? [`severity ${a.minSeverity} or higher`] : []),
  ];
  return parts.join("; ");
};

const reviewLine = (review: Review): string => {
  const who = review.by ? ` by ${escape(review.by)} on ${escape(review.date ?? "")}` : "";
  const notes = review.notes ? `<p class="note">${escape(review.notes)}</p>` : "";
  return `<p>${statusBadge(review)}${who}</p>${notes}`;
};

const entryCard = (entry: CatalogueEntry, referrals: Map<string, Referral>): string => {
  const referral = entry.referral ? referrals.get(entry.referral) : undefined;
  const referralRow = referral
    ? `<dt>Referral</dt><dd>${escape(referral.provider ? `${referral.provider}: ${referral.service}` : referral.service)}${
      referral.contact ? ` (${escape(referral.contact)})` : ""} ${statusBadge(referral.review)}</dd>`
    : "";
  return `<article class="entry" id="${escape(entry.id)}">
  <header>
    <h3>${escape(entry.title)}</h3>
    <p class="meta"><code>${escape(entry.id)}</code> · ${KIND_LABEL[entry.kind]} · ${usedIn(entry.appliesTo, entry.slot)}</p>
  </header>
  <blockquote>${escape(entry.text)}</blockquote>
  <dl>
    <dt>Shown when</dt><dd>${escape(entry.appliesTo.conditions)}</dd>
    <dt>Report selection</dt><dd>${escape(selection(entry.appliesTo))}</dd>
    <dt>Evidence needed</dt><dd>${escape(entry.requiredEvidence)}</dd>
    <dt>Limitation</dt><dd>${escape(entry.limitations)}</dd>
    ${referralRow}
    <dt>Sources</dt><dd>${entry.sources.map(escape).join("<br>")}</dd>
    <dt>Review</dt><dd>${reviewLine(entry.review)}</dd>
  </dl>
  <p class="decision">Decision: ☐ Approve as written &nbsp; ☐ Approve with edits &nbsp; ☐ Reject</p>
</article>`;
};

const STYLE = `
:root { --bg: #fbfbf9; --fg: #1d2327; --muted: #5d6870; --line: #d9dde0; --card: #ffffff;
  --draft: #8a5a00; --draft-bg: #fff3d6; --ok: #1f6b3a; --ok-bg: #dff3e5; --no: #9b2c2c; --no-bg: #fbe3e3; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #15191c; --fg: #e4e8eb; --muted: #9aa5ad; --line: #2e363c; --card: #1c2226;
    --draft: #f3c46b; --draft-bg: #3a2f17; --ok: #8fd6a6; --ok-bg: #1a3324; --no: #f0a0a0; --no-bg: #3a1d1d; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 1.7rem; margin: 0 0 4px; }
h2 { font-size: 1.25rem; margin: 40px 0 12px; padding-top: 12px; border-top: 1px solid var(--line); }
h3 { font-size: 1.05rem; margin: 0; }
p, li { max-width: 70ch; }
.meta, .note, dt { color: var(--muted); }
.meta { margin: 2px 0 0; font-size: 0.9rem; }
.note { font-size: 0.9rem; margin: 4px 0 0; }
code { font-size: 0.88em; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; }
.entry { background: var(--card); border: 1px solid var(--line); border-radius: 8px;
  padding: 16px; margin: 16px 0; break-inside: avoid; }
blockquote { margin: 12px 0; padding: 8px 12px; border-left: 3px solid var(--fg); font-size: 1.02rem; }
dl { display: grid; grid-template-columns: 9.5rem 1fr; gap: 6px 12px; margin: 0; font-size: 0.93rem; }
dd { margin: 0; overflow-wrap: anywhere; }
td { overflow-wrap: break-word; }
dd p { margin: 0; }
@media (max-width: 560px) { dl { grid-template-columns: 1fr; } dd { margin-bottom: 6px; } }
.badge { display: inline-block; white-space: nowrap; padding: 0 8px; border-radius: 10px; font-size: 0.8rem; font-weight: 600; }
.badge.draft { color: var(--draft); background: var(--draft-bg); }
.badge.approved { color: var(--ok); background: var(--ok-bg); }
.badge.rejected { color: var(--no); background: var(--no-bg); }
.decision { margin: 12px 0 0; font-size: 0.9rem; color: var(--muted); }
@media print { body { background: #fff; color: #000; } .entry { border-color: #999; } }
`;

export const renderReviewPage = (catalogue: Catalogue): string => {
  const referrals = new Map(catalogue.referrals.map((r) => [r.id, r]));
  const count = (status: string): number => (
    catalogue.entries.filter((e) => e.review.status === status).length
  );
  const rows = catalogue.entries.map((e) => `<tr><td><a href="#${escape(e.id)}">${escape(e.title)}</a></td>`
    + `<td>${KIND_LABEL[e.kind]}</td><td>${usedIn(e.appliesTo, e.slot)}</td><td>${statusBadge(e.review)}</td></tr>`).join("\n");
  const referralRows = catalogue.referrals.map((r) => `<tr><td>${escape(r.service)}`
    + `<br><span class="meta">${escape(r.provider ?? "No named provider")}</span></td>`
    + `<td>${escape(r.contact ?? "None")}</td><td>${reviewLine(r.review)}</td></tr>`).join("\n");
  const sources = Object.entries(catalogue.sources)
    .map(([key, text]) => `<li><code>${escape(key)}</code>: ${escape(text)}</li>`).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gilligan Guidance Review</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>Gilligan guidance review</h1>
<p class="meta">Catalogue version ${escape(catalogue.version)} · ${catalogue.entries.length} entries: ${count("approved")} approved, ${count("draft")} draft, ${count("rejected")} rejected</p>

<p>The Gilligan assistant and its water-quality reports may only suggest possible causes, next steps and referrals that appear here with an approved status.
Anything not approved stays hidden from customers: reports then show the threshold crossing without naming a cause, and chat describes what was measured and what the sensors cannot tell.</p>
<p>Approving an entry means the wording is defensible exactly as written, the conditions for showing it are right, and Clean Earth Rovers will stand behind it appearing in a customer-facing answer or report.
Please mark each entry, and note any edits beside its wording.</p>
<p>Referrals to Clean Earth Rovers services also need their contact details confirmed.
An entry with a referral stays hidden until both the entry and the referral are approved.</p>

<h2>Summary</h2>
<div class="table-wrap"><table>
<thead><tr><th>Entry</th><th>Type</th><th>Used in</th><th>Status</th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>

<h2>Referrals</h2>
<div class="table-wrap"><table>
<thead><tr><th>Service</th><th>Contact</th><th>Review</th></tr></thead>
<tbody>
${referralRows}
</tbody>
</table></div>

<h2>Entries</h2>
${catalogue.entries.map((e) => entryCard(e, referrals)).join("\n")}

<h2>Sources</h2>
<ul>
${sources}
</ul>
</main>
</body>
</html>
`;
};
