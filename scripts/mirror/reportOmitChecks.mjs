#!/usr/bin/env node
/**
 * The free report-omission checks on the Mirror (docs/migration/REPORT_OMIT_MIRROR_RUNBOOK.md §6):
 * every `omit` group through cer-api's `POST /api/v1/gilligan/report`, the shape and group
 * validation, and the report allowance. No model is called; each valid request renders one PDF
 * and uses one of the persona's 5 reports a day.
 *
 *   node scripts/mirror/reportOmitChecks.mjs [output-directory]
 *
 * Run it right after a seed: it uses 4 of Superadmin's 5 reports and all 5 of the River Watch
 * customer's (the sixth is the refusal check), so run the chat steps as other personas. It refuses any API other than localhost:5101, prints PASS or FAIL per check, keeps
 * every PDF and its `pdftotext -layout` text in the output directory, and exits 1 on any failure.
 * Tokens stay in memory and are never printed.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "http://localhost:5101/api/v1";
const PASSWORD = "mirror-dev-password";
const SUPER = "user-super-1@mirror.example.invalid";
const RIVER = "user-river-cust-1@mirror.example.invalid";
const ALL_GROUPS = ["turbidity_notes", "sensor_fault_notes", "threshold_notes", "data_quality"];

const out = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), "report-omit-checks-"));
fs.mkdirSync(out, { recursive: true });

/** Text a note group prints in a full report of a pod with a turbidity row. */
const MARKERS = {
  turbidity_notes: [
    "Turbidity is reported as a water-clarity band",
    "bands over an uncalibrated scale",
    "(relative index)",
    "provisional, uncalibrated conversion",
  ],
  threshold_notes: ["Site Baseline for", "a generic fallback rather than a limit set for this site"],
  data_quality: ["Data Quality"],
};

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const login = async (email) => {
  const res = await fetch(`${API}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok || typeof body.accessToken !== "string") {
    throw new Error(`login failed for ${email}: ${res.status}`);
  }
  return body.accessToken;
};

const reportsUsed = async (token) => {
  const res = await fetch(`${API}/gilligan/check-quota`, { headers: { Authorization: `Bearer ${token}` } });
  return (await res.json()).reports.used;
};

/** Posts a report request; returns the status and, for a PDF, its text. */
const report = async (token, body, name) => {
  const res = await fetch(`${API}/gilligan/report`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!(res.headers.get("content-type") ?? "").startsWith("application/pdf")) {
    return { status: res.status, error: (await res.json().catch(() => ({}))).error ?? "" };
  }
  const pdf = path.join(out, `${name}.pdf`);
  fs.writeFileSync(pdf, Buffer.from(await res.arrayBuffer()));
  execFileSync("pdftotext", ["-layout", pdf, path.join(out, `${name}.txt`)]);
  return { status: res.status, text: fs.readFileSync(path.join(out, `${name}.txt`), "utf8") };
};

/** The Omitted row's value, joined across its wrapped lines; "" when there is none. */
const omittedRow = (text) => {
  const match = text.match(/^Omitted\s+(.+(?:\n {20,}\S.*)*)/m);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
};

/** Each Section 2 row's numbers and flag, so two copies can be compared figure by figure. */
const tableFigures = (text) => {
  const rows = (text.match(/^ ?(Dissolved Oxygen|ORP|pH|Conductivity|Temperature|Turbidity)\b[^\n]*$/gm) ?? [])
    .filter((row) => (row.match(/-?\d[\d.]*/g) ?? []).length >= 4);
  return rows.map((row) => row.replace(/No range|—|\s+/g, " ").replace(/\s+/g, " ").trim()).join("\n");
};

const sectionHeadings = (text) => (text.match(/^\f? {1,3}\d\. [A-Z][a-z]+(?: [A-Z][a-z]+)?$/gm) ?? []).map((h) => h.trim());

const expectOmitted = (copy, groups, full, label) => {
  const labels = {
    turbidity_notes: "turbidity notes",
    sensor_fault_notes: "sensor fault notes",
    threshold_notes: "threshold notes",
    data_quality: "Data Quality section",
  };
  const expected = `${groups.map((g) => labels[g]).join(", ")} (at the requester's request)`;
  check(`${label}: Omitted row`, omittedRow(copy.text) === expected, omittedRow(copy.text) || "no row");
  check(`${label}: every figure matches the full copy`, tableFigures(copy.text) === tableFigures(full.text));
  for (const [group, markers] of Object.entries(MARKERS)) {
    for (const marker of markers) {
      const present = group === "data_quality"
        ? sectionHeadings(copy.text).some((h) => h.endsWith(marker))
        : copy.text.includes(marker);
      const want = !groups.includes(group);
      check(`${label}: "${marker}" ${want ? "kept" : "removed"}`, present === want);
    }
  }
};

const main = async () => {
  console.log(`output: ${out}`);
  const superToken = await login(SUPER);
  const riverToken = await login(RIVER);
  const superBefore = await reportsUsed(superToken);
  const riverBefore = await reportsUsed(riverToken);
  check("allowance starts unused (run right after a seed)", superBefore <= 2 && riverBefore <= 1,
    `Superadmin ${superBefore}, River Watch ${riverBefore} used of 5`);

  // Superadmin, Demo Public Dock Buoy: full, turbidity notes, all four (with a repeat).
  const dock = { time_range: "last 7 days", device: "Demo Public Dock Buoy" };
  const full = await report(superToken, dock, "C1-dock-full");
  check("C1 full report: 200 PDF", full.status === 200 && Boolean(full.text), String(full.status));
  if (!full.text) throw new Error("no full report; stopping");
  check("C1 full report: no Omitted row", omittedRow(full.text) === "");
  for (const [group, markers] of Object.entries(MARKERS)) {
    for (const marker of markers) {
      const present = group === "data_quality"
        ? sectionHeadings(full.text).some((h) => h.endsWith(marker))
        : full.text.includes(marker);
      check(`C1 full report: "${marker}" printed`, present);
    }
  }

  const turbidity = await report(superToken, { ...dock, omit: ["turbidity_notes"] }, "C2-dock-turbidity-notes");
  check("C2 turbidity_notes: 200 PDF", turbidity.status === 200, String(turbidity.status));
  if (turbidity.text) {
    expectOmitted(turbidity, ["turbidity_notes"], full, "C2");
    check("C2: turbidity band still printed", /Turbidity \(Relative\)[^\n]*(Clear|Moderate|Turbid)\s*$/m.test(turbidity.text));
  }

  const all = await report(superToken, { ...dock, omit: [...ALL_GROUPS, "data_quality"] }, "C3-dock-all-four");
  check("C3 all four groups, one repeated: 200 PDF", all.status === 200, String(all.status));
  if (all.text) {
    expectOmitted(all, ALL_GROUPS, full, "C3");
    const headings = sectionHeadings(all.text);
    check("C3: sections renumber (Recommendations moves up one)",
      headings.at(-1) === `${sectionHeadings(full.text).length - 1}. Recommendations`, headings.join(" | "));
  }

  // Validation: cer-api rejects a malformed list without calling Gilligan; Gilligan rejects an
  // unknown group and cer-api relays it. None of these counts against the allowance.
  const notList = await report(superToken, { ...dock, omit: "turbidity_notes" }, "x");
  check("V1 omit as a string: 400 from cer-api", notList.status === 400 && /omit list/.test(notList.error), `${notList.status} ${notList.error}`);
  const badName = await report(superToken, { ...dock, omit: ["Bad!"] }, "x");
  check("V2 omit [\"Bad!\"]: 400 from cer-api", badName.status === 400 && /omit list/.test(badName.error), `${badName.status}`);
  const tooMany = await report(superToken, { ...dock, omit: Array(11).fill("data_quality") }, "x");
  check("V3 eleven entries: 400 from cer-api", tooMany.status === 400 && /omit list/.test(tooMany.error), `${tooMany.status}`);
  const unknown = await report(superToken, { ...dock, omit: ["recommendations"] }, "x");
  check("V4 omit [\"recommendations\"]: Gilligan's 400 relayed, naming the four groups",
    unknown.status === 400 && ALL_GROUPS.every((g) => unknown.error.includes(g)), `${unknown.status} ${unknown.error.slice(0, 120)}`);
  const empty = await report(superToken, { ...dock, omit: [] }, "x");
  check("V5 omit []: treated as no omit, no report made here", empty.status === 200 || empty.status === 429, String(empty.status));
  const superAfter = await reportsUsed(superToken);
  check("allowance: Superadmin counted 3 valid reports plus V5, not the rejected ones",
    superAfter - superBefore === 4 || (empty.status === 429 && superAfter - superBefore === 3), `${superBefore} -> ${superAfter}`);

  // River Watch customer, own pod: threshold notes, sensor fault notes, Data Quality alone.
  const river = { time_range: "last 7 days", device: "River Watch Float" };
  const riverFull = await report(riverToken, river, "C4-river-full");
  check("C4 customer's own pod, full: 200 PDF", riverFull.status === 200, String(riverFull.status));
  if (riverFull.text) {
    for (const [name, group] of [["C5", "threshold_notes"], ["C6", "data_quality"], ["C7", "sensor_fault_notes"]]) {
      const copy = await report(riverToken, { ...river, omit: [group] }, `${name}-river-${group}`);
      check(`${name} ${group}: 200 PDF`, copy.status === 200, String(copy.status));
      if (copy.text) {
        const labels = { threshold_notes: "threshold notes", data_quality: "Data Quality section", sensor_fault_notes: "sensor fault notes" };
        check(`${name}: Omitted row`, omittedRow(copy.text) === `${labels[group]} (at the requester's request)`, omittedRow(copy.text));
        check(`${name}: every figure matches the full copy`, tableFigures(copy.text) === tableFigures(riverFull.text));
        const removed = group === "data_quality"
          ? !sectionHeadings(copy.text).some((h) => h.endsWith("Data Quality"))
          : group === "threshold_notes" ? !copy.text.includes("Site Baseline for") : true;
        check(`${name}: its notes removed, the others kept`, removed && (group === "turbidity_notes" || copy.text.includes("Turbidity is reported as a water-clarity band") === riverFull.text.includes("Turbidity is reported as a water-clarity band")));
      }
    }
  }
  const sixth = await report(riverToken, { ...river, omit: ["data_quality"] }, "x");
  check("allowance: a customer's 5th report is served", sixth.status === 200, String(sixth.status));
  const over = await report(riverToken, river, "x");
  check("allowance: the 6th report is refused with 429", over.status === 429, `${over.status} ${over.error.slice(0, 100)}`);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
