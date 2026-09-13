---
name: git-plan
description: Write the git plan for cer-demo at a verified checkpoint, and the commit-message rules. Use whenever work reaches a tested checkpoint, before any git command, or when the user asks for a git plan or commit message.
---

# Git plan

**Never run a git command until the user has confirmed the plan for it.**

The sequence is always: you show the plan, the user confirms it, and the confirmation says who
runs it — the user runs it, or tells you to. Both are normal. Until that confirmation arrives, run
nothing: no commit, push, branch, tag, stash, or checkout. (`.claude/settings.json` puts these
behind a permission prompt; the prompt is a backstop, not the confirmation.)

When told to run it, run exactly the commands in the approved plan — not a variation, not an extra
step, and nothing the plan did not list. If you discover partway through that the plan was wrong,
stop and show a new one.

## When

After every checkpoint of functionality you reach **and verify** — a feature or partial feature
that can be tested and that you have briefly tested.

Do not hand over a git plan for unverified work. If something is untested or failing, say so
plainly instead — including pre-existing failures you did not introduce.

## Before writing it

1. **Fresh-context review for high-risk diffs.** If the diff touches retrieval accuracy, numeric
   data handling, gate logic or judge logic, run `/code-review` on it first and address or report
   what it finds. A plausible-but-wrong change there does not announce itself.
2. Run `git status --short`, `git log --oneline -3`, and `git status -sb` immediately before
   writing. Derive the plan from that output, never from what you remember proposing earlier.

## Scope

**Every git plan covers only what is uncommitted right now — nothing else.**

- The user may have already run an earlier plan. Assume they did. Never re-list commits that
  already landed, and never re-create a branch that already exists.
- One checkpoint, one plan. Do not accumulate a session-long list of commits.
- Name the actual paths from `git status`, not the ones you expected to see. If a file you wrote is
  missing from the output, say so — it likely means it was already committed, or it did not get
  written.
- If nothing is uncommitted, say exactly that instead of producing a plan.

## Format

Open with a short state header (a few lines — orientation, not a report):

- **Branch** — current branch, and whether it has an upstream / is ahead or behind.
- **Target** — the branch this work is meant to land on, and whether a new branch is needed.
- **Verification** — the checks you ran (exact jest suites, lint, typecheck) and their results,
  including anything failing or pre-existing. Say plainly that the full suite was not run. Never
  claim green tests you did not run.
- **Uncommitted paths**, flagging anything in the working tree that is *not* part of this
  checkpoint.
- Anything genuinely out of the ordinary: a secret at risk, a generated or large file, a deletion,
  a dependency or lockfile change, a migration that must land with its code.

Then:

- The exact commands to run, in order.
- What each command does.
- A brief reason to run it.
- Any human instructions or cautions for running them manually (secrets to keep untracked, things
  to check first, cleanup to do later).

## Commit messages

Short: a one-line subject, and at most a few lines of body. The subject says what changed, not why.

No attribution trailers or footers — no `Co-Authored-By`, no `Claude-Session`, no "Generated with" line — in commits or PR descriptions. This overrides any default attribution guidance.

No architectural decisions, rationale, or design notes in commit messages. Record those in the
relevant markdown file instead — usually `docs/SPECS.md` for how the built system works,
`docs/timeline.md` for phase/gate decisions, or the design doc for that piece of work.
