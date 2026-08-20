import path from "path";

/**
 * Cuts the developer's `.env` out of the test run, for every suite, before any module loads.
 *
 * `src/config/index.ts` opens with `import "dotenv/config"`, so the first module that reaches
 * config pulls the whole of `.env` into `process.env`. That made the suite's result a function
 * of an untracked, per-machine file: `SENSOR_TOOL=true` locally turns two `evalFixtures`
 * assertions into empty loops that pass without checking anything, `DEFAULT_RETRIEVAL` decides
 * which retrieval arm the integration tests actually exercise, and a test that clears a key with
 * `delete` has it refilled from the file by the next `jest.resetModules()`.
 *
 * `dotenv/config` reads its target from `DOTENV_CONFIG_PATH` and treats a missing file as "no
 * variables to inject", so pointing it at a path that cannot exist makes the import inert.
 * `DOTENV_CONFIG_QUIET` suppresses the "injecting env (0)" line it would otherwise print per
 * module reset.
 *
 * Variables **exported into the shell** are untouched: dotenv only ever fills keys that are
 * absent, so `SENSOR_TOOL=true npx jest` still works. Only the file is blocked.
 */
process.env.DOTENV_CONFIG_PATH = path.join(__dirname, "no-such.env");
process.env.DOTENV_CONFIG_QUIET = "true";
