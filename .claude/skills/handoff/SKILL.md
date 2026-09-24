---
name: handoff
description: Update CER durable docs and session status when the user explicitly requests a handoff; `/handoff cloud` also pushes it and prints cloud context-exploration prompts.
disable-model-invocation: true
---

# Handoff

Run only when explicitly requested: `/handoff [cloud] [workstream]`.
Without `cloud` it is a normal handoff (steps 1-5); with `cloud`, also run step 6.
If `docs/STATUS.md` is missing, stop and report it.

1. Gather fresh Git status, relevant commits since the last STATUS update, and this session's checks, decisions, spend, defects, and open questions.
   Establish ownership of changed paths; ask about unknown ownership and do not edit another workstream's files.
2. Update affected durable docs first: behavior in SPECS/design docs, decisions/gates in timeline, evaluation state in EVAL_REBUILD, commands/setup in README.
   Search for stale facts only in affected documents; broaden the search when evidence warrants it.
   Propose lasting instruction/skill changes separately and apply only with the user's agreement.
3. Re-read STATUS immediately before editing and use [TEMPLATE.md](TEMPLATE.md).
   Update this workstream only, regenerate working-tree facts, and preserve other workstreams.
   Record completed outcomes in durable docs before removing them from open work.
   Keep STATUS under 120 lines, Last session at most five lines, and derive numbers from current sources.
4. Verify edited links, line limits, numbers, and status paths; check that new code/durable docs do not cite STATUS.
5. Report outcomes and outstanding decisions briefly, plus `Read docs/STATUS.md, then continue <workstream>`.
6. Cloud only:
   - Commit this handoff's own paths and push `dev` through `git-plan`, so cloud sessions clone it.
   - For each "Next conversations" task, print one prompt in chat from [CLOUD_PROMPT.md](CLOUD_PROMPT.md); never write prompts into STATUS.
   - A task whose files are in the upstream repos, git-ignored data, or untracked files gets "explore locally" instead, because the cloud clone cannot see them.
   - Give each prompt its local start line from the same file.
