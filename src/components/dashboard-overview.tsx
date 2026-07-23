"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  CheckCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

import { BoardIcon } from "@/components/board-icon";
import { apiTokenScopeLabels, scopeClassName } from "@/components/admin/api-tokens-admin";
import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintCard } from "@/components/blueprint/card";
import { PageTitle } from "@/components/blueprint/page-title";
import {
  DASHBOARD_SECTION_ORDER_DEFAULT,
  readDashboardSectionOrder,
  writeDashboardSectionOrder,
  type DashboardSectionId,
} from "@/lib/board-preferences";
import type { DashboardSnapshot, DashboardTaskSummary } from "@/lib/data";
import { getBoardAccentColor } from "@/lib/domain";
import { cn, formatShortDate } from "@/lib/utils";

const chartCenter = 160;
const chartRadius = 108;
const chartStrokeWidth = 38;
const chartCircumference = 2 * Math.PI * chartRadius;

function getTaskListKey(tasks: DashboardTaskSummary[]) {
  return tasks
    .map((task) =>
      [
        task.id,
        task.title,
        task.status,
        task.priority,
        task.dueDate ?? "",
        task.updatedAt,
        task.boardSlug,
        task.boardName,
        task.boardIconKey,
        task.subtasks.map((subtask) => `${subtask.id}:${subtask.isComplete}`).join(","),
      ].join(":"),
    )
    .join("|");
}

