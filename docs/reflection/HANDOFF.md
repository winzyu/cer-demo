# Reflection course - handoff

Written 2026-10-04 at the end of the session that started the course; updated 2026-10-12 at the end of the second session.
A fresh session reads this file, then `docs/reflection/index.html` and `docs/reflection/00-timeline.html`, then continues from "Next step".

## What this is

The user asked to be taught the whole cer-demo codebase: high level first, then implementation and decisions, with a timeline, a blunt retrospective (what was good, where time was wasted, what knowing better would have avoided), and the eval work as the main emphasis.
The audience is the user, who is aiming at AI/ML engineering roles.
All course work lives on branch `reflection` (cut from `dev` at `cde5a1a`, pushed to `origin`), under `docs/reflection/`.

## The learner (from the interview, 2026-10-02)

- New to ML/LLMs: comfortable coding, but RAG, embeddings, LLM judges and eval statistics need teaching from scratch, always tied to real code.
- Goals, all four: job interviews, owning the codebase, a playbook for next projects, general ML skills.
- Format: one local HTML page per module under `docs/reflection/`, then a walkthrough in chat with check-in questions before moving on.
- Hands-on: free exercises plus small paid runs (cents each), each approved by the user before it runs; no live production reads.
- Metrics (asked 2026-10-04): whenever a metric or measurement appears (kappa, recall@k, nDCG, MRR, Spearman, standard error, correctness mean, ungrounded rate, cost), give a "How it's computed" box: the formula in plain words, each input and where it comes from (file, code path, run id), and a worked example with this project's real numbers; where possible, an exercise that recomputes it (for kappa, by hand and then with `cohensKappa` in `src/eval/judge/calibrate.ts`).
- Practice over reading (asked 2026-10-04): every module has a "Try it" section of hands-on exercises, not just questions, always including git and Claude Code exercises; each exercise gives the goal, the commands, what the user should see, and a check.
- Diagnostics (asked 2026-10-04): the user wants to learn how to read a system's state; module D teaches it and every later module's "Try it" reuses it.
- Candour: fully blunt, with time or money estimates for each detour and the early signal that would have caught it.
- Git is a strand of its own: every module has a "git lens" (how git was used, useful commands and tricks, best practice); module 9b covers git in depth.
- Working with Claude is a strand too (added 2026-10-04 at the user's request): every module has a "Claude lens" (how Claude was used, what helped, what wasted time, rough cost); module 9a audits `CLAUDE.md`, `docs/STATUS.md`, memory and skills with evidence and ends in proposed changes the user approves one by one; module 10 adds a "setting up Claude for a new project" checklist.
- Define every term a question or page relies on before asking about it (asked 2026-10-05: Q3 first used "offline recall", "captures", "reranker" and "proxy metric" undefined).
- Explanations: analogy, then numbered steps, then a pass/fail story; plain language, one concept at a time (see the user's memory notes on explanation style and planning).
- Multi-step work: give a short numbered plan with costs and get approval before running.
- Archived docs: approved for this course, read-only via `git show <tag>:<path>` (index in `docs/ARCHIVED.md`); never restore them into the tree.

## Approved plan and state

| # | Module | State |
|---|---|---|
| A | Stale-doc fixes on `dev` | done, `cde5a1a`, pushed |
| T | Timeline (`00-timeline.html`) | page done (`5d5cf01`, metric boxes and Try it `a594e97`, glossary `b942662`); walkthrough at Q3 |
| 0 | The map: what Gilligan does, one question traced end to end | next |
| D | Diagnosing a running system: processes, ports, curl, logs, Docker, env, git state; practised on the local stack | planned |
| 1 | LLM basics through this code | planned |
| 2 | Retrieval and the direct-feed vs RAG bake-off | planned |
| 3 | Live data and tools: sensor tools, plausibility, reports | planned |
| 4 | Eval I: why the first eval was thrown out | planned |
| 5 | Eval II: retrieval eval, labels, recall, per-turn labels | planned |
| 6 | Eval III: grading answers, gates, LLM judge, calibration, kappa | planned |
| 7 | Eval IV: running it, decision rules, cost; one small paid rerun | planned |
| 8 | Production: migration, security incident, mirror, deployment | planned |
| 9a | Working with Claude: agents, docs system, parallel chats; audit of `CLAUDE.md`, STATUS, memory, skills | planned |
| 9b | Git in depth | planned |
| 10 | Retrospective and playbook, including a Claude setup checklist | planned |
| 11 | Interview kit | planned |

Modules 4-7 get the most depth.
Update the State column in `index.html` as modules land.

## Walkthrough so far (timeline check-ins)

- **Q1 (bake-off)**: the user answered that 27 of 30 fixtures sat in the 4.4% direct-feed slice (right) and did not know the early measurement. Taught: the gold-context ceiling (`src/retrieval/adapters/GoldContextAdapter.ts`: all labelled chunks for the turn, nothing else, same prompt and history), the step-by-step reasoning (ceiling below the 1.30 floor means fix generation first, then compare retrievers as a gap from the ceiling), and that empty labels are deliberate (7 refusal turns plus one answered from the system prompt) while a missing label throws.
- **Q2 (kappa 0.849 vs 0.25)**: the user proposed a weighted average over 44 rows. Taught: the 32 rows tuned the judge prompt and the 12 were held out, so report held-out (75% exact, 100% within one, kappa 0.25 unstable at n=12 with one dominant grade).
- **Kappa exercise**: the user computed it by hand. Their method was right; they slipped on 9/12 x 10/12 (wrote 0.75, not 0.625) and got -0.25, then fixed it. Bonus (judge always says 1) answered correctly: observed 0.75, kappa 0. Lesson for teaching: keep fractions over a common denominator.
- **Q3 (proxy metrics)**: asked, then the user asked what the terms meant; they were defined in chat and added to the page's glossary and Era 6 table (`b942662`). The user has not answered Q3 yet. Q4 and Q5 are not reached.

## Pending decision: post-launch material

On 2026-10-11 the user asked what the post-launch changes mean for the course. Only `469e972` (searched-window fix) is on `dev`; the rest is on unmerged branches: `task/release-l6-images` and `docs/launch-handoff` (L6-L9, Gilligan live 2026-10-07, email outage, unguarded user-update routes, "launch with known issues" on 2026-10-06), `docs/behavior-handoff` (data-skepticism incident, `docs/records/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`), `task/sot-v2-flagging` (per-reading QC in `src/devices/readingQc.ts`, limit resolution, 3-in-a-row rule, tool-computed verdicts), `task/report-omit` (omit option; the model claimed unmade PDFs in about 3 of 8 runs, fixed in the server).
Proposed changes: Era 8 "Live" on the timeline and fix Era 7's stale "waits on Michael for B1"; module 3 grows with QC and flagging; new module 8b "After launch: real users" on the two incidents; metric boxes for run rates (3 of 8), the 5-10% exceedance share and fixture coverage (1 of 49); module D uses the window fix as its debugging case; 9b covers the hotfix cherry-pick and stacked branches; 9a notes `dev` lagging the live state; module 10 and 11 gain "eval coverage must match production use" and "enforce invariants in code, not prompts".
Options put to the user: (a) write now citing branch commits, (b) update only the plan now and write pages once the branches land. Recommended (b) plus the Era 7 fix now. **Not answered yet.**

## Next step

1. Briefly recap where the walkthrough stands (above), then take the user's answer to Q3, then Q4 and Q5, defining any term before asking.
2. Get the user's answer on the post-launch decision and apply it.
3. Then build module 0 as `docs/reflection/01-map.html`: the product, its users, the architecture, and one chat question traced through the code (`src/app.ts` routes, `ChatController`, the orchestrator and tool loop, retrieval, `src/prompt/promptBuilder.ts`, the Fireworks call, citations and gates).

## Page conventions (match `00-timeline.html`)

- Self-contained HTML; colour tokens on `:root` with dark mode under `prefers-color-scheme` and `data-theme`; 16px side gutter; no external scripts.
- Box types: `knew` (what we knew then), `cost`, `waste` (blunt), `lesson`, `git` (git lens), `claude` (Claude lens; add its style alongside `git`).
- Each page has a "Try it" section (exercises with commands, expected output and a check), then check-in questions and a "lessons collected" box that feeds module 10.
- Box types for the new strands: `metric` ("How it's computed") and `try` (exercise); add their styles alongside the others.
- Link to `index.html` at the top; plain hyphens in new text, no em dashes.
- Fact-check every number against code, git or the live docs before committing, and run any git command shown on the page.
- Check tag nesting with a small Python `HTMLParser` pass before committing.

## Source map for the modules

- Current state and defects: `docs/STATUS.md` (read only; never cite it from course pages as authority, cite the durable doc instead).
- Behaviour: `docs/SPECS.md`; architecture: `docs/reference/GILLIGAN_TARGET_ARCHITECTURE.md`; config: `src/config/index.ts`.
- Decisions with dates: `docs/timeline.md` (decision tables).
- Eval: `docs/EVAL_REBUILD.md` (§0 why, §1 decisions, §2 sizing, §3 model roles, §6 traps, §9 phase table and the dated capture log), `eval/README.md`, `eval/reviews/phase3-2026-09-23/R4_REPORT.md`, `docs/GRADING_GUIDE.md`, `docs/RETRIEVAL_EVAL.md`, `docs/RETRIEVAL_LABELS.md`.
- Bake-off (history only): `docs/RETRIEVAL_BAKEOFF.md`; the archived results report is `git show eval-docs-archive-2026-09-15:docs/RETRIEVAL_COMPARISON.md`.
- Incident: `docs/records/SECURITY_INCIDENT_2026-09-19.md`.
- Corpus: `documents/README.md` (16 documents, 864,321 chars, 457 chunks).

## Facts already gathered (re-derive if in doubt)

- 525 non-merge commits on `dev` plus 96 merges; 202 of the 525 touch only `.md`/`.html`; `docs/STATUS.md` has 44 commits.
- Size: 21.4k lines in `src`, 19.7k in `test`, 16.3k in `docs`; 45 local branches, 40 worktrees, 11 tags (9 archive or recovery, 2 wip).
- Commits per ISO week peak at 270 in the week of Sep 21.
- Eval end state: launch is `local-vector` k=20 with both query rewrites, `glm-5p3-flash` at reasoning low, judge `deepseek-v4p1-flash` on rubric v2; correctness about 1.16 against a 1.30 floor; gold context 1.33; judge kappa 0.849 tuned, 0.25 held out; offline recall vs correctness Spearman 0.29.

## Loose ends

- Stale code comments found during the doc audit, out of scope so far: `scripts/gradePacket.ts:56` (says the transcript tree is empty) and `src/eval/costScenarios.ts:36-40` (calls `gpt-oss-120b` the production generator; `npm run cost` still prices at its rates).
- The main checkout holds other workstreams' uncommitted files (seen 2026-10-12: `.claude/settings.json`, `release/start-rc2-emulator.sh`, untracked `docs/migration/*_EXPLAINED.html` and `REPORT_EDITING_OPTIONS.html`); do not stage or revert them.
- Teaching example, not a task: on 2026-10-12 the user asked whether `glm-5p3` could replace `glm-5p3-flash`. Both are serverless on Fireworks; `glm-5p3` is $1.40 / $0.26 / $4.40 per million (input / cached / output) against $0.15 / $0.03 / $0.50, so the Sep 26 gold capture would cost about $0.62 instead of $0.07 and a production question about 2 cents instead of 0.25. The user ruled it out on cost and wanted inference only. Usable as a cost worked example in module 1 or 7.
- Coordinator sessions may message this one for status; this session owns no post-launch workstream.
- Candidates for 9a seen 2026-10-04, unverified: STATUS (118 lines, mostly release detail) is read every course session though the HANDOFF suffices; `CLAUDE.md`'s "Cloud sessions" block loads in local sessions; some memory notes read like project rules (git handling, judge setting), and the memory folder is keyed to the checkout path, which moved from `~/code/` to `~/code/work/` on 2026-10-04.
- Exercise safety: git and Claude Code exercises run in a throwaway practice clone (for example `git clone ~/code/work/clean-earth-rovers/repo/cer-demo ~/code/work/practice/cer-demo`), never on real branches; diagnostics run against a local stack started with `run-local` on free ports, never production, never port 8000 or another chat's stack; never print `.env` values (show variable names only).
- `00-timeline.html` has its metric boxes (correctness mean, standard error, kappa, recall, Spearman) and a "Try it" section (2026-10-05); the timeline walkthrough is at check-in Q3, and the user has done the kappa exercise by hand.
- The course is local only; publish a page externally only if the user asks.
