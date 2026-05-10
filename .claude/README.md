# `.claude/` — Claude Code config

This directory holds Claude Code's repo-scoped configuration.

- **`settings.json`** — checked-in permissions and tool allow/deny lists. Safe defaults: most pnpm/git/supabase/test commands are pre-approved; destructive ops (force-push, hard-reset, `rm -rf`, `supabase db reset`) and `.env*` reads are denied.
- **`settings.local.json`** *(gitignored)* — your personal overrides. Created automatically by Claude Code when you approve a tool not in `settings.json`.
- **`agents/`** *(optional, future)* — repo-specific subagents. None defined yet; the user-level agents in `~/.claude/agents/` apply.

The repo-level instructions Claude Code reads on every session are in [`../CLAUDE.md`](../CLAUDE.md). Update that file, not this one, when project conventions change.
