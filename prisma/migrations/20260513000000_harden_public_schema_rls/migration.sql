-- Supabase exposes the public schema through PostgREST when API roles have
-- table privileges. This app uses server-side Prisma credentials only, so RLS
-- should stay policy-free and deny anon/authenticated API role access.
ALTER TABLE IF EXISTS "public"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."Board" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."Subtask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."BoardNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."RateLimitBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."AdminAuditLog" ENABLE ROW LEVEL SECURITY;

-- Prisma stores migration history in public by default. Enabling RLS here
-- closes the remaining exposed public table without adding API-role policies.
ALTER TABLE IF EXISTS "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
