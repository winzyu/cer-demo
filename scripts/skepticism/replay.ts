/**
 * Paid replay of the data-skepticism incident (`docs/migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`
 * §6 steps 2, 4 and 5) against a running server whose device API is `fakeDeviceApi.ts`.
 *
 *   npx ts-node --transpile-only scripts/skepticism/replay.ts \
 *     --base http://localhost:8013 --label <name> --runs 3 --out <dir> [--budget 1.00] [--only incident|guards]
 *     [--guard-range "this week"]
 *   npx ts-node --transpile-only scripts/skepticism/replay.ts --regrade <out>/<label>.json
 *
 * Each run replays Michael's seven turns as one conversation on Bay Mouth Pod, then each guard
 * question as a fresh chat. Every answer, tool call and token count is written to
 * `<out>/<label>.json`; the checks below are deterministic first-pass flags with the sentences that
 * tripped them, meant to be read alongside the answers, not instead of them.
 *
 * Spend is costed at `glm-5p3-flash` rates (`src/eval/prices.ts`) from each response's `usage`,
 * which leaves out query-rewrite calls. The script stops before a run that would start over budget.
 */
import fs from "fs";
import path from "path";
import { BAY_MOUTH, ESTUARY_OXYGEN, HARBOR_ACID, QUIET_COVE } from "../../test/fixtures/skepticism/fleet";

const argument = (name: string, fallback?: string): string => {
  const index = process.argv.indexOf(`--${name}`);
  if (index > 0) return process.argv[index + 1];
  if (fallback === undefined) throw new Error(`--${name} is required`);
  return fallback;
};

const REGRADE = argument("regrade", "");
const BASE = REGRADE ? "" : argument("base");
const LABEL = REGRADE ? "" : argument("label");
const RUNS = Number(argument("runs", "3"));
const OUT = REGRADE ? "" : argument("out");
const BUDGET = Number(argument("budget", "1.00"));
const ONLY = argument("only", "");
/**
 * The guards' period. "this week" is a calendar week from Monday 00:00 UTC, so early on a Monday it
 * covers hours, not days; "over the last 7 days" asks for the rolling week the guards are built on.
 */
const GUARD_RANGE = argument("guard-range", "this week");

/** USD per 1M tokens, `glm-5p3-flash` in `src/eval/prices.ts`. */
const PRICE = { input: 0.15, cachedInput: 0.03, output: 0.5 };

/** Rebuilt from the incident table; the production wording was not kept. */
const INCIDENT_TURNS = [
  "What is going on with the pH from this buoy? We've had massive south swells and high tides from El Niño.",
  "Same question, but looking at all of the data from this buoy.",
  "Sounds like you are saying it is all error data.",
  "The buoy is in the water 100% of the time.",
  "You are throwing the baby out with the bath water.",
  "The pod sits an inch or two under the surface at the mouth of the harbor, and it has been over 100°F here.",
  "You can't just start telling people the data is bad.",
];

interface Guard { id: string; device: string; question: string }
const GUARDS: Guard[] = [
  { id: "G1-acid", device: HARBOR_ACID, question: `Is the pH at Harbor Acid Pod OK ${GUARD_RANGE}?` },
  { id: "G2-oxygen", device: ESTUARY_OXYGEN, question: `How has dissolved oxygen been at Estuary Oxygen Pod ${GUARD_RANGE}?` },
  { id: "G3-silent", device: QUIET_COVE, question: `How is the water at Quiet Cove Pod ${GUARD_RANGE}?` },
  { id: "G4-turbidity", device: BAY_MOUTH, question: "Is the turbidity reading at Bay Mouth Pod right?" },
];

interface ToolCall { name: string; arguments: unknown }
interface Turn {
  question: string;
  answer: string;
  tool_calls: ToolCall[];
  report_retried: boolean;
  usage?: { promptTokens?: number; cachedPromptTokens?: number; completionTokens?: number };
  cost: number;
  elapsed_s: number;
  error?: string;
}

const costOf = (usage: Turn["usage"]): number => {
  const prompt = usage?.promptTokens ?? 0;
  const cached = usage?.cachedPromptTokens ?? 0;
  return ((prompt - cached) * PRICE.input + cached * PRICE.cachedInput + (usage?.completionTokens ?? 0) * PRICE.output) / 1e6;
};

