/**
 * CLI: generate the frontend's starter prompts from the eval fixture set.
 *
 *   npm run starter:prompts                    # write frontend/starter-prompts.json (3 chips)
 *   npm run starter:prompts -- --sensor        # include the sensor-tool fixtures
 *   npm run starter:prompts -- --per-class=2   # two prompts per class instead of one
 *   npm run starter:prompts -- --limit=6       # a different cap, still cut evenly across classes
 *   npm run starter:prompts -- --limit=0       # no cap at all — every eligible class
 *   npm run starter:prompts -- --out=/tmp/x.json
 *
 * The question set in `eval/fixtures/` is already curated and reviewed, so generating the
 * starter chips from it keeps them in sync for free instead of drifting from a hand-written
 * list. Reads no network and calls no provider — it is a projection of committed JSON.
 *
 * **Three, not ten** (`CHAT_UX_WORKPLAN.md`, "Wave 2 — where things belong"). The chips exist
 * to show what the assistant can do and then get out of the way; enumerating the eval set in
 * front of an empty conversation is the thing users complained about. Because `--limit` is now
 * a real default rather than "no cap", `--per-class=N` needs `--limit=0` (or a larger cap) to
 * show its extra rounds.
 *
 * **Deterministic by construction.** Fixtures are read through `src/eval/fixtures.ts` (which
 * sorts by filename), classes are emitted in a fixed curated order, and within a class fixtures
 * are ordered by question length then id. Nothing samples, and nothing stamps a time — so the
 * same fixtures produce the same bytes and a regeneration diff is reviewable.
 */

import fs from "fs";
import path from "path";
import { availableCapabilities, loadFixtures } from "../src/eval/fixtures";
import { EVAL_CLASSES } from "../src/eval/types";
import type { EvalClass, LoadedFixture } from "../src/eval/types";
import { createLogger } from "../src/utils/logger";

const log = createLogger("StarterPrompts");

/** Repo-root-relative default, so the script works from any cwd. */
const DEFAULT_OUT = path.resolve(__dirname, "../frontend/starter-prompts.json");

/**
 * How many chips the frontend gets by default. `frontend/starter-prompts.json` is the single
 * source of truth for the count — `frontend/js/input.js` renders every entry it finds and
 * caps nothing, so this constant is the only place the number 3 exists.
 */
export const DEFAULT_LIMIT = 3;

/**
 * `refusal` fixtures are excluded from the starter chips.
 *
 * This is a **UX call, not a claim the refusals are wrong** — refusing cleanly is pinned,
 * graded behaviour (`docs/EVAL_FIXTURES.md` §3) and those fixtures stay in the eval set. But a
 * suggested first question the assistant is designed to decline is a bad first impression, so
 * the chips offer questions it can actually answer.
 */
const EXCLUDED_CLASSES: readonly EvalClass[] = ["refusal"];

/**
 * Classes grouped by *what kind of question they are*, and emitted one family at a time.
 *
 * This exists because of the cut to three. `EVAL_CLASSES` order opens with `definitional`,
 * `acronym-exact-token`, `threshold-lookup` — taking the first three would have produced three
 * flavours of the same question (look a fact up in the reference) and made the assistant look
 * like a glossary. Rotating families first means a short list spans visibly different things:
 * define a term, judge a reading, diagnose a symptom.
 *
 * `sensor-combined` leads because with `--sensor` a live reading is the most convincing thing
 * the assistant does; with the flag off its fixtures are not runnable, the group is empty, and
 * the rotation simply skips it, so the default output is unaffected.
 */
export const CLASS_FAMILIES: readonly (readonly EvalClass[])[] = [
  // read the pod — only eligible with --sensor
  ["sensor-combined"],
  // what does this term mean — the reference, read back to you
  ["definitional", "acronym-exact-token", "deep-in-manual"],
  // is this number OK — a reading judged against a threshold or a site range
  ["precedence", "threshold-lookup"],
  // why is my data doing this — a symptom pattern diagnosed
  ["fouling-drift", "event-signature", "follow-up"],
  // what do we do about the hardware — operations, and answers spanning documents
  ["probe-calibration", "cross-document"],
];

export interface StarterPrompt {
  /** The fixture this came from, so a chip can be traced back to its rubric. */
  id: string;
  class: EvalClass;
  /** The fixture's first user turn, verbatim. */
  text: string;
}

export interface StarterPromptsDocument {
  note: string;
  source: string;
  /** Whether the `sensor-tool` fixtures were included. Mirrors the `--sensor` flag. */
  sensorTool: boolean;
  prompts: StarterPrompt[];
}

export interface Options {
  sensor: boolean;
  perClass: number;
  /** 0 means no cap. */
  limit: number;
  out: string;
}

const parseArgs = (argv: string[]): Options => {
  const problems: string[] = [];
  const options: Options = {
    sensor: false, perClass: 1, limit: DEFAULT_LIMIT, out: DEFAULT_OUT,
  };

  argv.forEach((arg) => {
    const [flag, value] = [arg.split("=")[0], arg.split("=").slice(1).join("=")];

    if (flag === "--sensor" && value === "") {
      options.sensor = true;
    } else if ((flag === "--per-class" || flag === "--limit") && value !== "") {
      const parsed = Number(value);
      const min = flag === "--limit" ? 0 : 1;
      if (!Number.isInteger(parsed) || parsed < min) {
        problems.push(`${flag} must be an integer >= ${min}, got "${value}"`);
      } else if (flag === "--limit") {
        options.limit = parsed;
      } else {
        options.perClass = parsed;
      }
    } else if (flag === "--out" && value !== "") {
      options.out = path.resolve(value);
    } else {
      problems.push(`unrecognized argument "${arg}"`);
    }
  });

  if (problems.length > 0) {
    throw new Error(`Bad arguments:\n  - ${problems.join("\n  - ")}`);
  }

  return options;
};

