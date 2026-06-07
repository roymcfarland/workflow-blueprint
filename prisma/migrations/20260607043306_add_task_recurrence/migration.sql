-- CreateEnum
CREATE TYPE "RecurrencePattern" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'SEMI_ANNUALLY', 'ANNUALLY');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "recurrence" "RecurrencePattern" NOT NULL DEFAULT 'NONE';
