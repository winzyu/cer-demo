---
name: handoff
description: Update CER durable docs and session status when the user explicitly requests a handoff.
disable-model-invocation: true
---

# Handoff

Run only when explicitly requested with `/handoff`; an optional argument identifies the workstream.
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
   Offer a docs-only Git plan only if requested or needed for an explicitly requested Git mutation.