function NewTaskMenu({ boards }: { boards: DashboardSnapshot["boardBreakdown"] }) {
  const [open, setOpen] = useState(false);

  if (boards.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <BlueprintButton onClick={() => setOpen((value) => !value)} variant="hero">
        <Plus className="h-4 w-4" />
        New Task
      </BlueprintButton>
      {open ? (
        <>
          <button
            aria-hidden
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <div
            className="blueprint-surface absolute right-0 top-[calc(100%+0.5rem)] z-20 w-64 overflow-hidden p-1.5"
            role="menu"
          >
            <p className="px-3 pb-1 pt-2 text-xs font-semibold text-text-muted">
              Pick a board
            </p>
            {boards.map((board) => (
              <Link
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                href={`/boards/${board.slug}?new=1`}
                key={board.slug}
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                <BoardIcon className="h-4 w-4 text-brand" iconKey={board.iconKey} />
                <span className="truncate">{board.name}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function SnapshotPanel({
  data,
  dragHandle,
}: {
  data: DashboardSnapshot;
  dragHandle?: ReactNode;
}) {
  const completionArcLength = (data.completionRate / 100) * chartCircumference;
  const completionTooltip = "Done ÷ (Up Next + In Progress + Done)";

  return (
    <BlueprintCard className="p-5 lg:p-6" surface="flat">
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {dragHandle}
              <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">
                Snapshot
              </h2>
            </div>
            <p className="blueprint-eyebrow">of active work</p>
          </div>

          <div className="grid items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="mx-auto flex aspect-square w-44 items-center justify-center sm:w-52">
              <svg
                aria-label={`${data.completionRate}% of active work is done`}
                className="h-full w-full"
                role="img"
                viewBox="0 0 320 320"
              >
                <defs>
                  <pattern
                    height="6"
                    id="snapshot-ring-hatch"
                    patternTransform="rotate(-55)"
                    patternUnits="userSpaceOnUse"
                    width="6"
                  >
                    <rect fill="var(--brand-fill)" height="6" width="6" />
                    <rect fill="rgba(255, 255, 255, 0.16)" height="6" width="2" />
                  </pattern>
                </defs>
                <circle
                  cx={chartCenter}
                  cy={chartCenter}
                  fill="none"
                  r={chartRadius}
                  stroke="var(--brand-soft)"
                  strokeWidth={chartStrokeWidth}
                />
                <circle
                  cx={chartCenter}
                  cy={chartCenter}
                  fill="none"
                  r={chartRadius}
                  stroke="url(#snapshot-ring-hatch)"
                  strokeDasharray={`${completionArcLength} ${chartCircumference - completionArcLength}`}
                  strokeLinecap="round"
                  strokeWidth={chartStrokeWidth}
                  transform={`rotate(-90 ${chartCenter} ${chartCenter})`}
                />
                <text
                  fill="var(--text-primary)"
                  fontSize="58"
                  fontWeight="700"
                  textAnchor="middle"
                  x={chartCenter}
                  y={chartCenter + 4}
                >
                  {data.completionRate}%
                </text>
                <text
                  fill="var(--text-muted)"
                  fontSize="16"
                  fontWeight="700"
                  textAnchor="middle"
                  x={chartCenter}
                  y={chartCenter + 32}
                >
                  DONE
                </text>
              </svg>
            </div>

            <div className="space-y-2">
              {data.boardBreakdown.map((segment) => (
                <Link
                  className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-control px-3 py-2 text-text-primary transition hover:border-line-strong hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                  href={`/boards/${segment.slug}`}
                  key={segment.slug}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{
                        backgroundColor: segment.accentColor ?? getBoardAccentColor(segment.slug),
                      }}
                    />
                    <p className="truncate text-sm font-semibold">{segment.name}</p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold text-text-muted">
                    {segment.percentage}% · {segment.totalTasks}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t border-line-soft pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">
              Completion Rate
            </h2>
            <span className="blueprint-eyebrow cursor-help" title={completionTooltip}>
              formula
            </span>
          </div>
          <p className="text-base text-text-muted">
            Share of active work that&apos;s done. Active = Up Next + In Progress + Done.
          </p>
          <p className="text-5xl font-semibold leading-none text-text-primary sm:text-6xl">
            {data.completionRate}%
          </p>
          <div className="space-y-2">
            <div className="h-3 overflow-hidden rounded-full border border-line-strong bg-surface-control">
              <div
                className="blueprint-fill h-full rounded-full"
                style={{ width: `${data.completionRate}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-semibold text-text-muted">
              <span>{data.doneCount} done</span>
              <span>{data.activeTaskCount} active</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-lg border border-line-soft bg-surface-control p-3">
              <div className="flex items-center gap-2 text-text-muted">
                <ClipboardList className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">In Progress</span>
              </div>
              <p className="text-2xl font-semibold leading-tight text-text-primary">
                {data.inProgressCount}
              </p>
            </div>
            <div className="rounded-lg border border-line-soft bg-surface-control p-3">
              <div className="flex items-center gap-2 text-text-muted">
                <CheckCheck className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Closed (7d)</span>
              </div>
              <p className="text-2xl font-semibold leading-tight text-text-primary">
                {data.closedLastSevenDays}
              </p>
            </div>
          </div>
        </div>
      </div>
    </BlueprintCard>
  );
}

function InProgressPanel({
  tasks,
  dragHandle,
}: {
  tasks: DashboardTaskSummary[];
  dragHandle?: ReactNode;
}) {
  const router = useRouter();
  const [items, setItems] = useState(tasks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persistOrder(next: DashboardTaskSummary[]) {
    const previous = items;
    setItems(next);
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/in-progress/reorder", {
        body: JSON.stringify({ taskIds: next.map((task) => task.id) }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to save the new order.");
      }
    } catch (err) {
      setItems(previous);
      setError(err instanceof Error ? err.message : "Unable to save the new order.");
    } finally {
      setPending(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((task) => task.id === active.id);
    const newIndex = items.findIndex((task) => task.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    void persistOrder(arrayMove(items, oldIndex, newIndex));
  }

  async function markDone(taskId: string) {
    const previous = items;
    setItems((current) => current.filter((task) => task.id !== taskId));
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}/done`, {
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to mark the task done.");
      }

      router.refresh();
    } catch (err) {
      setItems(previous);
      setError(err instanceof Error ? err.message : "Unable to mark the task done.");
    } finally {
      setPending(false);
    }
  }

  return (
    <BlueprintCard className="p-5 lg:p-6" surface="flat">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {dragHandle}
            <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">
              In Progress
            </h2>
          </div>
          <ClipboardList className="h-5 w-5 text-text-muted" />
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-soft px-4 py-6 text-center text-sm text-text-muted">
            Nothing in progress right now.
          </p>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            id="dashboard-in-progress"
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <SortableContext
              items={items.map((task) => task.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {items.map((task) => (
                  <SortableInProgressRow
                    key={task.id}
                    onDone={markDone}
                    pending={pending}
                    task={task}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </BlueprintCard>
  );
}

function SortableInProgressRow({
  task,
  pending,
  onDone,
}: {
  task: DashboardTaskSummary;
  pending: boolean;
  onDone: (taskId: string) => void;
}) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  const [expanded, setExpanded] = useState(false);
  const [subtasks, setSubtasks] = useState(task.subtasks);
  const [subtaskPending, setSubtaskPending] = useState(false);
  const [subtaskError, setSubtaskError] = useState<string | null>(null);

  const hasSubtasks = subtasks.length > 0;
  const completedCount = subtasks.filter((subtask) => subtask.isComplete).length;
  const subtaskSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function toggleSubtask(subtaskId: string, isComplete: boolean) {
    const previous = subtasks;
    setSubtasks((current) =>
      current.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, isComplete } : subtask,
      ),
    );
    setSubtaskPending(true);
    setSubtaskError(null);

    try {
      const response = await fetch(`/api/subtasks/${subtaskId}`, {
        body: JSON.stringify({ isComplete }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Unable to update the subtask.");
      }

      router.refresh();
    } catch (err) {
      setSubtasks(previous);
      setSubtaskError(err instanceof Error ? err.message : "Unable to update the subtask.");
    } finally {
      setSubtaskPending(false);
    }
  }

  async function renameSubtask(subtaskId: string, title: string) {
    const previous = subtasks;
    setSubtasks((current) =>
      current.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, title } : subtask,
      ),
    );
    setSubtaskPending(true);
    setSubtaskError(null);

    try {
      const response = await fetch(`/api/subtasks/${subtaskId}`, {
        body: JSON.stringify({ title }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Unable to update the subtask.");
      }

      router.refresh();
    } catch (err) {
      setSubtasks(previous);
      setSubtaskError(err instanceof Error ? err.message : "Unable to update the subtask.");
    } finally {
      setSubtaskPending(false);
    }
  }

  async function deleteSubtask(subtaskId: string) {
    const previous = subtasks;
    setSubtasks((current) => current.filter((s) => s.id !== subtaskId));
    setSubtaskPending(true);
    setSubtaskError(null);
    try {
      const response = await fetch(`/api/subtasks/${subtaskId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Unable to delete the subtask.");
      }
      router.refresh();
    } catch (err) {
      setSubtasks(previous);
      setSubtaskError(err instanceof Error ? err.message : "Unable to delete the subtask.");
    } finally {
      setSubtaskPending(false);
    }
  }

  async function reorderSubtasks(next: typeof subtasks) {
    const previous = subtasks;
    setSubtasks(next);
    setSubtaskPending(true);
    setSubtaskError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}/subtasks/reorder`, {
        body: JSON.stringify({ subtaskIds: next.map((s) => s.id) }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Unable to reorder subtasks.");
      }
      router.refresh();
    } catch (err) {
      setSubtasks(previous);
      setSubtaskError(err instanceof Error ? err.message : "Unable to reorder subtasks.");
    } finally {
      setSubtaskPending(false);
    }
  }

  function handleSubtaskDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = subtasks.findIndex((s) => s.id === active.id);
    const newIndex = subtasks.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    void reorderSubtasks(arrayMove(subtasks, oldIndex, newIndex));
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-line-soft bg-surface-control",
        isDragging && "opacity-60",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {hasSubtasks ? (
            <button
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? `Hide subtasks for ${task.title}`
                  : `Show subtasks for ${task.title}`
              }
              className="shrink-0 text-text-muted transition hover:text-text-primary"
              onClick={() => setExpanded((value) => !value)}
              type="button"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span aria-hidden className="inline-block h-4 w-4 shrink-0" />
          )}
          <button
            aria-label={`Reorder ${task.title}`}
            className="shrink-0 cursor-grab text-text-muted active:cursor-grabbing"
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <BoardIcon
            className="h-4 w-4 shrink-0"
            iconKey={task.boardIconKey}
            style={{ color: task.boardAccentColor ?? getBoardAccentColor(task.boardSlug) }}
          />
          <div className="min-w-0">
            <Link
              className="block truncate text-sm font-semibold text-text-primary transition hover:text-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
              href={`/boards/${task.boardSlug}`}
            >
              {task.title}
            </Link>
            <p className="truncate text-xs text-text-muted">
              {task.boardName}
              {hasSubtasks ? ` · ${completedCount}/${subtasks.length}` : ""}
            </p>
          </div>
        </div>
        <button
          aria-label={`Mark ${task.title} done`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong transition disabled:opacity-30"
          disabled={pending}
          onClick={() => onDone(task.id)}
          style={{ color: "var(--status-done)" }}
          type="button"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>

      {expanded && hasSubtasks ? (
        <div className="space-y-1.5 border-t border-line-soft py-2 pl-9 pr-3">
          {subtaskError ? <p className="text-xs text-danger">{subtaskError}</p> : null}
          <DndContext
            collisionDetection={closestCenter}
            id={`dashboard-subtasks-${task.id}`}
            onDragEnd={handleSubtaskDragEnd}
            sensors={subtaskSensors}
          >
            <SortableContext
              items={subtasks.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {subtasks.map((subtask) => (
                  <SortableDashboardSubtaskRow
                    key={subtask.id}
                    disabled={subtaskPending}
                    onDelete={deleteSubtask}
                    onRename={renameSubtask}
                    onToggle={toggleSubtask}
                    subtask={subtask}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : null}
    </div>
  );
}

function SortableDashboardSubtaskRow({
  subtask,
  disabled,
  onToggle,
  onDelete,
  onRename,
}: {
  subtask: DashboardTaskSummary["subtasks"][number];
  disabled: boolean;
  onToggle: (subtaskId: string, isComplete: boolean) => void;
  onDelete: (subtaskId: string) => void;
  onRename: (subtaskId: string, title: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(subtask.title);
  const editSettledRef = useRef(false);
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subtask.id });

  function startEditing() {
    if (disabled) {
      return;
    }
    editSettledRef.current = false;
    setDraftTitle(subtask.title);
    setIsEditing(true);
  }

  function commitEditing() {
    if (editSettledRef.current) {
      return;
    }
    editSettledRef.current = true;

    const title = draftTitle.trim();
    setIsEditing(false);

    if (!title || title === subtask.title) {
      setDraftTitle(subtask.title);
      return;
    }

    setDraftTitle(title);
    onRename(subtask.id, title);
  }

  function cancelEditing() {
    if (editSettledRef.current) {
      return;
    }
    editSettledRef.current = true;
    setDraftTitle(subtask.title);
    setIsEditing(false);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEditing();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    }
  }

  return (
    <div
      className={cn("flex items-center gap-2 text-sm", isDragging && "opacity-60")}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        aria-label="Reorder subtask"
        className="shrink-0 cursor-grab text-text-muted active:cursor-grabbing"
        disabled={disabled}
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {isEditing ? (
        <input
          aria-label={`Subtask title for ${subtask.title}`}
          autoFocus
          className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-text-primary outline-none transition focus:border-brand disabled:opacity-30"
          disabled={disabled}
          onBlur={commitEditing}
          onChange={(event) => setDraftTitle(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={handleInputKeyDown}
          type="text"
          value={draftTitle}
        />
      ) : (
        <button
          aria-label={`Edit subtask ${subtask.title}`}
          className={cn(
            "min-w-0 flex-1 text-left text-text-primary transition disabled:cursor-not-allowed disabled:opacity-30",
            subtask.isComplete && "text-text-muted line-through",
          )}
          disabled={disabled}
          onClick={startEditing}
          type="button"
        >
          {subtask.title}
        </button>
      )}
      <button
        aria-label={subtask.isComplete ? "Mark subtask incomplete" : "Mark subtask complete"}
        aria-pressed={subtask.isComplete}
        className={cn(
          "shrink-0 transition",
          subtask.isComplete ? "text-success" : "text-text-muted hover:text-success",
        )}
        disabled={disabled}
        onClick={() => onToggle(subtask.id, !subtask.isComplete)}
        type="button"
      >
        <CircleCheck className="h-5 w-5" strokeWidth={2} />
      </button>
      <button
        aria-label="Remove subtask"
        className="shrink-0 text-text-muted transition hover:text-danger"
        disabled={disabled}
        onClick={() => onDelete(subtask.id)}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function DueTaskRow({
  onDone,
  pending,
  task,
  tone,
}: {
  onDone: (taskId: string) => void;
  pending: boolean;
  task: DashboardTaskSummary;
  tone: "overdue" | "due-soon";
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line-soft bg-surface-control px-3 py-2.5">
      <BoardIcon
        className="h-4 w-4 shrink-0"
        iconKey={task.boardIconKey}
        style={{ color: task.boardAccentColor ?? getBoardAccentColor(task.boardSlug) }}
      />
      <div className="min-w-0 flex-1">
        <Link
          className="block truncate text-sm font-semibold text-text-primary transition hover:text-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          href={`/boards/${task.boardSlug}`}
        >
          {task.title}
        </Link>
        <p className="truncate text-xs text-text-muted">{task.boardName}</p>
      </div>
      {task.dueDate ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line-soft bg-surface-control px-2 py-1 text-xs font-semibold text-text-muted",
            tone === "overdue" && "border-danger/40 bg-danger-soft text-danger",
            tone === "due-soon" && "border-accent bg-accent-soft text-text-primary",
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {formatShortDate(task.dueDate)}
        </span>
      ) : null}
      <button
        aria-label={`Mark ${task.title} done`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong transition disabled:opacity-30"
        disabled={pending}
        onClick={() => onDone(task.id)}
        style={{ color: "var(--status-done)" }}
        type="button"
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  );
}

function RecentlyCompletedRow({ task }: { task: DashboardTaskSummary }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line-soft bg-surface-control px-3 py-2.5">
      <BoardIcon
        className="h-4 w-4 shrink-0"
        iconKey={task.boardIconKey}
        style={{ color: task.boardAccentColor ?? getBoardAccentColor(task.boardSlug) }}
      />
      <div className="min-w-0 flex-1">
        <Link
          className="block truncate text-sm font-semibold text-text-primary transition hover:text-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          href={`/boards/${task.boardSlug}`}
        >
          {task.title}
        </Link>
        <p className="truncate text-xs text-text-muted">{task.boardName}</p>
      </div>
      {task.completedAt ? (
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold"
          style={{ borderColor: "var(--status-done)", color: "var(--status-done)" }}
        >
          <CircleCheck className="h-3.5 w-3.5" />
          {formatShortDate(task.completedAt)}
        </span>
      ) : null}
    </div>
  );
}

function RecentlyCompletedPanel({
  dragHandle,
  tasks,
}: {
  dragHandle?: ReactNode;
  tasks: DashboardTaskSummary[];
}) {
  return (
    <BlueprintCard className="p-5 lg:p-6" surface="flat">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {dragHandle}
          <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">
            Recently Completed
          </h2>
        </div>

        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-soft px-4 py-5 text-center text-sm text-text-muted">
            Nothing completed in the last 7 days yet.
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <RecentlyCompletedRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </BlueprintCard>
  );
}

function BoardHealthRow({ board }: { board: DashboardSnapshot["boardHealth"][number] }) {
  return (
    <Link
      className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-control px-3 py-2.5 transition hover:border-line-strong hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      href={`/boards/${board.slug}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <BoardIcon
          className="h-4 w-4 shrink-0"
          iconKey={board.iconKey}
          style={{ color: board.accentColor ?? getBoardAccentColor(board.slug) }}
        />
        <p className="truncate text-sm font-semibold text-text-primary">{board.name}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs font-semibold text-text-muted">
        {board.overdueCount > 0 ? (
          <span className="text-danger">{board.overdueCount} overdue</span>
        ) : null}
        <span>{board.openCount} open</span>
      </div>
    </Link>
  );
}

function BoardHealthPanel({
  boards,
  dragHandle,
}: {
  boards: DashboardSnapshot["boardHealth"];
  dragHandle?: ReactNode;
}) {
  return (
    <BlueprintCard className="p-5 lg:p-6" surface="flat">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {dragHandle}
          <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">Board Health</h2>
        </div>
        {boards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-soft px-4 py-5 text-center text-sm text-text-muted">
            Every board is caught up.
          </p>
        ) : (
          <div className="space-y-2">
            {boards.map((board) => (
              <BoardHealthRow board={board} key={board.slug} />
            ))}
          </div>
        )}
      </div>
    </BlueprintCard>
  );
}

function ActiveTokenRow({ token }: { token: DashboardSnapshot["activeTokens"][number] }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-control px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-sm font-semibold text-text-primary">{token.label}</p>
        <div className="flex flex-wrap gap-1.5">
          {token.scopes.map((scope) => (
            <span className={scopeClassName} key={scope}>
              {apiTokenScopeLabels[scope]}
            </span>
          ))}
        </div>
      </div>
      <p className="shrink-0 text-xs font-semibold text-text-muted">
        {token.lastUsedAt ? `Used ${formatShortDate(token.lastUsedAt)}` : "Never used"}
      </p>
    </div>
  );
}

function ActiveTokensPanel({
  dragHandle,
  tokens,
}: {
  dragHandle?: ReactNode;
  tokens: DashboardSnapshot["activeTokens"];
}) {
  return (
    <BlueprintCard className="p-5 lg:p-6" surface="flat">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {dragHandle}
            <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">Active Tokens</h2>
          </div>
          <Link
            className="text-xs font-semibold text-brand transition hover:text-brand-strong"
            href="/admin/api-tokens"
          >
            Manage
          </Link>
        </div>
        {tokens.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-soft px-4 py-5 text-center text-sm text-text-muted">
            No active API tokens yet.
          </p>
        ) : (
          <div className="space-y-2">
            {tokens.map((token) => (
              <ActiveTokenRow key={token.id} token={token} />
            ))}
          </div>
        )}
      </div>
    </BlueprintCard>
  );
}

function StaleTaskRow({
  onDone,
  pending,
  task,
}: {
  onDone: (taskId: string) => void;
  pending: boolean;
  task: DashboardTaskSummary;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line-soft bg-surface-control px-3 py-2.5">
      <BoardIcon
        className="h-4 w-4 shrink-0"
        iconKey={task.boardIconKey}
        style={{ color: task.boardAccentColor ?? getBoardAccentColor(task.boardSlug) }}
      />
      <div className="min-w-0 flex-1">
        <Link
          className="block truncate text-sm font-semibold text-text-primary transition hover:text-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          href={`/boards/${task.boardSlug}`}
        >
          {task.title}
        </Link>
        <p className="truncate text-xs text-text-muted">
          {task.boardName} · Last touched {formatShortDate(task.updatedAt)}
        </p>
      </div>
      <button
        aria-label={`Mark ${task.title} done`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong transition disabled:opacity-30"
        disabled={pending}
        onClick={() => onDone(task.id)}
        style={{ color: "var(--status-done)" }}
        type="button"
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  );
}

function NeedsAttentionPanel({
  dragHandle,
  tasks,
}: {
  dragHandle?: ReactNode;
  tasks: DashboardTaskSummary[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(tasks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markDone(taskId: string) {
    const previous = items;
    setItems((current) => current.filter((task) => task.id !== taskId));
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}/done`, {
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to mark the task done.");
      }

      router.refresh();
    } catch (err) {
      setItems(previous);
      setError(err instanceof Error ? err.message : "Unable to mark the task done.");
    } finally {
      setPending(false);
    }
  }

  return (
    <BlueprintCard className="p-5 lg:p-6" surface="flat">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {dragHandle}
            <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">
              Needs Attention
            </h2>
          </div>
          <span className="blueprint-eyebrow">14+ days untouched</span>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-soft px-4 py-5 text-center text-sm text-text-muted">
            Nothing&apos;s been sitting untouched — you&apos;re on top of it.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((task) => (
              <StaleTaskRow key={task.id} onDone={markDone} pending={pending} task={task} />
            ))}
          </div>
        )}
      </div>
    </BlueprintCard>
  );
}

function OnDeckRow({
  onDone,
  pending,
  task,
}: {
  onDone: (taskId: string) => void;
  pending: boolean;
  task: DashboardTaskSummary;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line-soft bg-surface-control px-3 py-2.5">
      <BoardIcon
        className="h-4 w-4 shrink-0"
        iconKey={task.boardIconKey}
        style={{ color: task.boardAccentColor ?? getBoardAccentColor(task.boardSlug) }}
      />
      <div className="min-w-0 flex-1">
        <Link
          className="block truncate text-sm font-semibold text-text-primary transition hover:text-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          href={`/boards/${task.boardSlug}`}
        >
          {task.title}
        </Link>
        <p className="truncate text-xs text-text-muted">
          {task.boardName} · Queued {formatShortDate(task.createdAt)}
        </p>
      </div>
      <button
        aria-label={`Mark ${task.title} done`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong transition disabled:opacity-30"
        disabled={pending}
        onClick={() => onDone(task.id)}
        style={{ color: "var(--status-done)" }}
        type="button"
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  );
}

function OnDeckPanel({
  dragHandle,
  tasks,
}: {
  dragHandle?: ReactNode;
  tasks: DashboardTaskSummary[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(tasks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markDone(taskId: string) {
    const previous = items;
    setItems((current) => current.filter((task) => task.id !== taskId));
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}/done`, {
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to mark the task done.");
      }

      router.refresh();
    } catch (err) {
      setItems(previous);
      setError(err instanceof Error ? err.message : "Unable to mark the task done.");
    } finally {
      setPending(false);
    }
  }

  return (
    <BlueprintCard className="p-5 lg:p-6" surface="flat">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {dragHandle}
          <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">On Deck</h2>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-soft px-4 py-5 text-center text-sm text-text-muted">
            Nothing queued up right now.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((task) => (
              <OnDeckRow key={task.id} onDone={markDone} pending={pending} task={task} />
            ))}
          </div>
        )}
      </div>
    </BlueprintCard>
  );
}

function OverdueDueSoonPanel({
  dragHandle,
  overdueTasks,
  upcomingTasks,
}: {
  dragHandle?: ReactNode;
  overdueTasks: DashboardTaskSummary[];
  upcomingTasks: DashboardTaskSummary[];
}) {
  const router = useRouter();
  const [overdueItems, setOverdueItems] = useState(overdueTasks);
  const [upcomingItems, setUpcomingItems] = useState(upcomingTasks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markDone(taskId: string) {
    const previousOverdue = overdueItems;
    const previousUpcoming = upcomingItems;
    setOverdueItems((current) => current.filter((task) => task.id !== taskId));
    setUpcomingItems((current) => current.filter((task) => task.id !== taskId));
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}/done`, {
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to mark the task done.");
      }

      router.refresh();
    } catch (err) {
      setOverdueItems(previousOverdue);
      setUpcomingItems(previousUpcoming);
      setError(err instanceof Error ? err.message : "Unable to mark the task done.");
    } finally {
      setPending(false);
    }
  }

  return (
    <BlueprintCard className="p-5 lg:p-6" surface="flat">
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {dragHandle}
              <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">Overdue</h2>
            </div>
            <span className="blueprint-eyebrow">{overdueItems.length}</span>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {overdueItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-soft px-4 py-5 text-center text-sm text-text-muted">
              Nothing overdue — nice work.
            </p>
          ) : (
            <div className="space-y-2">
              {overdueItems.map((task) => (
                <DueTaskRow
                  key={task.id}
                  onDone={markDone}
                  pending={pending}
                  task={task}
                  tone="overdue"
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-line-soft pt-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">Due Soon</h2>
            <span className="blueprint-eyebrow">next 7 days</span>
          </div>
          {upcomingItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-soft px-4 py-5 text-center text-sm text-text-muted">
              Nothing due in the next 7 days.
            </p>
          ) : (
            <div className="space-y-2">
              {upcomingItems.map((task) => (
                <DueTaskRow
                  key={task.id}
                  onDone={markDone}
                  pending={pending}
                  task={task}
                  tone="due-soon"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </BlueprintCard>
  );
}

const dayInMs = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function ThisWeekPanel({
  dragHandle,
  upcomingTasks,
}: {
  dragHandle?: ReactNode;
  upcomingTasks: DashboardTaskSummary[];
}) {
  const today = startOfUtcDay(new Date());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() + index * dayInMs);
    const count = upcomingTasks.filter((task) => {
      if (!task.dueDate) {
        return false;
      }

      return startOfUtcDay(new Date(task.dueDate)).getTime() === date.getTime();
    }).length;

    return { date, count };
  });
  const maxCount = Math.max(1, ...days.map((day) => day.count));
  const hasAnyDue = days.some((day) => day.count > 0);

  return (
    <BlueprintCard className="p-5 lg:p-6" surface="flat">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {dragHandle}
          <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">This Week</h2>
        </div>

        {hasAnyDue ? (
          <div className="grid grid-cols-7 gap-2">
            {days.map((day, index) => {
              const label =
                index === 0
                  ? "Today"
                  : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
                      day.date,
                    );

              return (
                <div
                  aria-label={`${label}: ${day.count} due`}
                  className="flex flex-col items-center gap-1.5"
                  key={day.date.toISOString()}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    {label}
                  </span>
                  <div
                    className={cn(
                      "flex h-16 w-full items-end justify-center rounded-md border bg-surface-control",
                      index === 0 ? "border-brand" : "border-line-soft",
                    )}
                  >
                    {day.count > 0 ? (
                      <div
                        className="blueprint-fill w-full rounded-md"
                        style={{ height: `${Math.max((day.count / maxCount) * 100, 18)}%` }}
                      />
                    ) : null}
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{day.count}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line-soft px-4 py-5 text-center text-sm text-text-muted">
            Nothing on the calendar this week.
          </p>
        )}
      </div>
    </BlueprintCard>
  );
}

function SortableSection({
  id,
  label,
  children,
}: {
  id: DashboardSectionId;
  label: string;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const dragHandle = (
    <button
      aria-label={`Reorder ${label} section`}
      className="shrink-0 cursor-grab text-text-muted active:cursor-grabbing"
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div
      className={cn(isDragging && "opacity-60")}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children(dragHandle)}
    </div>
  );
}

function DashboardSections({ data, isAdmin }: { data: DashboardSnapshot; isAdmin: boolean }) {
  const [order, setOrder] = useState<DashboardSectionId[]>(DASHBOARD_SECTION_ORDER_DEFAULT);
  const inProgressPanelKey = getTaskListKey(data.inProgressTasks);
  const overdueDueSoonPanelKey = getTaskListKey([...data.overdueTasks, ...data.upcomingTasks]);
  const staleTasksPanelKey = getTaskListKey(data.staleTasks);
  const onDeckPanelKey = getTaskListKey(data.onDeckTasks);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const stored = readDashboardSectionOrder();
    if (!stored) {
      return;
    }

    queueMicrotask(() => setOrder(stored));
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = order.indexOf(active.id as DashboardSectionId);
    const newIndex = order.indexOf(over.id as DashboardSectionId);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    writeDashboardSectionOrder(next);
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      id="dashboard-sections"
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {order.map((id) => {
            if (id === "snapshot") {
              return (
                <SortableSection id="snapshot" key="snapshot" label="Snapshot">
                  {(handle) => <SnapshotPanel data={data} dragHandle={handle} />}
                </SortableSection>
              );
            }

            if (id === "overdue-due-soon") {
              return (
                <SortableSection
                  id="overdue-due-soon"
                  key="overdue-due-soon"
                  label="Overdue & Due Soon"
                >
                  {(handle) => (
                    <OverdueDueSoonPanel
                      dragHandle={handle}
                      key={overdueDueSoonPanelKey}
                      overdueTasks={data.overdueTasks}
                      upcomingTasks={data.upcomingTasks}
                    />
                  )}
                </SortableSection>
              );
            }

            if (id === "this-week") {
              return (
                <SortableSection id="this-week" key="this-week" label="This Week">
                  {(handle) => <ThisWeekPanel dragHandle={handle} upcomingTasks={data.upcomingTasks} />}
                </SortableSection>
              );
            }

            if (id === "recently-completed") {
              return (
                <SortableSection
                  id="recently-completed"
                  key="recently-completed"
                  label="Recently Completed"
                >
                  {(handle) => (
                    <RecentlyCompletedPanel
                      dragHandle={handle}
                      tasks={data.recentlyCompletedTasks}
                    />
                  )}
                </SortableSection>
              );
            }

            if (id === "needs-attention") {
              return (
                <SortableSection id="needs-attention" key="needs-attention" label="Needs Attention">
                  {(handle) => (
                    <NeedsAttentionPanel
                      dragHandle={handle}
                      key={staleTasksPanelKey}
                      tasks={data.staleTasks}
                    />
                  )}
                </SortableSection>
              );
            }

            if (id === "on-deck") {
              return (
                <SortableSection id="on-deck" key="on-deck" label="On Deck">
                  {(handle) => (
                    <OnDeckPanel dragHandle={handle} key={onDeckPanelKey} tasks={data.onDeckTasks} />
                  )}
                </SortableSection>
              );
            }

            if (id === "board-health") {
              return (
                <SortableSection id="board-health" key="board-health" label="Board Health">
                  {(handle) => <BoardHealthPanel boards={data.boardHealth} dragHandle={handle} />}
                </SortableSection>
              );
            }

            if (id === "active-tokens") {
              if (!isAdmin) {
                return null;
              }

              return (
                <SortableSection id="active-tokens" key="active-tokens" label="Active Tokens">
                  {(handle) => <ActiveTokensPanel dragHandle={handle} tokens={data.activeTokens} />}
                </SortableSection>
              );
            }

            if (id === "in-progress") {
              return (
                <SortableSection id="in-progress" key="in-progress" label="In Progress">
                  {(handle) => (
                    <InProgressPanel
                      dragHandle={handle}
                      key={inProgressPanelKey}
                      tasks={data.inProgressTasks}
                    />
                  )}
                </SortableSection>
              );
            }

            return null;
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export function DashboardOverview({
  data,
  isAdmin = false,
}: {
  data: DashboardSnapshot;
  isAdmin?: boolean;
}) {
  const isEmpty = data.totalTaskCount === 0;

  return (
    <div className="fade-up space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle eyebrow="Overview" title="Dashboard" />
        {!isEmpty ? <NewTaskMenu boards={data.boardBreakdown} /> : null}
      </div>

      {isEmpty ? (
        <BlueprintCard className="p-8 text-center sm:p-12">
          <div className="mx-auto max-w-md space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-line-strong bg-surface-control">
              <Sparkles className="h-6 w-6 text-brand" />
            </div>
            <div className="space-y-2">
              <h2 className="blueprint-display text-3xl text-text-primary">
                Your blueprint is blank
              </h2>
              <p className="text-base text-text-muted">
                Sketch your first task on a board and your dashboard will fill in from there.
              </p>
            </div>
            {data.boardBreakdown.length > 0 ? (
              <NewTaskMenu boards={data.boardBreakdown} />
            ) : null}
          </div>
        </BlueprintCard>
      ) : (
        <DashboardSections data={data} isAdmin={isAdmin} />
      )}
    </div>
  );
}
