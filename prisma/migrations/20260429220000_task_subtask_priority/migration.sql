-- CreateEnum
CREATE TYPE "ItemPriority" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "priority" "ItemPriority" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Subtask" ADD COLUMN     "priority" "ItemPriority" NOT NULL DEFAULT 'NONE';
