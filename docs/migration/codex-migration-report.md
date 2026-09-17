# CER Claude and Codex migration

Completed 2026-09-16 using Claude Code 2.1.273 and Codex CLI 0.154.0.
Scope: the CER workflow plus its global writing preferences and Codex defaults.
The user authorized updating both Claude and Codex after reviewing the migration and token-reduction plan.
Unrelated project configurations, inactive plugin catalogs, authentication, session history, and existing worktrees were left alone.
No application code, Git commits, dependency installations, production calls, or paid model tasks were performed.

## What changed

- Condensed global preferences and CER instructions for both tools.
- Retained four repository-local skills: git-plan, run-local, delegate, and handoff.
- Removed automatic checkpoint Git plans and default delegation by task size.
- Kept handoff explicit-only: `/handoff` in Claude and `$handoff` in Codex.
- Moved conditional worktree runtime setup into a reference in each tool's run-local skill.
- Retained production cautions, reference-repository protection, captured-artifact protection, targeted testing, and chat approval for Git mutations.
- Replaced broad process-kill recipes with session/process-specific shutdown and removed the two old local pkill grants.
- Preserved Claude's shared permissions, status script, model, notifications, marketplace state, and attribution settings.
- Preserved Codex's gpt-6-astra/medium selection, trust entry, onboarding state, bundled skills, and cached plugins.
- Added native Codex status fields for model, directory, context, usage limits, and input/output tokens.
- Added a project permission profile and a cer-worker definition using gpt-5.6-sol/medium.

## Context reduction

| Material | Before | After | Reduction |
|---|---:|---:|---:|
| Claude global + CER instructions | 6,665 characters | 3,306 characters | 50.4% |
| Four Claude SKILL.md entrypoints | 16,703 characters | 6,600 characters | 60.5% |
| Effective Claude auto-mode environment | 2,561 characters | 808 characters | 68.4% |

Codex global + project instructions total 3,181 characters.
Skills load their full bodies only when used; the prompt diagnostic confirmed no automatic Git-plan body and no handoff discovery entry.
These are text-size reductions, not measured billable-token or monetary savings.
Conditional worktree references add detail only when needed.

## Compatibility and deliberate differences

- Claude autoMode must remain in user settings: version 2.1.273 ignores that block in shared and local project settings.
  Its short CER entries are explicitly scoped; the original replacement behavior for environment is retained, while soft_deny still includes the built-in defaults.
- Codex uses on-request approval with the user as escalation reviewer; Claude's contextual auto-mode classifier was not copied.
- Codex's OS-level credential read-denies also affect subprocesses, unlike Claude's Read-tool rules.
  Authenticated gcloud operations can therefore require an explicitly approved escalation.
- Chat-approved Git plans do not bypass Codex sandbox approvals.
  Claude's native worktree-creation exception is retained only in its instructions; Git-based worktree creation needs an approved plan in both tools.
- Codex subagents do not automatically acquire isolated worktrees.
  The delegate skill requires verified worktree scoping, a separate rooted Codex session, or inline work instead.
- The worker definition was syntax-checked; no actual worker/model execution was performed.
- Native Codex status items do not reproduce Claude dollar costs, cache-write accounting, transcript aggregation, or exact two-line formatting.
- Design artifacts use local Markdown/HTML; external publication needs an available capability and authorization.
- No hooks were added: no active personal hooks required migration.
- No MCP servers were added: CER has none; Hive and Figma were excluded from this CER-only migration.

## Files modified

- `~/.claude/CLAUDE.md`
- `CLAUDE.md`
- `.claude/skills/git-plan/SKILL.md`
- `.claude/skills/run-local/SKILL.md`
- `.claude/skills/delegate/SKILL.md`
- `.claude/skills/handoff/SKILL.md`
- `.claude/skills/handoff/TEMPLATE.md`
- `~/.claude/settings.json`
- `.claude/settings.local.json`
- `~/.codex/config.toml`

## Files created

