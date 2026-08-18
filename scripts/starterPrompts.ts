/**
 * CLI: generate the frontend's starter prompts from the eval fixture set.
 *
 *   npm run starter:prompts                    # write frontend/starter-prompts.json
 *   npm run starter:prompts -- --sensor        # include the sensor-tool fixtures
 *   npm run starter:prompts -- --per-class=2   # two prompts per class instead of one
 *   npm run starter:prompts -- --limit=6       # cap the list, cutting evenly across classes
 *   npm run starter:prompts -- --out=/tmp/x.json
 *
 * The question set in `eval/fixtures/` is already curated and reviewed, so generating the
 * starter chips from it keeps them in sync for free instead of drifting from a hand-written
 * list. Reads no network and calls no provider — it is a projection of committed JSON.
 *
 * **Deterministic by construction.** Fixtures are read through `src/eval/fixtures.ts` (which
 * sorts by filename), classes are emitted in the curated `EVAL_CLASSES` order, and within a
 * class fixtures are ordered by id. Nothing samples, and nothing stamps a time — so the same
 * fixtures produce the same bytes and a regeneration diff is reviewable.
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
 * `refusal` fixtures are excluded from the starter chips.
 *
 * This is a **UX call, not a claim the refusals are wrong** — refusing cleanly is pinned,
 * graded behaviour (`docs/EVAL_FIXTURES.md` §3) and those fixtures stay in the eval set. But a
 * suggested first question the assistant is designed to decline is a bad first impression, so
 * the chips offer questions it can actually answer.
 */
const EXCLUDED_CLASSES: readonly EvalClass[] = ["refusal"];

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
    sensor: false, perClass: 1, limit: 0, out: DEFAULT_OUT,
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
 * One list, spread across classes: round-robin over the classes in their curated order, taking
 * up to `perClass` fixtures from each. A `limit` then cuts evenly rather than lopping off the
 * tail classes, so a short list still samples the breadth of what the assistant can answer.
 */
export const spreadAcrossClasses = (
  fixtures: LoadedFixture[],
  perClass: number,
  limit: number,
): LoadedFixture[] => {
  const byClass = EVAL_CLASSES.map((evalClass) => fixtures
    .filter((fixture) => fixture.class === evalClass)
    .sort((a, b) => a.id.localeCompare(b.id)));

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
    options.limit ?? 0,
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
