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

# Commit messages

Keep them short: a one-line subject, and at most a few lines of body. The subject
says what changed, not why.

Do not put architectural decisions, rationale, or design notes in commit messages.
Record those in the relevant markdown file instead — usually `docs/SPECS.md` for
how the built system works, `docs/timeline.md` for phase/gate decisions, or the
design doc for that piece of work. Commit messages point at the change; the docs
carry the reasoning.
