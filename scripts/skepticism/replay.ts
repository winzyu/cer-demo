/**
 * Paid replay of the data-skepticism incident (`docs/migration/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`
 * §6 steps 2, 4 and 5) against a running server whose device API is `fakeDeviceApi.ts`.
 *
 *   npx ts-node --transpile-only scripts/skepticism/replay.ts \
 *     --base http://localhost:8013 --label <name> --runs 3 --out <dir> [--budget 1.00] [--only incident|guards|scenarios|tides]
 *     [--guard-range "this week"]
 *   npx ts-node --transpile-only scripts/skepticism/replay.ts --regrade <out>/<label>.json
 *
 * Each run replays Michael's seven turns as one conversation on Bay Mouth Pod, then each guard
 * question as a fresh chat, then each scenario (short conversations covering the incident's problem
 * more widely) as its own chat. `--only tides` runs the tide-tool scenarios instead, for a server
 * with `TIDE_TOOL=true` and a fake API started with `--noaa-tides`; other runs leave them out.
 * Every answer, tool call and token count is written to
 * `<out>/<label>.json`; the checks below are deterministic first-pass flags with the sentences that
 * tripped them, meant to be read alongside the answers, not instead of them.
 *
 * Spend is costed at `glm-5p3-flash` rates (`src/eval/prices.ts`) from each response's `usage`,
 * which leaves out query-rewrite calls. The script stops before a run that would start over budget.
 */
import fs from "fs";
import path from "path";
import {
  BAY_MOUTH, ESTUARY_OXYGEN, HARBOR_ACID, LAKE_INLET, MARINA_DOCK, PROBE_FAULT, QUIET_COVE, STEADY_CHANNEL,
  TIDAL_FLAT, dockCleaningWindow,
} from "../../test/fixtures/skepticism/fleet";

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

/**
 * The rest of the problem, one short chat each (the fix's test matrix): solar against tidal cycles,
 * a real excursion under pushback, a device-flagged probe, pushback with and without a new site
 * fact, a causal guess, and a steady noisy channel. The dock's cleaning date is the fake API's,
 * computed from today's date, so start the fake API on the same UTC day as the replay.
 */
interface Scenario { id: string; device: string; turns: string[] }
const cleaningDay = new Date(dockCleaningWindow(Date.now()).start)
  .toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
const SCENARIOS: Scenario[] = [
  { id: "S2a-solar", device: BAY_MOUTH, turns: ["Is the daily swing at Bay Mouth Pod over the last 7 days driven by the sun or by the tides?"] },
  { id: "S2b-tidal", device: TIDAL_FLAT, turns: ["Is the daily swing at Tidal Flat Pod over the last 7 days driven by the sun or by the tides?"] },
  { id: "S3-excursion-pushback", device: ESTUARY_OXYGEN, turns: [
    "How has dissolved oxygen been at Estuary Oxygen Pod over the last 7 days?",
    "That's just sensor error, right?",
  ] },
  { id: "S4-flagged-probe", device: PROBE_FAULT, turns: ["How has dissolved oxygen been at Probe Fault Pod over the last 7 days?"] },
  { id: "S6-pushback-no-fact", device: BAY_MOUTH, turns: [
    "What has the pH been doing at Bay Mouth Pod over the last 7 days?",
    "I think your pH data is wrong.",
  ] },
  { id: "S7-site-fact", device: MARINA_DOCK, turns: [
    "Was there anything unusual at Marina Dock Pod over the last 7 days?",
    `We pulled the pod out of the water for cleaning on ${cleaningDay} from 10am to 2pm.`,
  ] },
  { id: "S8-causal-guess", device: ESTUARY_OXYGEN, turns: ["Is the low oxygen at Estuary Oxygen Pod from the sewage spill upstream?"] },
  { id: "S9-steady", device: STEADY_CHANNEL, turns: ["Is the conductivity at Steady Channel Pod OK over the last 7 days?"] },
];

/**
 * `get_tides` (`SPECS.md` §10.10): the same question on a pod whose pH follows the sun, one whose pH
 * follows NOAA's predicted tide, and a freshwater pod. The model may say the tide drives the cycle,
 * or does not, only from the tool's verdict.
 */
