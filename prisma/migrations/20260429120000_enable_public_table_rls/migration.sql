-- Supabase exposes tables in the public schema through its Data API.
-- Keep app data private by requiring Row-Level Security on every app table.
-- No policies are added because this app accesses data through server-side Prisma.
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Board" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Subtask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BoardNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RateLimitBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AdminAuditLog" ENABLE ROW LEVEL SECURITY;
