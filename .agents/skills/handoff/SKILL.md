---
name: handoff
description: Update CER durable docs and the workstream's handoff record when the user explicitly requests a handoff.
---

# Handoff

Run only when explicitly requested with `$handoff`; an optional argument identifies the workstream.
If `docs/STATUS.md` is missing, stop and report it.

A handoff is written for a fresh session that has nothing but the file: it must be able to resume without searching.

1. Gather fresh Git status, relevant commits since the last handoff, and this session's checks, decisions, spend, defects, and open questions.
   Establish ownership of changed paths; ask about unknown ownership and do not edit another workstream's files.
2. Update affected durable docs first: behavior in SPECS/design docs, decisions/gates in timeline, evaluation state in EVAL_REBUILD, commands/setup in README.
   Search for stale facts only in affected documents; broaden the search when evidence warrants it.
   Propose lasting instruction/skill changes separately and apply only with the user's agreement.
3. Choose the record:
   - A workstream with its own handoff file (its STATUS line names it, such as `docs/reflection/HANDOFF.md`) updates that file with [WORKSTREAM_TEMPLATE.md](WORKSTREAM_TEMPLATE.md).
   - Otherwise update STATUS with [TEMPLATE.md](TEMPLATE.md), this workstream only, preserving the others.
   - If STATUS says one session alone writes it, a branch that is not `dev` leaves STATUS alone and reports the line for that session instead.
4. Write the record as current state, not a diary: rewrite sections rather than appending dated updates, and move finished outcomes to durable docs before deleting them.
   Quote every open question and pending decision word for word, with the options offered and the recommendation.
   Make "Next step" a numbered list whose first item is the first action, then end with the resume prompt.
   Give each derived number its source or command, such as `git rev-list --count --no-merges dev`, so the next session reruns it instead of trusting it.
   Keep STATUS under 120 lines with Last session at most five lines, and a workstream file under 150 lines.
5. Verify: re-read the record as a fresh session would and answer from it alone what to do first, what is waiting on the user, and what must not be touched; fix any gap.
   Check edited links, line limits, numbers and paths; check that new code and durable docs do not cite STATUS.
6. Report outcomes and outstanding decisions briefly, then the resume prompt, such as `Read docs/reflection/HANDOFF.md on branch reflection, then continue the reflection course.`
   Offer a docs-only Git plan only if requested or needed for an explicitly requested Git mutation.
