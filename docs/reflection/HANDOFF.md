# Reflection course - handoff

Written 2026-10-04 at the end of the session that started the course.
A fresh session reads this file, then `docs/reflection/index.html` and `docs/reflection/00-timeline.html`, then continues.

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
- Explanations: analogy, then numbered steps, then a pass/fail story; plain language, one concept at a time (see the user's memory notes on explanation style and planning).
- Multi-step work: give a short numbered plan with costs and get approval before running.
- Archived docs: approved for this course, read-only via `git show <tag>:<path>` (index in `docs/ARCHIVED.md`); never restore them into the tree.

## Approved plan and state

| # | Module | State |
|---|---|---|
| A | Stale-doc fixes on `dev` | done, `cde5a1a`, pushed |
| T | Timeline (`00-timeline.html`) | done, `5d5cf01`, pushed; walkthrough not yet started |
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

## Next step

1. Ask whether the user has read `00-timeline.html`, then take their answers to its five check-in questions and walk through the timeline in chat.
2. Then build module 0 as `docs/reflection/01-map.html`: the product, its users, the architecture, and one chat question traced through the code (`src/app.ts` routes, `ChatController`, the orchestrator and tool loop, retrieval, `src/prompt/promptBuilder.ts`, the Fireworks call, citations and gates).

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
- Behaviour: `docs/SPECS.md`; architecture: `docs/migration/GILLIGAN_TARGET_ARCHITECTURE.md`; config: `src/config/index.ts`.
- Decisions with dates: `docs/timeline.md` (decision tables).
- Eval: `docs/EVAL_REBUILD.md` (§0 why, §1 decisions, §2 sizing, §3 model roles, §6 traps, §9 phase table and the dated capture log), `eval/README.md`, `eval/reviews/phase3-2026-09-23/R4_REPORT.md`, `docs/GRADING_GUIDE.md`, `docs/RETRIEVAL_EVAL.md`, `docs/RETRIEVAL_LABELS.md`.
- Bake-off (history only): `docs/RETRIEVAL_BAKEOFF.md`; the archived results report is `git show eval-docs-archive-2026-09-15:docs/RETRIEVAL_COMPARISON.md`.
- Incident: `docs/migration/SECURITY_INCIDENT_2026-09-19.md`.
- Corpus: `documents/README.md` (16 documents, 864,321 chars, 457 chunks).

## Facts already gathered (re-derive if in doubt)

- 525 non-merge commits on `dev` plus 96 merges; 202 of the 525 touch only `.md`/`.html`; `docs/STATUS.md` has 44 commits.
- Size: 21.4k lines in `src`, 19.7k in `test`, 16.3k in `docs`; 45 local branches, 40 worktrees, 11 tags (9 archive or recovery, 2 wip).
- Commits per ISO week peak at 270 in the week of Sep 21.
- Eval end state: launch is `local-vector` k=20 with both query rewrites, `glm-5p3-flash` at reasoning low, judge `deepseek-v4p1-flash` on rubric v2; correctness about 1.16 against a 1.30 floor; gold context 1.33; judge kappa 0.849 tuned, 0.25 held out; offline recall vs correctness Spearman 0.29.

## Loose ends

- Stale code comments found during the doc audit, out of scope so far: `scripts/gradePacket.ts:56` (says the transcript tree is empty) and `src/eval/costScenarios.ts:36-40` (calls `gpt-oss-120b` the production generator; `npm run cost` still prices at its rates).
- The main checkout also holds another workstream's uncommitted edits (`.gitignore`, `docs/STATUS.md`, two migration docs, seen 2026-10-04); do not stage or revert them.
- Candidates for 9a seen 2026-10-04, unverified: STATUS (118 lines, mostly release detail) is read every course session though the HANDOFF suffices; `CLAUDE.md`'s "Cloud sessions" block loads in local sessions; some memory notes read like project rules (git handling, judge setting), and the memory folder is keyed to the checkout path, which moved from `~/code/` to `~/code/work/` on 2026-10-04.
- Exercise safety: git and Claude Code exercises run in a throwaway practice clone (for example `git clone ~/code/work/clean-earth-rovers/repo/cer-demo ~/code/work/practice/cer-demo`), never on real branches; diagnostics run against a local stack started with `run-local` on free ports, never production, never port 8000 or another chat's stack; never print `.env` values (show variable names only).
- To do on `00-timeline.html`: add "How it's computed" boxes for the metrics it uses (kappa, recall, Spearman, standard error) and a "Try it" section with git exercises; change "would have exposed this in a day" to a few days, since gold context needs labels first.
- The course is local only; publish a page externally only if the user asks.