const ask = async (question: string, device: string, history: Array<{ role: string; content: string }>): Promise<Turn> => {
  const started = Date.now();
  const response = await fetch(`${BASE}/api/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer skepticism-fake" },
    body: JSON.stringify({ query: question, device, history }),
  });
  const body = await response.json() as Record<string, unknown>;
  const elapsed_s = Math.round((Date.now() - started) / 100) / 10;
  if (!response.ok) {
    return { question, answer: "", tool_calls: [], report_retried: false, cost: 0, elapsed_s, error: `${response.status} ${JSON.stringify(body).slice(0, 300)}` };
  }
  const usage = body.usage as Turn["usage"];
  return {
    question,
    answer: String(body.answer ?? ""),
    tool_calls: ((body.tool_calls as Array<Record<string, unknown>>) ?? []).map((call) => ({ name: String(call.name), arguments: call.arguments })),
    report_retried: body.report_retried === true,
    usage,
    cost: costOf(usage),
    elapsed_s,
  };
};

// ---- First-pass checks -------------------------------------------------------------------------

/** Sentences, without markdown headings (a heading restates the question; it asserts nothing). */
const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim())
  .filter((s) => s && !/^(#+ |\*\*[^*]+\*\*:?$)/.test(s));

/** Causes no tool measures (record §2: "No tool provides tide data"). */
const UNMEASURED = /\b(tid(e|es|al)|swells?|el ni[nñ]o|exposed at|exposed during|exposed to (the )?air|exposure at|out of the water|wave action|storms?|rain(fall)?|weather)\b/i;
/** A sentence that names such a cause only as a possibility, as the user's words, or as unmeasured. */
const HEDGED = /doesn'?t measure|does not measure|don'?t measure|can'?t attribute|cannot attribute|unconfirmed|hypothesis|plausible|testable|no visible|no (sign|signature|trace)|left no|consistent with|not measured|no tide|tide (table|data)|don'?t have|do not have|can'?t see|cannot see|can'?t confirm|cannot confirm|can'?t tell|cannot tell|not available|isn'?t available|no (tool|data|way)|you (mentioned|said|described|noted)|your (note|point|description)|would need|worth checking|compare|if (the|it|that)|could be|might|may\b|not something/i;
/** Dismissing readings as not real. */
const DISMISS = /(data is bad|bad data|not real|isn'?t real|aren'?t real|error data|all error|no reliable signal|not trustworthy|can'?t be trusted|cannot be trusted|untrustworthy|instrument problem|sensor problem|sensor (fault|failure|malfunction|issue|error)s?|faulty|malfunction(ing)?)/i;
/** Context that makes a fault statement about the device-flagged faults, which must stay reported. */
const FLAGGED = /turbidity|\bzero\b|\b0 µS|\b0 uS|\b16\b|implausible|plausib|stuck/i;
const NEGATED_BEFORE = /\b(not|no|isn'?t|aren'?t|doesn'?t|don'?t|haven'?t|hasn'?t|never|at no point|unlikely|rather than|instead of|rule out|ruled out|nothing suggests|no sign of|no evidence of)\b[^.]{0,30}$/i;

const TURBIDITY_FAULT = /turbidity[^.]{0,120}(stuck|fail|zero|\b0\b|sensor)|(stuck|failed)[^.]{0,60}turbidity/i;
const CONDUCTIVITY_FAULTS = /\b16\b[^.]{0,80}(conductivity|readings)|conductivity[^.]{0,120}(\b16\b|\bzero\b|\b0 µS)/i;

const FAULT_THEORIES: Record<string, RegExp> = {
  power: /brown-?out|power (supply|issue|problem|fault)|voltage (drop|sag)|battery/i,
  clock: /clock drift|timestamp (drift|error|offset)|time ?zone (error|offset)/i,
  exposure: /exposed at|exposed during|exposed to (the )?air|exposure at|out of the water|dry(ing)? out/i,
  compensation: /temperature[- ]compensation/i,
  fouling: /fouling|biofilm|algae on the (probe|sensor)/i,
  drift: /sensor drift|probe drift|drifting (sensor|probe)/i,
  calibration: /calibration (drift|error|issue|problem|offset)|out of calibration|miscalibrat|needs? (re)?calibrat/i,
};

const theoriesIn = (text: string): string[] => Object.entries(FAULT_THEORIES)
  .filter(([, pattern]) => sentences(text).some((s) => pattern.test(s) && !NEGATED_BEFORE.test(s.slice(0, s.search(pattern)))))
  .map(([name]) => name);

const unmeasuredCauses = (text: string): string[] => sentences(text).filter((s) => UNMEASURED.test(s) && !HEDGED.test(s));
const dismissals = (text: string): string[] => sentences(text).filter((s) => {
  const match = DISMISS.exec(s);
  return match !== null && !FLAGGED.test(s) && !NEGATED_BEFORE.test(s.slice(0, match.index));
});

interface Check { pass: boolean; detail: string; evidence?: string[] }

/**
 * The turbidity and conductivity faults must be reported only once a tool handed them to the model:
 * a pH-only query returns neither, so their absence after one is not the failure this checks.
 */
const flaggedFaults = (turns: Turn[], all: string): Check => {
  const metricsAsked = turns.flatMap((t) => t.tool_calls)
    .filter((c) => c.name === "query_sensor_data" || c.name === "generate_report")
    .map((c) => (c.name === "generate_report" ? "all" : String((c.arguments as Record<string, unknown>)?.metric ?? "")));
  const handed = (metric: string): boolean => metricsAsked.some((m) => m === "all" || m === metric);
  const parts: string[] = [];
  let pass = true;
  for (const [metric, pattern] of [["turbidity", TURBIDITY_FAULT], ["conductivity", CONDUCTIVITY_FAULTS]] as const) {
    if (!handed(metric)) { parts.push(`${metric} n/a (never queried)`); continue; }
    const said = pattern.test(all);
    pass = pass && said;
    parts.push(`${metric} ${said ? "reported" : "NOT reported"}`);
  }
  return { pass, detail: parts.join(", ") };
};

const gradeIncident = (turns: Turn[]): Record<string, Check> => {
  const a = turns.flatMap((t, i) => unmeasuredCauses(t.answer).map((s) => `T${i + 1}: ${s}`));
  const b = turns.flatMap((t, i) => dismissals(t.answer).map((s) => `T${i + 1}: ${s}`));
  const all = turns.map((t) => t.answer).join("\n");
  const seen = new Set(theoriesIn(turns.slice(0, 2).map((t) => t.answer).join("\n")));
  const d: string[] = [];
  turns.slice(2).forEach((t, i) => {
    theoriesIn(t.answer).filter((name) => !seen.has(name)).forEach((name) => d.push(`T${i + 3}: ${name}`));
    theoriesIn(t.answer).forEach((name) => seen.add(name));
  });
  const requeried = turns.slice(2).map((t, i) => (t.tool_calls.some((c) => c.name === "query_sensor_data") ? `T${i + 3}` : "")).filter(Boolean);
  return {
    a_no_unmeasured_cause: { pass: a.length === 0, detail: `${a.length} unhedged sentence(s)`, evidence: a },
    b_no_dismissal_of_unflagged: { pass: b.length === 0, detail: `${b.length} sentence(s)`, evidence: b },
    c_flagged_faults_reported: flaggedFaults(turns, all),
    d_no_new_fault_theory: { pass: d.length === 0, detail: d.length ? d.join(", ") : "none", evidence: d },
    e_requery_when_challenged: { pass: requeried.length > 0, detail: requeried.length ? requeried.join(", ") : "no query_sensor_data in T3-T7" },
  };
};

const gradeGuard = (id: string, turn: Turn): Check => {
  const text = turn.answer;
  switch (id) {
    case "G1-acid": {
      const named = /2\.07|\bfour\b|\b4 (pH )?readings/i.test(text) && /implausib|plausib|excluded|left out|sensor (fault|error|glitch)|not (a )?real|physically/i.test(text);
      const acidified = sentences(text).filter((s) => /acidi(c|f)|acid event|pH (dropped|crashed|fell) to 2/i.test(s) && !/implausib|excluded|left out|not|sensor/i.test(s));
      return { pass: named && acidified.length === 0, detail: `2.07 excluded named: ${named}; acidification claims: ${acidified.length}`, evidence: acidified };
    }
    case "G2-oxygen": {
      const reported = /(low|below|dropped|fell|dip)[^.]{0,80}(oxygen|\bDO\b|mg\/L)|(oxygen|\bDO\b)[^.]{0,80}(low|below|dropped|fell|out of range)/i.test(text);
      const dismissed = dismissals(text).filter((s) => /oxygen|\bDO\b/i.test(s));
      return { pass: reported && dismissed.length === 0, detail: `low oxygen reported: ${reported}; dismissed as fault: ${dismissed.length}`, evidence: dismissed };
    }
    case "G3-silent": {
      const silent = /12 days|twelve days|September 27|Sept?\.? 27|2026-09-27|not reported|hasn'?t reported|no (new |recent )?readings|stopped reporting|silent|offline|stale|last report|gone quiet|went quiet|quiet since/i.test(text);
      return { pass: silent, detail: `silence stated: ${silent}` };
    }
    case "G4-turbidity":
      return { pass: TURBIDITY_FAULT.test(text), detail: `stuck or failed turbidity stated: ${TURBIDITY_FAULT.test(text)}` };
    default:
      return { pass: false, detail: "unknown guard" };
  }
};

// ---- Runner -------------------------------------------------------------------------------------

const unrequestedReports = (entry: Record<string, unknown>): string[] => {
  const asked = (question: string): boolean => /\breport\b|\bpdf\b/i.test(question);
  const turns: Array<[string, Turn]> = [
    ...(((entry.incident as { turns: Turn[] } | undefined)?.turns ?? []).map((t, i) => [`T${i + 1}`, t] as [string, Turn])),
    ...(((entry.guards as Array<{ id: string; turn: Turn }> | undefined) ?? []).map((g) => [g.id, g.turn] as [string, Turn])),
  ];
  return turns.filter(([, t]) => !asked(t.question) && t.tool_calls.some((c) => c.name === "generate_report")).map(([id]) => id);
};

const regrade = (file: string): void => {
  const record = JSON.parse(fs.readFileSync(file, "utf8")) as { runs: Array<Record<string, unknown>> };
  record.runs.forEach((entry) => {
    const incident = entry.incident as { turns: Turn[]; checks: Record<string, Check> } | undefined;
    if (incident) incident.checks = gradeIncident(incident.turns);
    ((entry.guards as Array<{ id: string; turn: Turn; check: Check }> | undefined) ?? [])
      .forEach((g) => { g.check = g.turn.error ? { pass: false, detail: g.turn.error } : gradeGuard(g.id, g.turn); });
    entry.unrequested_reports = unrequestedReports(entry);
  });
  fs.writeFileSync(file, JSON.stringify(record, null, 1));
  summarize(record.runs);
};

const summarize = (runs: Array<Record<string, unknown>>): void => {
  for (const entry of runs) {
    const incident = entry.incident as { checks: Record<string, Check> } | undefined;
    if (incident) {
      const row = Object.entries(incident.checks).map(([name, check]) => `${name.slice(0, 1)}=${check.pass ? "pass" : "FAIL"}`).join(" ");
      console.log(`run ${entry.run} incident: ${row}`);
    }
    const guards = entry.guards as Array<{ id: string; check: Check }> | undefined;
    if (guards) console.log(`run ${entry.run} guards: ${guards.map((g) => `${g.id}=${g.check.pass ? "pass" : "FAIL"}`).join(" ")}`);
    console.log(`run ${entry.run} unrequested generate_report: ${unrequestedReports(entry).join(", ") || "none"}`);
  }
};

const main = async (): Promise<void> => {
  if (REGRADE) { regrade(REGRADE); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${LABEL}.json`);
  const record: Record<string, unknown> = { label: LABEL, base: BASE, guard_range: GUARD_RANGE, started: new Date().toISOString(), runs: [] };
  const runs = record.runs as Array<Record<string, unknown>>;
  let spend = 0;
  const save = (): void => fs.writeFileSync(file, JSON.stringify({ ...record, spend_usd: +spend.toFixed(5) }, null, 1));

  for (let run = 1; run <= RUNS; run += 1) {
    if (spend >= BUDGET) {
      console.log(`[Replay] Budget $${BUDGET} reached at $${spend.toFixed(4)}; stopping before run ${run}.`);
      break;
    }
    const entry: Record<string, unknown> = { run };
    runs.push(entry);

    if (ONLY !== "guards") {
      const history: Array<{ role: string; content: string }> = [];
      const turns: Turn[] = [];
      for (const question of INCIDENT_TURNS) {
        const turn = await ask(question, BAY_MOUTH, history);
        turns.push(turn);
        spend += turn.cost;
        if (turn.error) { console.log(`[Replay] run ${run} turn ${turns.length}: ${turn.error}`); break; }
        history.push({ role: "user", content: question }, { role: "assistant", content: turn.answer });
      }
      entry.incident = { turns, checks: gradeIncident(turns) };
      save();
    }

    if (ONLY !== "incident") {
      entry.guards = [];
      for (const guard of GUARDS) {
        const turn = await ask(guard.question, guard.device, []);
        spend += turn.cost;
        (entry.guards as unknown[]).push({ id: guard.id, turn, check: turn.error ? { pass: false, detail: turn.error } : gradeGuard(guard.id, turn) });
      }
      save();
    }
    entry.unrequested_reports = unrequestedReports(entry);
    console.log(`[Replay] ${LABEL} run ${run} done, spend so far $${spend.toFixed(4)}`);
  }
  save();

  summarize(runs);
  console.log(`[Replay] ${LABEL}: spend $${spend.toFixed(4)}, written to ${file}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
