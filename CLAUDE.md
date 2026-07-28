# Scope

WRITE: only within this repository (cer-demo).
READ-ONLY: ../user-dashboard and ../backend are reference repos.
Never create, edit, or delete files outside cer-demo. If a task seems to
require modifying a reference repo, stop and tell me instead.

All migration planning artifacts go in docs/migration/.

# Git

I run all git commands myself. Never commit, push, branch, or tag on my behalf.

After every checkpoint of functionality you reach **and verify** — a feature or
partial feature that can be tested and that you have briefly tested — give me a
**git plan**:

- The exact commands to run, in order.
- What each command does.
- A brief reason why we should run it.
- Any human instructions or cautions I need in order to run them manually
  (secrets to keep untracked, things to check first, cleanup to do later).

Do not hand me a git plan for unverified work. If something is untested or
failing, say so plainly instead — including pre-existing failures you did not
introduce.

**Every git plan covers only what is uncommitted right now — nothing else.**

- Run `git status --short`, `git log --oneline -3`, and `git status -sb`
  immediately before writing the plan. Derive it from that output, never from
  what you remember proposing earlier in the session.
- I may have already run an earlier plan. Assume I did. Never re-list commits
  that already landed, and never re-create a branch that already exists.
- One checkpoint, one plan. Do not accumulate a session-long list of commits.
- Name the actual paths from `git status`, not the ones you expected to see. If
  a file you wrote is missing from the output, say so — it likely means I already
  committed it, or it did not get written.
- If nothing is uncommitted, say exactly that instead of producing a plan.

Open every git plan with a short state header, so I know where I am before I run
anything:

- **Branch** I am on now, and whether it has an upstream / is ahead or behind.
- **Target** — the branch this work is meant to land on, and whether a new branch
  is needed or the current one is already correct.
- **Verification** — the result of the checks you ran (tests, lint, typecheck),
  including anything failing or pre-existing.
- **Uncommitted paths**, and a flag on anything in the working tree that is *not*
  part of this checkpoint.
- Anything genuinely relevant and out of the ordinary: a secret at risk, a
  generated or large file, a deletion, a dependency or lockfile change, a
  migration that must land with its code.

Keep the header to a few lines. It is orientation, not a report.

# Commit messages

Keep them short: a one-line subject, and at most a few lines of body. The subject
says what changed, not why.

Do not put architectural decisions, rationale, or design notes in commit messages.
Record those in the relevant markdown file instead — usually `docs/SPECS.md` for
how the built system works, `docs/timeline.md` for phase/gate decisions, or the
design doc for that piece of work. Commit messages point at the change; the docs
carry the reasoning.
