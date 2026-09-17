import type { LabelledQuery } from "./retrieval/types";
import type { EvalPass } from "./transcript";

/**
 * Argument parsing for `npm run bakeoff`. Hand-rolled, matching the config loader's approach
 * (conventions §8 — no schema library), and split out from the script so it is testable.
 */

export interface BakeoffArgs {
  arm: string;
  pass: EvalPass;
  baseUrl: string;
  transport: "sse" | "json";
  outDir: string;
  /** Ask three probe questions and print the returned context, without writing transcripts. */
  spotCheck: boolean;
  /** Replay a single fixture by id — for debugging a rubric, never for a real sweep. */
  only?: string;
  /** Go through the motions without calling the service. */
  dryRun: boolean;
}

export const USAGE = `
Usage: npm run bakeoff -- --arm=<mode> --pass=<cold|warm> [options]

  --arm=<mode>        Retrieval arm to replay (required). Requires DEBUG_RETRIEVAL=true
                      on the server, or the override is silently ignored.
  --pass=<cold|warm>  Which pass this is (required). Never blend the two.
  --base-url=<url>    Service base URL (default http://localhost:8000/api/v1)
  --transport=<t>     sse (default, gives TTFT) or json (no TTFT, simpler)
  --out=<dir>         Transcript root (default eval/transcripts)
  --only=<fixture-id> Replay one fixture. Debugging only — not a sweep.
  --spot-check        Probe the arm with three questions and print the context. Run this
                      before every sweep: an adapter returning empty context produces a
                      clean-looking, completely meaningless dataset.
  --dry-run           Resolve fixtures and print the plan without calling the service.
`.trim();

const PASSES: EvalPass[] = ["cold", "warm"];
const TRANSPORTS = ["sse", "json"] as const;

const valueOf = (argv: string[], name: string): string | undefined => {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit?.slice(prefix.length).trim() || undefined;
};

const hasFlag = (argv: string[], name: string): boolean => argv.includes(`--${name}`);

/** Collects every problem before throwing, so one run surfaces all the typos rather than one. */
export const parseArgs = (argv: string[]): BakeoffArgs => {
  const errors: string[] = [];

  const arm = valueOf(argv, "arm");
  if (!arm) errors.push("--arm is required.");

  const pass = valueOf(argv, "pass") as EvalPass | undefined;
  const spotCheck = hasFlag(argv, "spot-check");
  // A spot check writes nothing, so it has no pass to belong to.
  if (!spotCheck && !pass) errors.push("--pass is required (cold or warm).");
  if (pass && !PASSES.includes(pass)) {
    errors.push(`--pass must be one of [${PASSES.join(", ")}] (got "${pass}").`);
  }

  const transport = (valueOf(argv, "transport") ?? "sse") as BakeoffArgs["transport"];
  if (!TRANSPORTS.includes(transport)) {
    errors.push(`--transport must be one of [${TRANSPORTS.join(", ")}] (got "${transport}").`);
  }

  if (errors.length > 0) {
    throw new Error(`${errors.join("\n")}\n\n${USAGE}`);
  }

  return {
    arm: arm as string,
    pass: pass ?? "cold",
    baseUrl: valueOf(argv, "base-url") ?? "http://localhost:8000/api/v1",
    transport,
    outDir: valueOf(argv, "out") ?? "eval/transcripts",
    spotCheck,
    only: valueOf(argv, "only"),
    dryRun: hasFlag(argv, "dry-run"),
  };
};

/**
 * Three probes for `--spot-check`, chosen to fail loudly rather than plausibly: one whose answer
 * is in the direct-feed slice, one only in the long manuals, and one that must be refused. An
 * adapter returning empty or wrong context looks obviously broken across these three.
 */
export const SPOT_CHECK_QUERIES = [
  "What is ORP and what unit is it measured in?",
  "What stabilization criteria should a sonde reading meet before it is recorded?",
  "What is the fecal coliform count right now?",
];

/** The arm that looks context up by verbatim labelled query, so it answers labelled turns only. */
export const GOLD_CONTEXT_ARM = "gold-context";

/**
 * The classes the gold-context spot check draws from: an answer deep in one manual, one that spans
 * documents, and a calibration question. Refusal turns are left out on purpose -- they are labelled
 * with no chunks, so on a healthy arm they would still trip the empty-context warning.
 */
const GOLD_CONTEXT_SPOT_CHECK_CLASSES = ["deep-in-manual", "cross-document", "probe-calibration"];

/**
 * The probe questions for `--spot-check` on `arm`.
 *
 * `SPOT_CHECK_QUERIES` cannot probe the gold-context arm: it has no label for them and throws on
 * any query it has none for, which would turn the "spot-check first, always" step into an error.
 * That arm is probed with real labelled turns instead, picked deterministically (first fixture id,
 * then first turn) so two spot checks of the same label set ask the same three questions.
 */
export const spotCheckQueriesFor = (
  arm: string,
  labelled: ReadonlyArray<{ fixtureId: string; fixtureClass: string; label: LabelledQuery }>,
): string[] => {
  if (arm !== GOLD_CONTEXT_ARM) {
    return [...SPOT_CHECK_QUERIES];
  }
  return GOLD_CONTEXT_SPOT_CHECK_CLASSES.map((fixtureClass) => {
    const [first] = labelled
      .filter((entry) => entry.fixtureClass === fixtureClass && entry.label.relevant.length > 0)
      .sort((a, b) => a.fixtureId.localeCompare(b.fixtureId) || a.label.turn - b.label.turn);
    if (first === undefined) {
      throw new Error(`No labelled ${fixtureClass} turn to spot-check the ${GOLD_CONTEXT_ARM} arm with.`);
    }
    return first.label.query;
  });
};
