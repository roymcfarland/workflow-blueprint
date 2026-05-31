-- CreateIndex
CREATE INDEX "Subtask_taskId_sortOrder_idx" ON "Subtask"("taskId", "sortOrder");

-- CreateIndex
CREATE INDEX "Task_boardId_status_sortOrder_idx" ON "Task"("boardId", "status", "sortOrder");
