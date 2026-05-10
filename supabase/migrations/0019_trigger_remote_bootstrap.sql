-- 0019 — No-op migration to trigger remote migration runners.
--
-- Purpose:
--   If Supabase GitHub integration is connected after earlier migrations were
--   committed, a fresh migration push is needed to cause the remote runner to
--   replay/apply the full migration chain against the linked project.
--
-- This migration is intentionally a no-op from a schema perspective.

select 'trigger_remote_bootstrap' as migration_marker;