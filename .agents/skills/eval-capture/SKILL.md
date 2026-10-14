---
name: eval-capture
description: Plan, run, judge and record a paid CER eval capture of the wave 1 fixtures, or estimate what one would cost.
---

# Eval capture

A capture asks the 45 wave 1 fixtures (90 turns) through a local server and judges the answers.
It costs real money and its transcripts can never be redone, so every step below exists because skipping it once cost a run.
Background and every past capture: `docs/EVAL_REBUILD.md` §6 (traps), §7 (commands) and §9 (dated log); the newest §9 entries are the template.

## 1. Fix the plan before spending

Write a short plan and get the user's approval for it and its total cost:

- **Question** and **setup**: the launch configuration below with exactly one named change, and the commit it runs at.
- **Baseline** to compare against (a named run pair) and its noise: about 0.04 capture to capture and 0.05 judge pass to pass.
- **Decision rule**: adopt/otherwise thresholds on correctness and the gates, written before any capture; a rule set afterwards is not a result.
- **Runs**: ids `<slug>-lv-k20-glm-YYYY-MM-DD`, plus `-rejudge-` twins for second judge passes.
- **Cost**: about $0.25-0.35 per capture with rewrites and $0.50-0.65 per `--final` correctness pass; `npm run judge -- --run=<id> --dry-run` prices a pass.

Commit the rule to §9 as "<topic>: decision rule fixed before capture - <date>" before the first paid call.

## 2. Start the server with the launch configuration

Set every value on the command line; never rely on `.env`, which turns the tools on.
Use a free port other than 8000 (the user's), and stop only the session you started.

```
PORT=8011 SENSOR_TOOL=false REPORT_TOOL=false DEBUG_RETRIEVAL=true \
  LLM_MODEL=accounts/fireworks/models/glm-5p3-flash LLM_REASONING_EFFORT=low LLM_MAX_TOKENS=16384 \
  DEFAULT_RETRIEVAL=local-vector QUERY_REWRITE=true QUERY_REWRITE_FIRST_TURN=true \
  CATALOGUE_PROMPT=true CORPUS_SOURCE=artifact npx ts-node src/index.ts
```

Wait for `curl -s localhost:8011/health` to return 200.

## 3. Spot check, then capture

Every runner command also sets `SENSOR_TOOL=false REPORT_TOOL=false` and passes `--base-url`, which otherwise defaults to port 8000.

```
SENSOR_TOOL=false REPORT_TOOL=false npm run bakeoff -- --arm=local-vector --spot-check --base-url=http://localhost:8011/api/v1
SENSOR_TOOL=false REPORT_TOOL=false npm run bakeoff -- --arm=local-vector --pass=warm --run=<id> --base-url=http://localhost:8011/api/v1
```

The spot check must show non-empty context and the expected retrieval `mode`; empty context gives a clean-looking, meaningless dataset.
The capture must report 90/90 with 0 failed; stop and report anything else.

## 4. Gates, then the judge

```
npm run gate:check -- --run=<id>
npm run judge -- --run=<id> --final --dimension=correctness
ln -s <id> eval/transcripts/<id>-rejudge && npm run judge -- --run=<id>-rejudge --final --dimension=correctness
```

Reported or deciding numbers use `--final`; compare only passes with the same judge, rubric and reasoning setting.

## 5. Apply the rule and record it

Apply the rule exactly as written; a near miss is a near miss, and a second capture needs its own rule fixed first.
Add a §9 results entry that matches its neighbours: commit, settings, 90/90, prompt and completion tokens with cache share, wall time, a table against the baseline, the rule outcome, a one-line reading and the spend.
Commit `eval/transcripts/<id>/`, `data/results/judge/<id>*/` and the doc together; never edit a transcript.
Stop the server, then report the outcome, the spend and the commit.

## Traps

- A tools-on capture changes the system prompt and makes live production reads: it is unusable and must not run.
- `npm run grade:packet` takes `--out=<dir>`, never `--force`; `KEY.json` stays closed until `scores.csv` is complete.
- `bakeoff` refuses to overwrite a run; choose a new id rather than deleting the old one.