/**
 * The fixtures a chip may be generated from: runnable, and not in an excluded class.
 *
 * `runnable` is what drops the `sensor-tool` fixtures. The loader computes it against the
 * capability list it is given, and `selectStarterPrompts` derives that list from the `--sensor`
 * flag rather than the ambient `SENSOR_TOOL` config — so the output depends only on the
 * fixtures and the arguments, never on whoever's `.env` happens to be loaded. Off by default
 * because `SENSOR_TOOL` is off by default, and those two questions fail outright without it; a
 * starter chip that cannot work in a fresh checkout is worse than no chip.
 */
export const eligibleFixtures = (fixtures: LoadedFixture[]): LoadedFixture[] => fixtures
  .filter((fixture) => fixture.runnable && !EXCLUDED_CLASSES.includes(fixture.class));

/**
 * The class rotation: one class from each family in turn, families in `CLASS_FAMILIES` order.
 * A class that gains a family later still appears — anything `EVAL_CLASSES` declares but no
 * family claims is appended rather than silently dropped from the chips.
 */
export const starterClassOrder = (): EvalClass[] => {
  const ordered: EvalClass[] = [];
  const rounds = Math.max(...CLASS_FAMILIES.map((family) => family.length));

  for (let round = 0; round < rounds; round += 1) {
    CLASS_FAMILIES.forEach((family) => {
      const evalClass = family[round];
      if (evalClass !== undefined && !ordered.includes(evalClass)) ordered.push(evalClass);
    });
  }
  EVAL_CLASSES.forEach((evalClass) => {
    if (!ordered.includes(evalClass)) ordered.push(evalClass);
  });

  return ordered;
};

/**
 * Shortest question first, id as the tiebreak.
 *
 * A chip has to fit one or two lines next to two others, so among equally good fixtures in a
 * class the brief one wins. `id` keeps the order total, so the sort stays deterministic even
 * if two questions are the same length.
 */
const byBrevityThenId = (a: LoadedFixture, b: LoadedFixture): number => (
  a.turns[0].content.length - b.turns[0].content.length || a.id.localeCompare(b.id)
);

/**
 * One list, spread across classes: round-robin over the classes in `starterClassOrder()`,
 * taking up to `perClass` fixtures from each. A `limit` then cuts evenly rather than lopping
 * off the tail classes, so a short list still samples the breadth of what the assistant can
 * answer — and because the rotation is family-first, the first three are three different
 * kinds of question rather than three lookups.
 */
export const spreadAcrossClasses = (
  fixtures: LoadedFixture[],
  perClass: number,
  limit: number,
): LoadedFixture[] => {
  const byClass = starterClassOrder().map((evalClass) => fixtures
    .filter((fixture) => fixture.class === evalClass)
    .sort(byBrevityThenId));

  const picked: LoadedFixture[] = [];
  for (let round = 0; round < perClass; round += 1) {
    byClass.forEach((group) => {
      if (group[round]) picked.push(group[round]);
    });
  }

  return limit > 0 ? picked.slice(0, limit) : picked;
};

/** Loads, filters and orders the fixtures, then projects each one's first user turn. */
export const selectStarterPrompts = (
  options: Pick<Options, "sensor"> & Partial<Pick<Options, "perClass" | "limit">>,
): StarterPrompt[] => {
  const fixtures = loadFixtures(undefined, availableCapabilities(options.sensor));
  const chosen = spreadAcrossClasses(
    eligibleFixtures(fixtures),
    options.perClass ?? 1,
    options.limit ?? DEFAULT_LIMIT,
  );

  return chosen.map((fixture) => ({
    id: fixture.id,
    class: fixture.class,
    text: fixture.turns[0].content,
  }));
};

/** The exact bytes written to disk. Kept pure so a test can compare two runs. */
export const renderDocument = (prompts: StarterPrompt[], sensor: boolean): string => {
  const document: StarterPromptsDocument = {
    note: "Generated by `npm run starter:prompts` from eval/fixtures. Do not edit by hand.",
    source: "eval/fixtures",
    sensorTool: sensor,
    prompts,
  };
  return `${JSON.stringify(document, null, 2)}\n`;
};

const main = (): void => {
  const options = parseArgs(process.argv.slice(2));
  const prompts = selectStarterPrompts(options);

  if (prompts.length === 0) {
    throw new Error("No eligible fixtures — refusing to write an empty starter-prompts.json.");
  }

  fs.writeFileSync(options.out, renderDocument(prompts, options.sensor), "utf8");

  const classes = [...new Set(prompts.map((prompt) => prompt.class))];
  log.info(`Wrote ${prompts.length} prompt(s) from ${classes.length} class(es) -> ${options.out}`);
  log.info(`sensor-tool fixtures: ${options.sensor ? "included (--sensor)" : "excluded"}`);
  prompts.forEach((prompt) => log.info(`  [${prompt.class}] ${prompt.text}`));
};

// Guarded so the selection can be unit-tested by importing this module without writing a file.
if (require.main === module) {
  try {
    main();
  } catch (error: unknown) {
    log.error("Starter prompt generation failed", error instanceof Error ? error : undefined);
    process.exitCode = 1;
  }
}
