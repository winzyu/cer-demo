/**
 * CLI: price the bake-off arms and print the break-even curve (`RETRIEVAL_BAKEOFF.md` §1).
 *
 *   npm run cost
 *   npm run cost -- --model=accounts/fireworks/models/gpt-oss-120b
 *   npm run cost -- --cache-rate=0
 *
 * Reads no network and calls no provider — it is arithmetic over the recorded price sheet
 * (`src/eval/prices.ts`) and the recorded token measurements (`src/eval/costScenarios.ts`), so it
 * can be re-run by anyone auditing the ◆G7 decision without spending anything.
 */
import {
  breakEven, costCurve, monthlyCost, perRequestCost,
} from "../src/eval/cost";
import {
  COMPLETION_TOKEN_CASES, CURVE_VOLUMES, PROJECTED_ARMS, TOKEN_PROVENANCE, TOKEN_SOURCE,
  scenarioArms,
} from "../src/eval/costScenarios";
import {
  CHAT_PRICES, PRICES_OLDEST_READ_ON, PRICES_READ_ON, PRICE_SOURCES,
} from "../src/eval/prices";
import { createLogger } from "../src/utils/logger";

const log = createLogger("Cost");

const DEFAULT_MODEL = "accounts/fireworks/models/gpt-oss-20b";
const DEFAULT_CACHE_RATE = 0.996;

interface Options {
  model: string;
  cacheRate: number;
}

const parseArgs = (argv: string[]): Options => {
  const problems: string[] = [];
  let model = DEFAULT_MODEL;
  let cacheRate = DEFAULT_CACHE_RATE;

  argv.forEach((arg) => {
    const [flag, value] = arg.split("=", 2);

    if (flag === "--model" && value) {
      model = value;
    } else if (flag === "--cache-rate" && value !== undefined) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        problems.push(`--cache-rate must be between 0 and 1, got "${value}"`);
      } else {
        cacheRate = parsed;
      }
    } else {
      problems.push(`unrecognized argument "${arg}"`);
    }
  });

  if (problems.length > 0) {
    throw new Error(`Bad arguments:\n  - ${problems.join("\n  - ")}`);
  }

  return { model, cacheRate };
};

const usd = (value: number, places = 2): string => `$${value.toFixed(places)}`;
const pad = (value: string, width: number): string => value.padEnd(width);
const padLeft = (value: string, width: number): string => value.padStart(width);

const main = (): void => {
  const options = parseArgs(process.argv.slice(2));

  // Every source dated separately, oldest first: the sheet is only as fresh as its stalest line,
  // and a reader auditing a cost figure needs to know which line that is.
  log.info(`Price sheet — oldest read ${PRICES_OLDEST_READ_ON}:`);
  (Object.keys(PRICE_SOURCES) as (keyof typeof PRICE_SOURCES)[]).forEach((source) => {
    log.info(`  ${pad(source, 22)}read ${PRICES_READ_ON[source]} — ${PRICE_SOURCES[source]}`);
  });
  log.info(`Token counts: ${TOKEN_PROVENANCE.toUpperCase()} — ${TOKEN_SOURCE}`);
  log.info(`Model: ${options.model}`);

  const prices = CHAT_PRICES[options.model];
  if (prices) {
    const discount = ((prices.input - prices.cachedInput) / prices.input) * 100;
    log.info(
      `  input ${usd(prices.input, 3)}/1M · cached ${usd(prices.cachedInput, 3)}/1M `
      + `(${discount.toFixed(1)}% off) · output ${usd(prices.output, 3)}/1M`,
    );
  }

  COMPLETION_TOKEN_CASES.forEach((completionTokens) => {
    const arms = scenarioArms({
      completionTokens,
      chatModel: options.model,
      sliceCacheRate: options.cacheRate,
    });

    log.info("");
    log.info(`===== ${completionTokens} completion tokens, slice cache ${(options.cacheRate * 100).toFixed(1)}% =====`);
    log.info(`${pad("arm", 22)}${padLeft("uncached in", 13)}${padLeft("cached in", 12)}${padLeft("output", 11)}${padLeft("per answer", 13)}`);

    arms.forEach((arm) => {
      const cost = perRequestCost(arm);
      const marker = (PROJECTED_ARMS as readonly string[]).includes(arm.arm) ? " *" : "";
      log.info(
        pad(arm.arm + marker, 22)
        + padLeft(usd(cost.inputUsd, 6), 13)
        + padLeft(usd(cost.cachedInputUsd, 6), 12)
        + padLeft(usd(cost.outputUsd, 6), 11)
        + padLeft(usd(cost.totalUsd, 6), 13),
      );
    });

    log.info("");
    log.info("Monthly total (marginal × volume + fixed):");
    // 21, not 19: "hybrid-slice-lexvec" is exactly 19 characters, so the old width left no gap
    // and the header ran its columns together.
    log.info(pad("requests/mo", 14) + arms.map((a) => padLeft(a.arm, 21)).join(""));

    costCurve(arms, CURVE_VOLUMES).forEach((row) => {
      log.info(
        pad(row.requestsPerMonth.toLocaleString(), 14)
        + arms.map((a) => padLeft(usd(row.byArm[a.arm]), 21)).join(""),
      );
    });

    log.info("");
    arms.forEach((left, index) => {
      arms.slice(index + 1).forEach((right) => {
        const result = breakEven(left, right);
        if (result.kind === "crossover") {
          log.info(
            `  ${left.arm} vs ${right.arm}: cross at `
            + `${Math.round(result.requestsPerMonth).toLocaleString()} requests/month `
            + `(${result.cheaperBelow} cheaper below, ${result.cheaperAbove} above)`,
          );
        } else if (result.kind === "dominated") {
          log.info(`  ${left.arm} vs ${right.arm}: ${result.cheaper} cheaper at EVERY volume`);
        } else {
          log.info(`  ${left.arm} vs ${right.arm}: identical cost at every volume`);
        }
      });
    });

    const fixedNotes = arms.filter((a) => (a.fixed?.usdPerMonth ?? 0) > 0);
    if (fixedNotes.length > 0) {
      log.info("");
      fixedNotes.forEach((a) => log.info(`  fixed — ${a.arm}: ${usd(a.fixed?.usdPerMonth ?? 0)}/mo (${a.fixed?.note})`));
    }
  });

  log.info("");
  // Only printed when something is actually marked. Leaving the legend unconditional would keep
  // telling the reader an arm is projected after the sweep had measured every one of them.
  if (PROJECTED_ARMS.length > 0) {
    log.info("* projected — arm not yet built; token profile borrowed from pgvector-rag.");
  }

  if (TOKEN_PROVENANCE !== "measured") {
    log.warn("Token counts are spot-check figures, not sweep means. Do not publish these as final.");
  }

  // Sanity anchor for the reader: the single number the whole phase turns on.
  const atCeiling = scenarioArms({
    completionTokens: COMPLETION_TOKEN_CASES[0],
    chatModel: options.model,
    sliceCacheRate: options.cacheRate,
  }).map((arm) => `${arm.arm} ${usd(monthlyCost(arm, 100_000))}`);
  log.info("");
  log.info(`At the 100k/month ceiling (${COMPLETION_TOKEN_CASES[0]} completion tokens): ${atCeiling.join(" · ")}`);
};

try {
  main();
} catch (error: unknown) {
  log.error("Cost model failed", error instanceof Error ? error : undefined);
  process.exitCode = 1;
}
