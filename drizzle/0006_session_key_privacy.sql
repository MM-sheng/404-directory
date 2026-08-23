-- Production briefly received an earlier 0005 migration that created
-- session_id. The current application never persists the raw MCP session
-- token; it writes only an irreversible HMAC to session_key.
--
-- Keep this additive and idempotent so it repairs that production lineage and
-- is also harmless for fresh databases where the corrected 0005 already
-- created session_key.
ALTER TABLE "invocations" ADD COLUMN IF NOT EXISTS "session_key" text;