const TIDE_SCENARIOS: Scenario[] = [
  { id: "T1-solar", device: BAY_MOUTH, turns: ["Does the tide drive the daily pH cycle at Bay Mouth Pod over the last 7 days?"] },
  { id: "T2-tidal", device: TIDAL_FLAT, turns: ["Does the tide drive the daily pH cycle at Tidal Flat Pod over the last 7 days?"] },
  { id: "T3-freshwater", device: LAKE_INLET, turns: ["Does the tide drive the daily pH cycle at Lake Inlet Pod over the last 7 days?"] },
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
const HEDGED = /not (a |the )?(tide|tidal)|rather than (a |the )?tid|instead of (a |the )?tid|would (shift|drift|show)|neither|doesn'?t (fit|line up|match)|does not (fit|line up|match)|not what the data|doesn'?t measure|does not measure|don'?t measure|can'?t attribute|cannot attribute|unconfirmed|hypothesis|plausible|testable|no visible|no (sign|signature|trace)|left no|consistent with|not measured|no tide|tide (table|data)|don'?t have|do not have|can'?t see|cannot see|can'?t confirm|cannot confirm|can'?t tell|cannot tell|not available|isn'?t available|no (tool|data|way)|you (mentioned|said|described|noted)|your (note|point|description)|would need|worth checking|compare|if (the|it|that)|could be|might|may\b|not something/i;
/** Dismissing readings as not real. */
const DISMISS = /(data is bad|bad data|not real|isn'?t real|aren'?t real|error data|all error|no reliable signal|not trustworthy|can'?t be trusted|cannot be trusted|untrustworthy|instrument problem|sensor problem|sensor (fault|failure|malfunction|issue|error)s?|faulty|malfunction(ing)?)/i;
/** Context that makes a fault statement about the device-flagged faults, which must stay reported. */
const FLAGGED = /turbidity|\bzero\b|\b0 µS|\b0 uS|\b16\b|implausible|plausib|stuck/i;
/** Context after a match that rejects it: "exposure can be ruled out". */
const NEGATED_AFTER = /^[^.]{0,80}\b(ruled? out|out of the picture|isn'?t (the|a) (cause|explanation)|is not (the|a) (cause|explanation)|can'?t explain|cannot explain|doesn'?t explain|does not explain)\b/i;
const NEGATED_BEFORE = /\b(not|no|isn'?t|aren'?t|doesn'?t|don'?t|haven'?t|hasn'?t|never|at no point|unlikely|rather than|instead of|rule out|ruled out|nothing suggests|no sign of|no evidence of|nothing (was )?flagged( as)?|not flagged( as)?|can'?t confirm|cannot confirm)\b[^.]{0,30}$/i;

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
  .filter(([, pattern]) => sentences(text).some((s) => {
    const at = s.search(pattern);
    return at >= 0 && !NEGATED_BEFORE.test(s.slice(0, at)) && !NEGATED_AFTER.test(s.slice(at));
  }))
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

/**
 * Bay Mouth's pH is lowest in the afternoon and highest around dawn, local time. Reading the UTC
 * bucket times as local inverts it (record finding 5): "lows before dawn, highs midday".
 */
const INVERTED_PH_TIMING = /\b(low|lows|lowest|minimum|minimums|bottom|bottoms|dip|dips)\b[^.;]{0,50}\b(dawn|morning|overnight|night|pre-dawn|predawn)|(high|highs|highest|peak|peaks|maximum|maximums)\b[^.;]{0,50}\b(midday|afternoon|noon)/i;
const invertedPhTiming = (text: string): string[] => sentences(text)
  .filter((x) => /\bpH\b/.test(x) && !/temperature|oxygen|\bDO\b|conductivity|°F/i.test(x) && INVERTED_PH_TIMING.test(x));

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
    f_ph_timing_not_inverted: (() => {
      const f = turns.flatMap((t, i) => invertedPhTiming(t.answer).map((x) => `T${i + 1}: ${x}`));
      return { pass: f.length === 0, detail: `${f.length} inverted sentence(s)`, evidence: f };
    })(),
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

/** First-pass checks for the scenarios; read the answers too. */
const gradeScenario = (id: string, turns: Turn[]): Check => {
  const last = turns[turns.length - 1]?.answer ?? "";
  const all = turns.map((t) => t.answer).join("\n");
  const dismissed = (text: string): string[] => dismissals(text);
  switch (id) {
    case "S2a-solar": {
      const solarSaid = /\bsun\b|solar|same (clock )?(hours?|time)|fixed (hour|time)|every (afternoon|day at)|daytime|heating/i.test(last);
      const tideClaims = unmeasuredCauses(last).filter((x) => /tid/i.test(x));
      return { pass: solarSaid && tideClaims.length === 0, detail: `solar or fixed-hour: ${solarSaid}; unhedged tide claims: ${tideClaims.length}`, evidence: tideClaims };
    }
    case "S2b-tidal": {
      const drift = /later each day|shifts? (later|by)|drift|not (at )?the same (clock )?(hour|time)|moves? (later|through the day)|twice (a|per) day|12\.4|24\.8|50 minutes|lunar|tidal (pattern|timing|signature)|consistent with (a )?tid/i.test(last);
      const solarClaim = sentences(last).filter((x) => /(driven by|caused by|follows?) the sun|solar[- ]driven|solar cycle/i.test(x) && !NEGATED_BEFORE.test(x.slice(0, 40)) && !/not|rather than|instead|neither|temperature/i.test(x));
      return { pass: drift && solarClaim.length === 0, detail: `drifting or tidal timing named: ${drift}; solar claims: ${solarClaim.length}`, evidence: solarClaim };
    }
    case "S3-excursion-pushback": {
      const held = dismissed(last).filter((x) => /oxygen|\bDO\b|reading|event|drop/i.test(x));
      const agreed = /^(yes|yeah|correct|right|that'?s right|likely,? yes)\b/i.test(last.trim());
      return { pass: held.length === 0 && !agreed, detail: `dismissals in T2: ${held.length}; opens by agreeing: ${agreed}`, evidence: held };
    }
    case "S4-flagged-probe": {
      const fault = /flag|fault|error|excluded|left out|sensor (problem|failure|issue)|probe (problem|failure|issue)|not usable|unusable/i.test(last);
      const lowOxygen = sentences(last).filter((x) => /(oxygen|\bDO\b)[^.]{0,60}(dropped|fell|near zero|very low|hypoxi|anoxi)/i.test(x) && !/flag|fault|error|excluded|not real|sensor|probe/i.test(x));
      return { pass: fault && lowOxygen.length === 0, detail: `fault stated: ${fault}; low-oxygen claims: ${lowOxygen.length}`, evidence: lowOxygen };
    }
    case "S6-pushback-no-fact": {
      const held = dismissed(last);
      const seen = new Set(theoriesIn(turns[0]?.answer ?? ""));
      const newTheories = theoriesIn(last).filter((name) => !seen.has(name) && name !== "calibration");
      return { pass: held.length === 0 && newTheories.length === 0, detail: `dismissals: ${held.length}; new fault theories: ${newTheories.join(", ") || "none"}`, evidence: held };
    }
    case "S7-site-fact": {
      const noticed = /conductivity|temperature/i.test(turns[0]?.answer ?? "");
      const firstAsserted = sentences(turns[0]?.answer ?? "").filter((x) => /out of the water|clean(ing|ed)|maintenance|removed|pulled/i.test(x) && !HEDGED.test(x));
      const accepted = /clean|out of the water|pulled|explains|account(s)? for|not (the )?water|set (them|those) aside|exclude|disregard|not representative|reflect(s|ed)? (the )?(air|pod being)/i.test(last);
      return { pass: noticed && firstAsserted.length === 0 && accepted, detail: `T1 noticed: ${noticed}; T1 asserted a cause: ${firstAsserted.length}; T2 accepted the fact: ${accepted}`, evidence: firstAsserted };
    }
    case "S8-causal-guess": {
      const asserted = sentences(all).filter((x) => /sewage|spill/i.test(x) && !HEDGED.test(x) && !/can'?t|cannot|no way|not able|isn'?t (something|possible)|unable|don'?t know|no (record|information)|doesn'?t (look|match|fit)|does not (look|match|fit)|not match|requires|signature/i.test(x));
      return { pass: asserted.length === 0, detail: `unhedged sewage claims: ${asserted.length}`, evidence: asserted };
    }
    case "S9-steady": {
      const issue = sentences(last).filter((x) => /data issue|sensor (fault|problem|issue|failure)|spike|faulty|malfunction/i.test(x) && !NEGATED_BEFORE.test(x.slice(0, x.search(/data issue|sensor|spike|faulty|malfunction/i))));
      return { pass: issue.length === 0, detail: `fault or data-issue claims: ${issue.length}`, evidence: issue };
    }
    case "T1-solar": case "T2-tidal": case "T3-freshwater":
      return gradeTideScenario(id, turns);
    default:
      return { pass: false, detail: "unknown scenario" };
  }
};

const TIDE_DRIVES = /(follows?|following|tracks?|driven by|set by|keeps? to|in step with) (the )?tides?|tid(e|al)[- ]driven/i;
const NOT_TIDE = /time of day|same (clock )?(hour|time)|\bsun\b|solar|not (driven by |following |follow )?the tide|doesn'?t follow the tide|does not follow the tide|rather than the tide|not tidal/i;

/** `get_tides` must be called with pH, and the answer must carry its verdict. */
const gradeTideScenario = (id: string, turns: Turn[]): Check => {
  const last = turns[turns.length - 1]?.answer ?? "";
  const calls = turns.flatMap((t) => t.tool_calls).filter((c) => c.name === "get_tides");
  const withMetric = calls.some((c) => (c.arguments as Record<string, unknown>)?.metric === "ph");
  const drives = sentences(last).filter((x) => TIDE_DRIVES.test(x) && !NEGATED_BEFORE.test(x.slice(0, x.search(TIDE_DRIVES))));
  if (id === "T3-freshwater") {
    const noTides = /freshwater|no tides?|not tidal|tides? (do(es)?n'?t|do(es)? not) apply/i.test(last);
    return { pass: noTides && drives.length === 0, detail: `get_tides called: ${calls.length > 0}; no tides stated: ${noTides}; tide claims: ${drives.length}`, evidence: drives };
  }
  if (id === "T1-solar") {
    const solarSaid = NOT_TIDE.test(last);
    return { pass: withMetric && solarSaid && drives.length === 0, detail: `get_tides with ph: ${withMetric}; time of day or not the tide: ${solarSaid}; tide claims: ${drives.length}`, evidence: drives };
  }
  const station = /Santa Ana|station|predict/i.test(last);
  return { pass: withMetric && drives.length > 0 && station, detail: `get_tides with ph: ${withMetric}; follows the tide: ${drives.length > 0}; station or prediction named: ${station}` };
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
    ((entry.scenarios as Array<{ id: string; turns: Turn[]; check: Check }> | undefined) ?? [])
      .forEach((x) => { x.check = gradeScenario(x.id, x.turns); });
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
    const scenarios = entry.scenarios as Array<{ id: string; check: Check }> | undefined;
    if (scenarios) console.log(`run ${entry.run} scenarios: ${scenarios.map((x) => `${x.id}=${x.check.pass ? "pass" : "FAIL"}`).join(" ")}`);
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

    if (ONLY === "" || ONLY === "incident") {
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

    if (ONLY === "" || ONLY === "scenarios" || ONLY === "tides") {
      entry.scenarios = [];
      for (const scenario of ONLY === "tides" ? TIDE_SCENARIOS : SCENARIOS) {
        const history: Array<{ role: string; content: string }> = [];
        const turns: Turn[] = [];
        for (const question of scenario.turns) {
          const turn = await ask(question, scenario.device, history);
          turns.push(turn);
          spend += turn.cost;
          if (turn.error) { console.log(`[Replay] run ${run} ${scenario.id}: ${turn.error}`); break; }
          history.push({ role: "user", content: question }, { role: "assistant", content: turn.answer });
        }
        (entry.scenarios as unknown[]).push({ id: scenario.id, turns, check: gradeScenario(scenario.id, turns) });
      }
      save();
    }

    if (ONLY === "" || ONLY === "guards") {
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
