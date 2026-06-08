-- CreateTable
CREATE TABLE "TaskLabel" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskLabel_taskId_sortOrder_idx" ON "TaskLabel"("taskId", "sortOrder");

-- AddForeignKey
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable row-level security (no policies) to match the hardened public schema;
-- denies Supabase anon/authenticated API roles. Mirrors 20260513000000_harden_public_schema_rls.
ALTER TABLE IF EXISTS "public"."TaskLabel" ENABLE ROW LEVEL SECURITY;