- `~/.codex/AGENTS.md`
- `AGENTS.md`
- `.claude/skills/run-local/references/worktree.md`
- `.agents/skills/git-plan/SKILL.md`
- `.agents/skills/run-local/SKILL.md`
- `.agents/skills/delegate/SKILL.md`
- `.agents/skills/handoff/SKILL.md`
- `.agents/skills/run-local/references/worktree.md`
- `.agents/skills/handoff/TEMPLATE.md`
- `.agents/skills/handoff/agents/openai.yaml`
- `.codex/config.toml`
- `.codex/agents/cer-worker.toml`
- `docs/migration/codex-migration-report.md`

## Backups and rollback

Every pre-existing destination was backed up and SHA-256 verified before the first edit.
The backup contains 10 original files, two additional validation-revision backups, and a manifest with original/final hashes and destination paths.
Backups are outside the repository with restricted file permissions.

- Backup directory: `/home/winsy/.codex/backups/cer-migration-20260916T071816Z`
- [Backup manifest](/home/winsy/.codex/backups/cer-migration-20260916T071816Z/manifest.json)

To roll back, first preserve any subsequent edits, then restore each manifest entry's original `backup` to its `path`.
Review newly created files individually before removing them; their original hash is null.
Do not overwrite newer user work with a blanket restore.

## Validation

- JSON, TOML, YAML, all four Codex skill validators, relative Markdown references, and original/final backup hashes passed.
- Claude `auto-mode config` loaded the concise environment, retained default block rules, and removed the stale ../backend reference.
- Codex app-server started with `--strict-config`; config/read confirmed gpt-6-astra and the cer-demo permission profile.
- Native skills/list discovered all four repository skills without errors.
- Native prompt-input showed both global and CER guidance; handoff was excluded from automatic context and skill bodies were not eagerly loaded.
- Sandbox probes allowed a temporary CER file and denied writes to both reference repositories and the home directory.
- Both protected credential paths rejected open attempts; no credential contents were read.
- Codex Doctor passed 19 checks with zero warnings/failures; provider HTTP and WebSocket reachability passed.
- MCP listing confirmed no configured CER servers.
- No application tests ran because only instructions and agent configuration changed.

The sandbox and app-server diagnostics required normal host access because the current session's outer sandbox blocks nested mount setup and Codex database writes.
The tested CER sandbox itself remained restricted.

## Resulting configuration tree

```text
~/.claude/
  CLAUDE.md                         # compact global guidance
  settings.json                     # compact, scoped autoMode
  statusline-command.sh             # preserved
~/.codex/
  AGENTS.md
  config.toml
  backups/cer-migration-20260916T071816Z/
  skills/.system/                   # preserved
  plugins/                          # preserved
cer-demo/
  CLAUDE.md
  AGENTS.md
  .claude/
    settings.json                   # preserved existing shared permissions
    settings.local.json             # removed broad pkill grants
    skills/
      git-plan/SKILL.md
      delegate/SKILL.md
      run-local/{SKILL.md,references/worktree.md}
      handoff/{SKILL.md,TEMPLATE.md}
  .codex/
    config.toml
    agents/cer-worker.toml
  .agents/skills/
    git-plan/SKILL.md
    delegate/SKILL.md
    run-local/{SKILL.md,references/worktree.md}
    handoff/{SKILL.md,TEMPLATE.md,agents/openai.yaml}
  docs/migration/codex-migration-report.md
```

## Manual attention and recommendations

Start fresh Claude and Codex sessions to load the revised instructions.
Existing sessions and managed runtime overrides may retain different settings.
Use handoff only when needed and keep ordinary work inline to avoid extra contexts.
Keep installed global skills minimal; inactive catalogs and unrelated project skills need no deletion.
The GitHub CLI is absent from the current PATH; install it only if a future task needs it.
Do not expect new worktrees to contain uncommitted configuration; carry the required brief explicitly until these files are committed through an approved Git plan.

Sources: [Codex instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [skills](https://learn.chatgpt.com/docs/build-skills), [permission profiles](https://learn.chatgpt.com/docs/permissions), and [Claude auto-mode scope](https://code.claude.com/docs/en/auto-mode-config).
