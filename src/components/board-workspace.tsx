"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Flag,
  GripVertical,
  NotebookPen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Sparkles,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  type Control,
  type UseFormRegister,
} from "react-hook-form";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintCard } from "@/components/blueprint/card";
import { BlueprintCheckbox } from "@/components/blueprint/checkbox";
import { BlueprintInput } from "@/components/blueprint/input";
import { Field } from "@/components/blueprint/field";
import { PageTitle } from "@/components/blueprint/page-title";
import { SaveIndicator, type SaveStatus } from "@/components/blueprint/save-indicator";
import { BlueprintTextarea } from "@/components/blueprint/textarea";
import {
  boardStatuses,
  itemPriorities,
  priorityLabels,
  statusLabels,
  type ItemPriority,
  type TaskStatus,
} from "@/lib/domain";
import {
  ARCHIVE_MODE_DEFAULT,
  NOTES_OPEN_DEFAULT,
  VIEW_MODE_DEFAULT,
  readArchiveMode,
  readNotesOpen,
  readViewMode,
  writeArchiveMode,
  writeNotesOpen,
  writeViewMode,
  type ArchiveMode,
  type ViewMode,
} from "@/lib/board-preferences";
import type { BoardSnapshot, SerializedTask } from "@/lib/data";
import { formatShortDate, cn } from "@/lib/utils";
import type { TaskInput } from "@/lib/validators";

const boardViewOptions = [
  { label: "Board", value: "board" },
  { label: "List", value: "list" },
] as const;

const archiveOptions = [
  { label: "Show", value: "on" },
  { label: "Hide", value: "off" },
] as const;

function formatApiFailure(
  response: Response,
  message: string | undefined,
  fallback: string,
): string {
  const base = message?.trim() ? message.trim() : fallback;
  if (response.status === 429) {
    const retry = response.headers.get("Retry-After");
    return retry ? `${base} Try again in ${retry}s.` : base;
  }
  return base;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const apply = () => setReduced(mq.matches);

    apply();
    mq.addEventListener("change", apply);

    return () => mq.removeEventListener("change", apply);
  }, []);

  return reduced;
}

const statusAccentTokens: Record<TaskStatus, string> = {
  ARCHIVED: "--status-archived",
  DONE: "--status-done",
  ICE_BOX: "--status-ice-box",
  IN_PROGRESS: "--status-in-progress",
  ON_DECK: "--status-on-deck",
};

const kanbanLaneItemClassName = "w-[min(86vw,21rem)] shrink-0 sm:w-80 lg:w-[21rem]";

const activeBoardStatuses: TaskStatus[] = ["ON_DECK", "IN_PROGRESS", "DONE"];
const defaultNewTaskStatus: TaskStatus = "ON_DECK";

function getStatusAccentStyle(status: TaskStatus): CSSProperties {
  return { backgroundColor: `var(${statusAccentTokens[status]})` };
}

function completedSubtaskCount(task: SerializedTask) {
  return task.subtasks.filter((subtask) => subtask.isComplete).length;
}

function formatSubtaskSummary(task: SerializedTask) {
  if (task.subtasks.length === 0) {
    return "No subtasks";
  }

  return `${completedSubtaskCount(task)}/${task.subtasks.length} subtasks`;
}

function isDueSoon(task: SerializedTask) {
  if (!task.dueDate || !activeBoardStatuses.includes(task.status)) {
    return false;
  }

  const dueDate = new Date(task.dueDate);
  const today = new Date();
  const sevenDaysFromNow = new Date();
  today.setHours(0, 0, 0, 0);
  sevenDaysFromNow.setDate(today.getDate() + 7);
  sevenDaysFromNow.setHours(23, 59, 59, 999);

  return dueDate >= today && dueDate <= sevenDaysFromNow;
}

function isOverdue(task: SerializedTask) {
  if (!task.dueDate || !activeBoardStatuses.includes(task.status)) {
    return false;
  }
  const dueDate = new Date(task.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
}

function groupTasks(tasks: SerializedTask[]) {
  return Object.fromEntries(
    boardStatuses.map((status) => [
      status,
      tasks
        .filter((task) => task.status === status)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    ]),
  ) as Record<TaskStatus, SerializedTask[]>;
}

function normalizeTasks(tasks: SerializedTask[]) {
  const grouped = groupTasks(tasks);

  return boardStatuses.flatMap((status) =>
    grouped[status].map((task, index) => ({
      ...task,
      sortOrder: index,
    })),
  );
}

function columnId(status: TaskStatus) {
  return `column:${status}`;
}

function parseColumnId(value: string): TaskStatus | null {
  if (!value.startsWith("column:")) {
    return null;
  }

  const status = value.replace("column:", "") as TaskStatus;

  return boardStatuses.includes(status) ? status : null;
}

/** Stable signature for persisted order across columns — ignores numeric sortOrder churn. */
function tasksBoardLayoutSignature(tasks: SerializedTask[]): string {
  const grouped = groupTasks(tasks);
  return boardStatuses.map((status) => grouped[status].map((task) => task.id).join(",")).join("|");
}

/** Prefer pointer containment (scrollable lanes, dense columns), fall back for gaps between lanes. */
const kanbanCollisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length > 0) {
    return within;
  }
  return closestCenter(args);
};

function reorderTasks(tasks: SerializedTask[], activeId: string, overId: string) {
  const activeTask = tasks.find((task) => task.id === activeId);

  if (!activeTask) {
    return tasks;
  }

  const grouped = groupTasks(tasks);
  const activeStatus = activeTask.status;
  const overTask = tasks.find((task) => task.id === overId);
  const droppedOnColumnOnly = Boolean(parseColumnId(overId));

  const destinationStatus = overTask?.status ?? parseColumnId(overId);

  if (!destinationStatus) {
    return tasks;
  }

  // Dropping onto the lane chrome of the column you're already in is a no-op (avoids snapping to bottom).
  if (activeStatus === destinationStatus && !overTask && droppedOnColumnOnly) {
    return tasks;
  }

  if (activeStatus === destinationStatus && overTask) {
    const currentGroup = grouped[activeStatus];
    const activeIndex = currentGroup.findIndex((task) => task.id === activeId);
    const overIndex = currentGroup.findIndex((task) => task.id === overId);

    if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
      return tasks;
    }

    grouped[activeStatus] = arrayMove(currentGroup, activeIndex, overIndex).map((task, index) => ({
      ...task,
      sortOrder: index,
    }));

    return boardStatuses.flatMap((status) => grouped[status]);
  }

  grouped[activeStatus] = grouped[activeStatus].filter((task) => task.id !== activeId);

  const nextTask = {
    ...activeTask,
    status: destinationStatus,
  };
  const insertionIndex = overTask
    ? grouped[destinationStatus].findIndex((task) => task.id === overTask.id)
    : grouped[destinationStatus].length;

  grouped[destinationStatus] = [
    ...grouped[destinationStatus].slice(0, insertionIndex),
    nextTask,
    ...grouped[destinationStatus].slice(insertionIndex),
  ];

  return boardStatuses.flatMap((status) =>
    grouped[status].map((task, index) => ({
      ...task,
      sortOrder: index,
    })),
  );
}

function mergeTask(tasks: SerializedTask[], nextTask: SerializedTask) {
  const exists = tasks.some((task) => task.id === nextTask.id);
  const nextTasks = exists
    ? tasks.map((task) => (task.id === nextTask.id ? nextTask : task))
    : [...tasks, nextTask];

  return normalizeTasks(nextTasks);
}

function taskToInput(task: SerializedTask, title = task.title): TaskInput {
  return {
    title,
    description: task.description ?? null,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : null,
    priority: task.priority,
    subtasks: task.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      isComplete: subtask.isComplete,
      priority: subtask.priority,
    })),
  };
}

const priorityBadgeClass: Record<ItemPriority, string> = {
  NONE: "",
  LOW: "border-line-soft bg-surface-control text-text-muted",
  MEDIUM: "border-accent/40 bg-accent-soft text-text-primary",
  HIGH: "border-warning/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  URGENT: "border-danger/50 bg-danger-soft text-danger",
};

const priorityFlagButtonClass: Record<ItemPriority, string> = {
  NONE: "border-line-soft bg-surface-control text-text-muted",
  LOW: priorityBadgeClass.LOW,
  MEDIUM: priorityBadgeClass.MEDIUM,
  HIGH: priorityBadgeClass.HIGH,
  URGENT: priorityBadgeClass.URGENT,
};

const priorityFlagIconClass: Record<ItemPriority, string> = {
  NONE: "text-text-muted",
  LOW: "text-text-muted",
  MEDIUM: "text-brand",
  HIGH: "text-accent",
  URGENT: "text-danger",
};

function PriorityFlagIcon({
  className,
  priority,
}: {
  className?: string;
  priority: ItemPriority;
}) {
  return (
    <Flag
      className={cn(
        className,
        priorityFlagIconClass[priority],
        priority !== "NONE" && "fill-current",
      )}
    />
  );
}

function PriorityBadge({ priority }: { priority: ItemPriority }) {
  if (priority === "NONE") {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        priorityBadgeClass[priority],
      )}
    >
      {priorityLabels[priority]}
    </span>
  );
}

function prioritySelectClassName() {
  return "blueprint-control h-8 min-w-[5.75rem] shrink-0 rounded-md px-2 text-xs outline-none transition focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2";
}

function TaskMeta({ task }: { task: SerializedTask }) {
  const overdue = isOverdue(task);
  const dueSoon = !overdue && isDueSoon(task);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-muted">
      <PriorityBadge priority={task.priority} />
      {task.dueDate ? (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-line-soft bg-surface-control px-2 py-1",
            overdue && "border-danger/40 bg-danger-soft text-danger",
            dueSoon && "border-accent bg-accent-soft text-text-primary",
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {formatShortDate(task.dueDate)}
        </span>
      ) : null}
      <span className="inline-flex rounded-md border border-line-soft bg-surface-control px-2 py-1">
        {formatSubtaskSummary(task)}
      </span>
    </div>
  );
}

function CompactToggle<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  value: T;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="blueprint-eyebrow">{label}</p>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-line-soft bg-surface-control p-1">
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              aria-pressed={active}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm font-semibold leading-none transition focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
                active
                  ? "blueprint-fill-flat text-white"
                  : "text-text-primary hover:bg-surface-control-hover",
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BoardHeaderControls({
  archiveMode,
  notesOpen,
  onArchiveModeChange,
  onNewTask,
  onToggleNotes,
  onViewModeChange,
  viewMode,
}: {
  archiveMode: ArchiveMode;
  notesOpen: boolean;
  onArchiveModeChange: (value: ArchiveMode) => void;
  onNewTask: () => void;
  onToggleNotes: () => void;
  onViewModeChange: (value: ViewMode) => void;
  viewMode: ViewMode;
}) {
  return (
    <div className="w-full rounded-lg border border-line-strong bg-surface-control p-2.5 sm:w-auto xl:shrink-0">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
        <BlueprintButton className="h-10 shrink-0 px-3.5" onClick={onNewTask} variant="hero">
          <Plus className="h-4 w-4" />
          New task
        </BlueprintButton>

        <div className="grid min-w-0 grid-cols-2 gap-2">
          <CompactToggle
            label="View"
            onChange={onViewModeChange}
            options={boardViewOptions}
            value={viewMode}
          />
          <CompactToggle
            label="Archived"
            onChange={onArchiveModeChange}
            options={archiveOptions}
            value={archiveMode}
          />
        </div>

        <BlueprintButton
          aria-label={notesOpen ? "Hide notes" : "Show notes"}
          aria-pressed={notesOpen}
          className="h-10 shrink-0 px-3"
          onClick={onToggleNotes}
          variant="outline"
        >
          {notesOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Notes</span>
        </BlueprintButton>
      </div>
    </div>
  );
}

function NotesPanel({
  className,
  noteDraft,
  noteStatus,
  noteMessage,
  onChange,
  onClose,
}: {
  className?: string;
  noteDraft: string;
  noteStatus: SaveStatus;
  noteMessage: string | null;
  onChange: (value: string) => void;
  onClose?: () => void;
}) {
  return (
    <BlueprintCard className={cn("flex flex-col p-0", className)} surface="flat">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
        <div className="flex items-center gap-2 text-text-primary">
          <NotebookPen className="h-4 w-4" />
          <h2 className="blueprint-display text-lg">Notes</h2>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator message={noteMessage} status={noteStatus} />
          {onClose ? (
            <button
              aria-label="Hide notes"
              className="blueprint-action rounded-md p-1"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <BlueprintTextarea
          className="h-full min-h-[16rem] resize-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:outline-none"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Drop links, decisions, and follow-ups here. Saved automatically."
          value={noteDraft}
        />
      </div>
    </BlueprintCard>
  );
}

type PanelSubtaskRow = {
  key: string;
  serverId?: string;
  title: string;
  isComplete: boolean;
  priority: ItemPriority;
};

type PanelTaskSaveHandler = (
  values: TaskInput,
  taskId: string,
  options?: { closeDrawer?: boolean },
) => Promise<void>;

type TaskUpdatedHandler = (task: SerializedTask) => void;

const SUBTASK_TITLE_SAVE_DELAY_MS = 600;

type PanelRowsUpdater =
  | PanelSubtaskRow[]
  | ((current: PanelSubtaskRow[]) => PanelSubtaskRow[]);

function rowsFromTask(task: SerializedTask): PanelSubtaskRow[] {
  return [...task.subtasks]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({
      key: s.id,
      serverId: s.id,
      title: s.title,
      isComplete: s.isComplete,
      priority: s.priority,
    }));
}

function normalizeSubtaskTitle(title: string) {
  return title.trim() || "Untitled";
}

function setStringSetMembership(
  current: Set<string>,
  key: string,
  shouldInclude: boolean,
) {
  if (current.has(key) === shouldInclude) {
    return current;
  }

  const next = new Set(current);
  if (shouldInclude) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return next;
}

function buildTaskInputFromPanel(
  task: SerializedTask,
  taskPriority: ItemPriority,
  rows: PanelSubtaskRow[],
): TaskInput {
  return {
    ...taskToInput(task),
    priority: taskPriority,
    subtasks: rows.map((r) => ({
      ...(r.serverId ? { id: r.serverId } : {}),
      title: normalizeSubtaskTitle(r.title),
      isComplete: r.isComplete,
      priority: r.priority,
    })),
  };
}

function PanelSubtaskEditorRow({
  disabled = false,
  isSaving = false,
  onPriorityChange,
  onRemove,
  onTitleBlur,
  onTitleCancel,
  onTitleChange,
  onTitleFocus,
  onTitleFlush,
  onToggleComplete,
  row,
}: {
  disabled?: boolean;
  isSaving?: boolean;
  row: PanelSubtaskRow;
  onPriorityChange: (priority: ItemPriority) => void;
  onRemove: () => void;
  onTitleBlur: (title: string) => void;
  onTitleCancel: () => void;
  onTitleChange: (title: string) => void;
  onTitleFocus: () => void;
  onTitleFlush: (title: string) => void;
  onToggleComplete: () => void;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition } =
    useSortable({ id: row.key });

  return (
    <div
      aria-busy={isSaving || undefined}
      ref={setNodeRef}
      className={cn(
        "group flex items-center gap-2 rounded-md border border-line-soft bg-surface-base px-2 py-1.5 transition",
        row.isComplete && "border-success/30 bg-success-soft",
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        aria-label="Reorder subtask"
        className="shrink-0 text-text-muted"
        disabled={disabled}
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <input
        checked={row.isComplete}
        className={cn(
          "h-4 w-4 shrink-0 rounded border-line-strong",
          row.isComplete ? "accent-success" : "accent-brand",
        )}
        disabled={disabled}
        onChange={onToggleComplete}
        type="checkbox"
      />
      <input
        aria-label="Subtask title"
        className={cn(
          "min-w-0 flex-1 rounded-md border border-line-soft bg-surface-control px-2 py-1 text-sm font-semibold text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-brand",
          row.isComplete && "text-text-muted line-through",
        )}
        disabled={disabled}
        maxLength={180}
        onBlur={(e) => onTitleBlur(e.currentTarget.value)}
        onChange={(e) => onTitleChange(e.target.value)}
        onFocus={onTitleFocus}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onTitleFlush(e.currentTarget.value);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onTitleCancel();
          }
        }}
        placeholder="Untitled"
        value={row.title}
      />
      <div
        aria-label="Subtask priority"
        className="flex shrink-0 items-center justify-end gap-0.5"
        role="radiogroup"
      >
        {itemPriorities.map((priority) => {
          const selected = priority === row.priority;

          return (
            <button
              aria-checked={selected}
              aria-label={priorityLabels[priority]}
              className={cn(
                "flex h-7 items-center justify-center overflow-hidden rounded-md border transition-all focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                priorityFlagButtonClass[priority],
                selected
                  ? "w-7 opacity-100 ring-2 ring-brand"
                  : "pointer-events-none w-0 border-transparent opacity-0 group-hover:pointer-events-auto group-hover:w-7 group-hover:border group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:w-7 group-focus-within:border group-focus-within:opacity-100",
              )}
              disabled={disabled}
              key={priority}
              onClick={() => onPriorityChange(priority)}
              role="radio"
              type="button"
            >
              <PriorityFlagIcon className="h-4 w-4 shrink-0" priority={priority} />
            </button>
          );
        })}
      </div>
      <button
        aria-label="Remove subtask"
        className="shrink-0 text-text-muted transition hover:text-danger"
        disabled={disabled}
        onClick={onRemove}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function SubtasksCardPanel({
  onSave,
  onClose,
  onTaskUpdated,
  panelRef,
  task,
}: {
  onClose: () => void;
  onSave: PanelTaskSaveHandler;
  onTaskUpdated: TaskUpdatedHandler;
  panelRef: RefObject<HTMLDivElement | null>;
  task: SerializedTask;
}) {
  const [rows, setRows] = useState(() => rowsFromTask(task));
  const rowsRef = useRef(rows);
  const [taskPriority, setTaskPriority] = useState(task.priority);
  const [taskPrioritySaving, setTaskPrioritySaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const createQueueRef = useRef<Promise<void>>(Promise.resolve());
  const createdServerIdByTempKeyRef = useRef(new Map<string, string>());
  const locallySavedTitleByServerIdRef = useRef(new Map<string, string>());
  const serverTitleByIdRef = useRef(
    new Map(task.subtasks.map((subtask) => [subtask.id, subtask.title])),
  );
  const titleSaveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const titleSaveInFlightCountsRef = useRef(new Map<string, number>());
  const titleSaveVersionRef = useRef(new Map<string, number>());
  const pendingRowKeysRef = useRef(new Set<string>());
  const pendingCreateRowKeysRef = useRef(new Set<string>());
  const pendingTitleRowKeysRef = useRef(new Set<string>());
  const dirtyTitleRowKeysRef = useRef(new Set<string>());
  const focusedTitleRowKeysRef = useRef(new Set<string>());
  const [pendingRowKeys, setPendingRowKeys] = useState<Set<string>>(() => new Set());
  const [pendingCreateRowKeys, setPendingCreateRowKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingTitleRowKeys, setPendingTitleRowKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [dirtyTitleRowKeys, setDirtyTitleRowKeys] = useState<Set<string>>(() => new Set());
  const [focusedTitleRowKeys, setFocusedTitleRowKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const subtaskSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const taskSubtasksSignature = JSON.stringify(
    task.subtasks.map((subtask) => [
      subtask.id,
      subtask.sortOrder,
      subtask.title,
      subtask.priority,
      subtask.isComplete,
    ]),
  );
  const hasProtectedTitleRows =
    dirtyTitleRowKeys.size > 0 ||
    focusedTitleRowKeys.size > 0 ||
    pendingTitleRowKeys.size > 0;
  const isSaving =
    taskPrioritySaving ||
    pendingCreateRowKeys.size > 0 ||
    pendingRowKeys.size > 0 ||
    pendingTitleRowKeys.size > 0;

  const setRowsSafely = useCallback((updater: PanelRowsUpdater) => {
    const next = typeof updater === "function" ? updater(rowsRef.current) : updater;
    rowsRef.current = next;
    setRows(next);
  }, []);

  const markPendingRow = useCallback((rowKey: string, isPending: boolean) => {
    const next = setStringSetMembership(pendingRowKeysRef.current, rowKey, isPending);
    pendingRowKeysRef.current = next;
    setPendingRowKeys(next);
  }, []);

  const markPendingCreateRow = useCallback((rowKey: string, isPending: boolean) => {
    const next = setStringSetMembership(pendingCreateRowKeysRef.current, rowKey, isPending);
    pendingCreateRowKeysRef.current = next;
    setPendingCreateRowKeys(next);
  }, []);

  const markPendingTitle = useCallback((rowKey: string, isPending: boolean) => {
    const next = setStringSetMembership(pendingTitleRowKeysRef.current, rowKey, isPending);
    pendingTitleRowKeysRef.current = next;
    setPendingTitleRowKeys(next);
  }, []);

  const markDirtyTitle = useCallback((rowKey: string, isDirty: boolean) => {
    const next = setStringSetMembership(dirtyTitleRowKeysRef.current, rowKey, isDirty);
    dirtyTitleRowKeysRef.current = next;
    setDirtyTitleRowKeys(next);
  }, []);

  const markFocusedTitle = useCallback((rowKey: string, isFocused: boolean) => {
    const next = setStringSetMembership(focusedTitleRowKeysRef.current, rowKey, isFocused);
    focusedTitleRowKeysRef.current = next;
    setFocusedTitleRowKeys(next);
  }, []);

  const refreshTitlePending = useCallback(
    (rowKey: string) => {
      const hasInFlight = (titleSaveInFlightCountsRef.current.get(rowKey) ?? 0) > 0;
      markPendingTitle(rowKey, titleSaveTimersRef.current.has(rowKey) || hasInFlight);
    },
    [markPendingTitle],
  );

  const clearTitleTimer = useCallback(
    (rowKey: string) => {
      const timer = titleSaveTimersRef.current.get(rowKey);
      if (timer) {
        clearTimeout(timer);
        titleSaveTimersRef.current.delete(rowKey);
      }
      refreshTitlePending(rowKey);
    },
    [refreshTitlePending],
  );

  const trackTitleInFlight = useCallback(
    (rowKey: string, delta: 1 | -1) => {
      const current = titleSaveInFlightCountsRef.current.get(rowKey) ?? 0;
      const next = Math.max(0, current + delta);
      if (next > 0) {
        titleSaveInFlightCountsRef.current.set(rowKey, next);
      } else {
        titleSaveInFlightCountsRef.current.delete(rowKey);
      }
      refreshTitlePending(rowKey);
    },
    [refreshTitlePending],
  );

  const syncServerTitleCache = useCallback((nextTask: SerializedTask) => {
    serverTitleByIdRef.current = new Map(
      nextTask.subtasks.map((subtask) => [
        subtask.id,
        locallySavedTitleByServerIdRef.current.get(subtask.id) ?? subtask.title,
      ]),
    );
  }, []);

  const isTitleProtected = useCallback((rowKey: string) => {
    return (
      dirtyTitleRowKeysRef.current.has(rowKey) ||
      focusedTitleRowKeysRef.current.has(rowKey) ||
      pendingTitleRowKeysRef.current.has(rowKey)
    );
  }, []);

  const mergeRowsWithServerTask = useCallback(
    (nextTask: SerializedTask, currentRows: PanelSubtaskRow[]) => {
      const serverRows = rowsFromTask(nextTask);
      const localByKey = new Map(currentRows.map((row) => [row.key, row]));
      const localByServerId = new Map(
        currentRows.flatMap((row) => (row.serverId ? [[row.serverId, row]] : [])),
      );
      const tempKeyByServerId = new Map(
        [...createdServerIdByTempKeyRef.current.entries()].map(([tempKey, serverId]) => [
          serverId,
          tempKey,
        ]),
      );

      const mergedServerRows = serverRows.map((serverRow) => {
        const tempKey = serverRow.serverId ? tempKeyByServerId.get(serverRow.serverId) : undefined;
        const localRow =
          (tempKey ? localByKey.get(tempKey) : undefined) ??
          (serverRow.serverId ? localByServerId.get(serverRow.serverId) : undefined) ??
          localByKey.get(serverRow.key);
        const localKey = localRow?.key ?? serverRow.key;
        const shouldKeepTempKey = Boolean(tempKey && localRow && isTitleProtected(tempKey));
        const locallySavedTitle = serverRow.serverId
          ? locallySavedTitleByServerIdRef.current.get(serverRow.serverId)
          : undefined;
        let nextRow = shouldKeepTempKey ? { ...serverRow, key: tempKey! } : serverRow;

        if (locallySavedTitle && serverRow.title !== locallySavedTitle) {
          nextRow = { ...nextRow, title: locallySavedTitle };
        }

        if (localRow && isTitleProtected(localKey)) {
          nextRow = { ...nextRow, title: localRow.title };
        }

        if (localRow && pendingRowKeysRef.current.has(localKey)) {
          nextRow = {
            ...nextRow,
            isComplete: localRow.isComplete,
            priority: localRow.priority,
          };
        }

        return nextRow;
      });

      const pendingCreateRows = currentRows.filter(
        (row) => !row.serverId && pendingCreateRowKeysRef.current.has(row.key),
      );
      return [...mergedServerRows, ...pendingCreateRows];
    },
    [isTitleProtected],
  );

  const applyServerTask = useCallback(
    (nextTask: SerializedTask) => {
      syncServerTitleCache(nextTask);
      onTaskUpdated(nextTask);
      setRowsSafely((current) => mergeRowsWithServerTask(nextTask, current));
      setTaskPriority(nextTask.priority);
    },
    [mergeRowsWithServerTask, onTaskUpdated, setRowsSafely, syncServerTitleCache],
  );

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const titleSaveTimers = titleSaveTimersRef.current;
    return () => {
      titleSaveTimers.forEach((timer) => clearTimeout(timer));
      titleSaveTimers.clear();
    };
  }, []);

  useEffect(() => {
    syncServerTitleCache(task);
    if (hasProtectedTitleRows) {
      return;
    }

    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) {
        return;
      }

      setRowsSafely((current) => mergeRowsWithServerTask(task, current));
      setTaskPriority(task.priority);
    });

    return () => {
      mounted = false;
    };
  }, [
    hasProtectedTitleRows,
    mergeRowsWithServerTask,
    setRowsSafely,
    syncServerTitleCache,
    task,
    taskSubtasksSignature,
  ]);

  const fetchUpdatedTask = useCallback(async ({
    body,
    fallback,
    method,
    url,
  }: {
    body?: unknown;
    fallback: string;
    method: "DELETE" | "PATCH" | "POST";
    url: string;
  }) => {
    const response = await fetch(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      method,
    });
    const result = (await response.json().catch(() => null)) as {
      message?: string;
      ok?: boolean;
      task?: SerializedTask;
    } | null;

    if (!response.ok || !result?.task) {
      throw new Error(formatApiFailure(response, result?.message, fallback));
    }

    return result.task;
  }, []);

  const commitSubtaskMutation = useCallback(async ({
    applyOptimistic,
    rollback,
    request,
    rowKeys = [],
  }: {
    applyOptimistic: (currentRows: PanelSubtaskRow[]) => PanelSubtaskRow[];
    rollback: (
      currentRows: PanelSubtaskRow[],
      previousRows: PanelSubtaskRow[],
    ) => PanelSubtaskRow[];
    request: () => Promise<SerializedTask>;
    rowKeys?: string[];
  }) => {
    const previousRows = rowsRef.current;
    setError(null);
    rowKeys.forEach((rowKey) => markPendingRow(rowKey, true));
    setRowsSafely((current) => applyOptimistic(current));
    try {
      applyServerTask(await request());
    } catch (err) {
      setRowsSafely((current) => rollback(current, previousRows));
      setError(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      rowKeys.forEach((rowKey) => markPendingRow(rowKey, false));
    }
  }, [applyServerTask, markPendingRow, setRowsSafely]);

  const saveTaskPriority = async (nextPriority: ItemPriority) => {
    setError(null);
    setTaskPrioritySaving(true);
    try {
      await onSave(buildTaskInputFromPanel(task, nextPriority, rowsRef.current), task.id, {
        closeDrawer: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setTaskPrioritySaving(false);
    }
  };

  const requireServerId = (row: PanelSubtaskRow, message: string) => {
    if (row.serverId) {
      return row.serverId;
    }

    setError(message);
    return null;
  };

  const patchSubtask = (
    row: PanelSubtaskRow,
    body: Partial<Pick<PanelSubtaskRow, "isComplete" | "priority" | "title">>,
    fallback: string,
  ) => {
    if (pendingRowKeysRef.current.has(row.key) || pendingCreateRowKeysRef.current.has(row.key)) {
      return;
    }

    const subtaskId = requireServerId(
      row,
      "Wait for the subtask to finish saving before updating it.",
    );
    if (!subtaskId) {
      return;
    }

    void commitSubtaskMutation({
      applyOptimistic: (current) =>
        current.map((r) => (r.key === row.key ? { ...r, ...body } : r)),
      rollback: (current, previous) => {
        const previousRow = previous.find((r) => r.key === row.key);
        return previousRow
          ? current.map((r) => (r.key === row.key ? previousRow : r))
          : current;
      },
      request: () =>
        fetchUpdatedTask({
          body,
          fallback,
          method: "PATCH",
          url: `/api/subtasks/${subtaskId}`,
        }),
      rowKeys: [row.key],
    });
  };

  const handleSubtaskPriorityChange = (row: PanelSubtaskRow, priority: ItemPriority) => {
    if (priority === row.priority) {
      return;
    }

    patchSubtask(row, { priority }, "Unable to update subtask priority.");
  };

  const handleSubtaskRemove = (row: PanelSubtaskRow) => {
    if (pendingRowKeysRef.current.has(row.key) || pendingCreateRowKeysRef.current.has(row.key)) {
      return;
    }

    const subtaskId = requireServerId(
      row,
      "Wait for the subtask to finish saving before removing it.",
    );
    if (!subtaskId) {
      return;
    }

    void commitSubtaskMutation({
      applyOptimistic: (current) => current.filter((r) => r.key !== row.key),
      rollback: (current, previous) => {
        const previousIndex = previous.findIndex((r) => r.key === row.key);
        const previousRow = previous[previousIndex];
        if (!previousRow || current.some((r) => r.key === row.key)) {
          return current;
        }

        return [
          ...current.slice(0, Math.max(0, previousIndex)),
          previousRow,
          ...current.slice(Math.max(0, previousIndex)),
        ];
      },
      request: () =>
        fetchUpdatedTask({
          fallback: "Unable to remove subtask.",
          method: "DELETE",
          url: `/api/subtasks/${subtaskId}`,
        }),
      rowKeys: [row.key],
    });
  };

  const commitSubtaskTitle = async (rowKey: string, title: string) => {
    const row = rowsRef.current.find((r) => r.key === rowKey);
    if (!row?.serverId) {
      return;
    }

    const serverTitle = serverTitleByIdRef.current.get(row.serverId) ?? row.title;
    if (title === serverTitle) {
      markDirtyTitle(rowKey, false);
      refreshTitlePending(rowKey);
      return;
    }

    const version = (titleSaveVersionRef.current.get(rowKey) ?? 0) + 1;
    titleSaveVersionRef.current.set(rowKey, version);
    setError(null);
    trackTitleInFlight(rowKey, 1);
    try {
      const nextTask = await fetchUpdatedTask({
        body: { title },
        fallback: "Unable to rename subtask.",
        method: "PATCH",
        url: `/api/subtasks/${row.serverId}`,
      });

      if (titleSaveVersionRef.current.get(rowKey) !== version) {
        return;
      }

      locallySavedTitleByServerIdRef.current.set(row.serverId, title);
      applyServerTask(nextTask);
      const currentRow = rowsRef.current.find((r) => r.key === rowKey);
      if (currentRow && normalizeSubtaskTitle(currentRow.title) === title) {
        markDirtyTitle(rowKey, false);
      }
    } catch (err) {
      if (titleSaveVersionRef.current.get(rowKey) === version) {
        const fallbackTitle = serverTitleByIdRef.current.get(row.serverId) ?? serverTitle;
        setRowsSafely((current) =>
          current.map((r) => (r.key === rowKey ? { ...r, title: fallbackTitle } : r)),
        );
        markDirtyTitle(rowKey, false);
        setError(err instanceof Error ? err.message : "Unable to rename subtask.");
      }
    } finally {
      trackTitleInFlight(rowKey, -1);
    }
  };

  const scheduleSubtaskTitleSave = (rowKey: string, title: string) => {
    clearTitleTimer(rowKey);
    const row = rowsRef.current.find((r) => r.key === rowKey);
    if (!row?.serverId) {
      return;
    }

    const normalizedTitle = normalizeSubtaskTitle(title);
    const serverTitle = serverTitleByIdRef.current.get(row.serverId) ?? row.title;
    if (normalizedTitle === serverTitle) {
      refreshTitlePending(rowKey);
      return;
    }

    titleSaveTimersRef.current.set(
      rowKey,
      setTimeout(() => {
        titleSaveTimersRef.current.delete(rowKey);
        refreshTitlePending(rowKey);
        void commitSubtaskTitle(rowKey, normalizedTitle);
      }, SUBTASK_TITLE_SAVE_DELAY_MS),
    );
    markPendingTitle(rowKey, true);
  };

  const handleSubtaskTitleChange = (row: PanelSubtaskRow, title: string) => {
    const serverTitle = row.serverId ? serverTitleByIdRef.current.get(row.serverId) : row.title;
    setRowsSafely((current) =>
      current.map((r) => (r.key === row.key ? { ...r, title } : r)),
    );
    markDirtyTitle(row.key, title !== (serverTitle ?? ""));
    scheduleSubtaskTitleSave(row.key, title);
  };

  const handleSubtaskTitleFlush = (row: PanelSubtaskRow, title: string) => {
    const normalizedTitle = normalizeSubtaskTitle(title);
    clearTitleTimer(row.key);
    setRowsSafely((current) =>
      current.map((r) => (r.key === row.key ? { ...r, title: normalizedTitle } : r)),
    );
    markDirtyTitle(row.key, true);
    void commitSubtaskTitle(row.key, normalizedTitle);
  };

  const handleSubtaskTitleBlur = (row: PanelSubtaskRow, title: string) => {
    handleSubtaskTitleFlush(row, title);
    markFocusedTitle(row.key, false);
  };

  const handleSubtaskTitleCancel = (row: PanelSubtaskRow) => {
    clearTitleTimer(row.key);
    const serverTitle = row.serverId
      ? (serverTitleByIdRef.current.get(row.serverId) ?? row.title)
      : row.title;
    setRowsSafely((current) =>
      current.map((r) => (r.key === row.key ? { ...r, title: serverTitle } : r)),
    );
    markDirtyTitle(row.key, false);
  };

  const handleSubtaskToggle = (row: PanelSubtaskRow) => {
    const isComplete = !row.isComplete;
    patchSubtask(row, { isComplete }, "Unable to update subtask.");
  };

  const handleSubtaskDragEnd = (event: DragEndEvent) => {
    if (pendingCreateRowKeysRef.current.size > 0 || pendingRowKeysRef.current.size > 0) {
      return;
    }

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const currentRows = rowsRef.current;
    const oldIndex = currentRows.findIndex((r) => r.key === active.id);
    const newIndex = currentRows.findIndex((r) => r.key === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const next = arrayMove(currentRows, oldIndex, newIndex);
    const subtaskIds = next
      .map((r) => r.serverId)
      .filter((serverId): serverId is string => Boolean(serverId));

    if (subtaskIds.length !== next.length) {
      setError("Wait for the subtask to finish saving before reordering.");
      return;
    }

    void commitSubtaskMutation({
      applyOptimistic: () => next,
      rollback: (_current, previous) => previous,
      request: () =>
        fetchUpdatedTask({
          body: { subtaskIds },
          fallback: "Unable to reorder subtasks.",
          method: "POST",
          url: `/api/tasks/${task.id}/subtasks/reorder`,
        }),
      rowKeys: next.map((row) => row.key),
    });
  };

  const handleSubtaskAdd = (title: string, shouldRefocus: boolean) => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }

    const tempKey = crypto.randomUUID();
    const optimisticRow: PanelSubtaskRow = {
      key: tempKey,
      title: nextTitle,
      isComplete: false,
      priority: "NONE",
    };

    setAddTitle("");
    markPendingCreateRow(tempKey, true);
    setRowsSafely((current) => [...current, optimisticRow]);

    const createRequest = async () => {
      const knownServerIds = new Set(
        rowsRef.current
          .map((row) => row.serverId)
          .filter((serverId): serverId is string => Boolean(serverId)),
      );

      try {
        setError(null);
        const nextTask = await fetchUpdatedTask({
          body: { priority: "NONE", title: nextTitle },
          fallback: "Unable to add subtask.",
          method: "POST",
          url: `/api/tasks/${task.id}/subtasks`,
        });
        const createdRow = rowsFromTask(nextTask).find(
          (row) => row.serverId && !knownServerIds.has(row.serverId),
        );
        if (createdRow?.serverId) {
          createdServerIdByTempKeyRef.current.set(tempKey, createdRow.serverId);
        }
        markPendingCreateRow(tempKey, false);
        applyServerTask(nextTask);
      } catch (err) {
        markPendingCreateRow(tempKey, false);
        setRowsSafely((current) => current.filter((row) => row.key !== tempKey));
        setError(err instanceof Error ? err.message : "Unable to add subtask.");
      }
    };

    const queuedCreate = createQueueRef.current.then(createRequest, createRequest);
    createQueueRef.current = queuedCreate.catch(() => undefined);
    void queuedCreate;

    if (shouldRefocus) {
      queueMicrotask(() => addInputRef.current?.focus());
    }
  };

  const subtaskDndId = `card-subtasks-${task.id}`;
  const completedCount = completedSubtaskCount(task);
  const subtaskCount = task.subtasks.length;
  const subtaskCompletionPercent = subtaskCount > 0 ? (completedCount / subtaskCount) * 100 : 0;
  const subtaskSummary = formatSubtaskSummary(task);

  return (
    <div
      ref={panelRef}
      className="max-h-[min(24rem,70vh)] overflow-y-auto border-t border-line-soft px-4 py-3"
      role="region"
      aria-label={`Subtasks for ${task.title}`}
    >
      <div className="mb-3 space-y-3 border-b border-line-soft pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-muted">
            <span>Task priority</span>
            <select
              className={prioritySelectClassName()}
              disabled={taskPrioritySaving}
              onChange={(e) => {
                const p = e.target.value as ItemPriority;
                setTaskPriority(p);
                void saveTaskPriority(p);
              }}
              value={taskPriority}
            >
              {itemPriorities.map((p) => (
                <option key={p} value={p}>
                  {priorityLabels[p]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            {isSaving ? <span className="text-xs text-text-muted">Saving…</span> : null}
            <button
              aria-label="Close subtasks"
              className="blueprint-action rounded-md p-1 text-text-muted"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p
              aria-label={`${subtaskSummary}, ${completedCount} done`}
              className="text-sm font-extrabold text-text-primary"
            >
              {completedCount}/{subtaskCount} done
            </p>
            {subtaskCount > 0 ? (
              <p className="text-xs font-semibold text-text-muted">
                {Math.round(subtaskCompletionPercent)}%
              </p>
            ) : null}
          </div>
          {subtaskCount > 0 ? (
            <div
              aria-label={`${subtaskSummary} progress`}
              aria-valuemax={subtaskCount}
              aria-valuemin={0}
              aria-valuenow={completedCount}
              className="h-1.5 overflow-hidden rounded-full bg-surface-control"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${subtaskCompletionPercent}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <DndContext
        id={subtaskDndId}
        collisionDetection={closestCenter}
        onDragEnd={handleSubtaskDragEnd}
        sensors={subtaskSensors}
      >
        <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {rows.map((row) => (
              <PanelSubtaskEditorRow
                key={row.key}
                disabled={pendingCreateRowKeys.has(row.key) || pendingRowKeys.has(row.key)}
                isSaving={
                  pendingCreateRowKeys.has(row.key) ||
                  pendingRowKeys.has(row.key) ||
                  pendingTitleRowKeys.has(row.key)
                }
                onPriorityChange={(priority) => handleSubtaskPriorityChange(row, priority)}
                onRemove={() => handleSubtaskRemove(row)}
                onTitleBlur={(title) => handleSubtaskTitleBlur(row, title)}
                onTitleCancel={() => handleSubtaskTitleCancel(row)}
                onTitleChange={(title) => handleSubtaskTitleChange(row, title)}
                onTitleFlush={(title) => handleSubtaskTitleFlush(row, title)}
                onTitleFocus={() => markFocusedTitle(row.key, true)}
                onToggleComplete={() => handleSubtaskToggle(row)}
                row={row}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-2">
        <Plus className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <input
          aria-label="Add subtask"
          className="min-w-0 flex-1 rounded-md border border-line-soft bg-surface-control px-2 py-1 text-sm font-semibold text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-brand"
          maxLength={180}
          onBlur={(e) => handleSubtaskAdd(e.currentTarget.value, false)}
          onChange={(e) => setAddTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubtaskAdd(e.currentTarget.value, true);
            }
          }}
          placeholder="Add subtask"
          ref={addInputRef}
          value={addTitle}
        />
      </div>

      {error ? (
        <p className="mt-2 text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TaskPreview({
  dragHandle,
  task,
  subtasksMenuOpen,
  onOpen,
  onRename,
  onToggleSubtasksMenu,
  presentation,
  expandedContent,
}: {
  dragHandle?: React.ReactNode;
  task: SerializedTask;
  subtasksMenuOpen?: boolean;
  onOpen?: (task: SerializedTask) => void;
  onRename?: (task: SerializedTask, title: string) => Promise<void>;
  onToggleSubtasksMenu?: (taskId: string) => void;
  /** When true, a non-interactive grip is shown for drag overlay visuals only. */
  presentation?: boolean;
  /** Rendered inside the card surface, below the header — used for the inline subtask panel. */
  expandedContent?: React.ReactNode;
}) {
  return (
    <div className="blueprint-note w-full overflow-hidden text-left text-text-primary">
      <div className="h-1.5" style={getStatusAccentStyle(task.status)} />
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {onRename ? (
              <EditableTaskTitle
                className="break-words text-base font-semibold leading-snug text-text-primary"
                onRename={onRename}
                task={task}
              />
            ) : (
              <p className="break-words text-base font-semibold leading-snug">{task.title}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onToggleSubtasksMenu && !presentation ? (
              <button
                aria-expanded={subtasksMenuOpen}
                aria-label={subtasksMenuOpen ? "Close subtasks menu" : "Open subtasks menu"}
                className="blueprint-action rounded-md p-1"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSubtasksMenu(task.id);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                type="button"
              >
                {subtasksMenuOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : null}
            {onOpen ? <TaskDetailsButton onOpen={onOpen} task={task} /> : null}
            {dragHandle ??
              (presentation ? (
                <span aria-hidden className="inline-flex text-text-muted">
                  <GripVertical className="h-4 w-4" />
                </span>
              ) : (
                <GripVertical aria-hidden className="h-4 w-4 text-text-muted" />
              ))}
          </div>
        </div>

        <TaskMeta task={task} />
      </div>
      {expandedContent}
    </div>
  );
}

function SortableTaskCard({
  onOpen,
  onRename,
  onTaskUpdated,
  onToggleSubtasksPanel,
  panelRef,
  subtasksPanelTaskId,
  onSave,
  task,
}: {
  onOpen: (task: SerializedTask) => void;
  onRename: (task: SerializedTask, title: string) => Promise<void>;
  onTaskUpdated: TaskUpdatedHandler;
  onToggleSubtasksPanel: (taskId: string) => void;
  panelRef: RefObject<HTMLDivElement | null>;
  subtasksPanelTaskId: string | null;
  onSave: PanelTaskSaveHandler;
  task: SerializedTask;
}) {
  const subtasksMenuOpen = subtasksPanelTaskId === task.id;
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
  });
  const reduceMotion = usePrefersReducedMotion();

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative touch-manipulation select-none",
        isDragging ? "opacity-0" : "",
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: reduceMotion ? undefined : transition,
      }}
    >
      <TaskPreview
        dragHandle={
          <button
            aria-label={`Drag ${task.title}`}
            className="blueprint-action cursor-grab rounded-md p-1 active:cursor-grabbing"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
        expandedContent={
          subtasksMenuOpen ? (
            <SubtasksCardPanel
              key={task.id}
              onClose={() => onToggleSubtasksPanel(task.id)}
              onSave={onSave}
              onTaskUpdated={onTaskUpdated}
              panelRef={panelRef}
              task={task}
            />
          ) : null
        }
        onOpen={onOpen}
        onRename={onRename}
        onToggleSubtasksMenu={onToggleSubtasksPanel}
        subtasksMenuOpen={subtasksMenuOpen}
        task={task}
      />
    </div>
  );
}

function SortableListTaskRow({
  onOpen,
  onRename,
  onTaskUpdated,
  onToggleSubtasksPanel,
  panelRef,
  subtasksPanelTaskId,
  onSave,
  task,
}: {
  onOpen: (task: SerializedTask) => void;
  onRename: (task: SerializedTask, title: string) => Promise<void>;
  onTaskUpdated: TaskUpdatedHandler;
  onToggleSubtasksPanel: (taskId: string) => void;
  panelRef: RefObject<HTMLDivElement | null>;
  subtasksPanelTaskId: string | null;
  onSave: PanelTaskSaveHandler;
  task: SerializedTask;
}) {
  const subtasksMenuOpen = subtasksPanelTaskId === task.id;
  const reduceMotion = usePrefersReducedMotion();
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative touch-manipulation select-none",
        isDragging ? "opacity-0" : "",
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: reduceMotion ? undefined : transition,
      }}
    >
      <div className="overflow-hidden rounded-lg border border-line-strong bg-surface-control">
        <div className="h-1.5" style={getStatusAccentStyle(task.status)} />
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <EditableTaskTitle
              className="break-words text-base font-semibold text-text-primary"
              onRename={onRename}
              task={task}
            />
            <TaskMeta task={task} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-expanded={subtasksMenuOpen}
              aria-label={subtasksMenuOpen ? "Close subtasks menu" : "Open subtasks menu"}
              className="blueprint-action rounded-md p-1"
              onClick={() => onToggleSubtasksPanel(task.id)}
              onMouseDown={(event) => event.stopPropagation()}
              type="button"
            >
              {subtasksMenuOpen ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </button>
            <TaskDetailsButton onOpen={onOpen} task={task} />
            <button
              aria-label={`Drag ${task.title}`}
              className="blueprint-action cursor-grab rounded-md p-1 active:cursor-grabbing"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              ref={setActivatorNodeRef}
              type="button"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-5 w-5 text-text-muted" />
            </button>
          </div>
        </div>
        {subtasksPanelTaskId === task.id ? (
          <SubtasksCardPanel
            key={task.id}
            onClose={() => onToggleSubtasksPanel(task.id)}
            onSave={onSave}
            onTaskUpdated={onTaskUpdated}
            panelRef={panelRef}
            task={task}
          />
        ) : null}
      </div>
    </div>
  );
}

function EditableTaskTitle({
  className,
  onRename,
  task,
}: {
  className?: string;
  onRename: (task: SerializedTask, title: string) => Promise<void>;
  task: SerializedTask;
}) {
  const [draft, setDraft] = useState(task.title);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurSaveRef = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const cancel = () => {
    skipBlurSaveRef.current = true;
    setDraft(task.title);
    setMessage(null);
    setEditing(false);
  };

  const save = () => {
    if (isPending) {
      return;
    }

    const title = draft.trim();

    if (!title) {
      setMessage("Task title is required.");
      inputRef.current?.focus();
      return;
    }

    if (title === task.title) {
      setDraft(task.title);
      setMessage(null);
      setEditing(false);
      return;
    }

    startTransition(async () => {
      try {
        await onRename(task, title);
        setDraft(title);
        setMessage(null);
        setEditing(false);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to rename task.");
      }
    });
  };

  if (editing) {
    return (
      <div className="space-y-1">
        <input
          aria-label={`Task title for ${task.title}`}
          className="blueprint-control h-9 w-full rounded-md px-2 text-base font-semibold text-text-primary outline-none transition focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          disabled={isPending}
          maxLength={180}
          onBlur={() => {
            if (skipBlurSaveRef.current) {
              skipBlurSaveRef.current = false;
              return;
            }

            save();
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            setMessage(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
              event.currentTarget.blur();
            }
          }}
          ref={inputRef}
          value={draft}
        />
        {message ? <p className="text-xs font-semibold text-danger">{message}</p> : null}
      </div>
    );
  }

  return (
    <button
      aria-label={`Rename ${task.title}`}
      className={cn(
        "block w-full text-left transition hover:text-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
        className,
      )}
      onClick={() => {
        setDraft(task.title);
        setEditing(true);
      }}
      title="Rename task"
      type="button"
    >
      {task.title}
    </button>
  );
}

function TaskDetailsButton({
  onOpen,
  task,
}: {
  onOpen: (task: SerializedTask) => void;
  task: SerializedTask;
}) {
  return (
    <button
      aria-label={`Open ${task.title} details`}
      className="blueprint-action rounded-md p-1"
      onClick={() => onOpen(task)}
      title="Open details"
      type="button"
    >
      <SquarePen className="h-4 w-4" />
    </button>
  );
}

function QuickAddTask({
  onCreate,
  onOpenChange,
  open,
  status,
}: {
  onCreate: (title: string, status: TaskStatus) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  status: TaskStatus;
}) {
  const label = `Add task to ${statusLabels[status]}`;

  if (!open) {
    return (
      <button
        aria-label={label}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-soft px-3 py-2 text-sm font-semibold text-text-muted transition hover:border-line-strong hover:text-text-primary focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        onClick={() => onOpenChange(true)}
        title={label}
        type="button"
      >
        <Plus className="h-4 w-4" />
        Add task
      </button>
    );
  }

  return (
    <QuickAddTaskInput
      label={label}
      onCreate={onCreate}
      onOpenChange={onOpenChange}
      status={status}
    />
  );
}

function QuickAddTaskInput({
  label,
  onCreate,
  onOpenChange,
  status,
}: {
  label: string;
  onCreate: (title: string, status: TaskStatus) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  status: TaskStatus;
}) {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    const value = title.trim();
    if (!value || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onCreate(value, status);
      setTitle("");
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create task.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <input
        aria-label={label}
        className="blueprint-control h-9 w-full rounded-md px-3 text-sm outline-none transition focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        disabled={pending}
        onBlur={() => {
          if (!title.trim()) {
            onOpenChange(false);
          }
        }}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onOpenChange(false);
          }
        }}
        placeholder="Task title, then press Enter"
        ref={inputRef}
        value={title}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function ListViewStatusBody({
  onCreateTask,
  onQuickAddOpenChange,
  onOpenTask,
  onRenameTask,
  onSaveTask,
  onTaskUpdated,
  onToggleSubtasksPanel,
  panelRef,
  quickAddOpen,
  status,
  subtasksPanelTaskId,
  tasks,
}: {
  onCreateTask: (title: string, status: TaskStatus) => Promise<void>;
  onQuickAddOpenChange: (open: boolean) => void;
  onOpenTask: (task: SerializedTask) => void;
  onRenameTask: (task: SerializedTask, title: string) => Promise<void>;
  onToggleSubtasksPanel: (taskId: string) => void;
  onSaveTask: PanelTaskSaveHandler;
  onTaskUpdated: TaskUpdatedHandler;
  panelRef: RefObject<HTMLDivElement | null>;
  quickAddOpen: boolean;
  status: TaskStatus;
  subtasksPanelTaskId: string | null;
  tasks: SerializedTask[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId(status),
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[4.5rem] space-y-3 rounded-lg px-3 py-2 transition sm:p-4",
        isOver && tasks.length === 0 && "bg-brand-soft",
        isOver && tasks.length > 0 && "outline outline-2 -outline-offset-2 outline-brand/35",
      )}
    >
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        {tasks.map((task) => (
          <SortableListTaskRow
            key={task.id}
            onOpen={onOpenTask}
            onRename={onRenameTask}
            onSave={onSaveTask}
            onTaskUpdated={onTaskUpdated}
            onToggleSubtasksPanel={onToggleSubtasksPanel}
            panelRef={panelRef}
            subtasksPanelTaskId={subtasksPanelTaskId}
            task={task}
          />
        ))}
      </SortableContext>
      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-soft px-4 py-5 text-center text-sm text-text-muted">
          Nothing here yet — drag a card here from another lane.
        </div>
      ) : null}
      <QuickAddTask
        onCreate={onCreateTask}
        onOpenChange={onQuickAddOpenChange}
        open={quickAddOpen}
        status={status}
      />
    </div>
  );
}

function BoardColumn({
  onCreateTask,
  onQuickAddOpenChange,
  onOpenTask,
  onRenameTask,
  onToggleSubtasksPanel,
  onSaveTask,
  onTaskUpdated,
  panelRef,
  quickAddOpen,
  status,
  subtasksPanelTaskId,
  tasks,
}: {
  onCreateTask: (title: string, status: TaskStatus) => Promise<void>;
  onQuickAddOpenChange: (open: boolean) => void;
  onOpenTask: (task: SerializedTask) => void;
  onRenameTask: (task: SerializedTask, title: string) => Promise<void>;
  onToggleSubtasksPanel: (taskId: string) => void;
  onSaveTask: PanelTaskSaveHandler;
  onTaskUpdated: TaskUpdatedHandler;
  panelRef: RefObject<HTMLDivElement | null>;
  quickAddOpen: boolean;
  status: TaskStatus;
  subtasksPanelTaskId: string | null;
  tasks: SerializedTask[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId(status),
  });

  return (
    <div className="blueprint-surface-flat blueprint-surface-strong min-w-0 overflow-hidden">
      <div className="h-2" style={getStatusAccentStyle(status)} />
      <div className="border-b border-line-soft px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="blueprint-display text-lg text-text-primary sm:text-xl">
            {statusLabels[status]}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-md border border-line-soft bg-surface-control px-2 py-0.5 text-xs font-semibold text-text-primary">
              {tasks.length}
            </span>
          </div>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "blueprint-scrollbar min-h-[26rem] space-y-3 overflow-y-auto p-3 transition sm:min-h-[30rem] sm:p-4",
          isOver && "bg-brand-soft",
        )}
      >
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              onOpen={onOpenTask}
              onRename={onRenameTask}
              onSave={onSaveTask}
              onTaskUpdated={onTaskUpdated}
              onToggleSubtasksPanel={onToggleSubtasksPanel}
              panelRef={panelRef}
              subtasksPanelTaskId={subtasksPanelTaskId}
              task={task}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-soft px-4 py-6 text-center text-sm text-text-muted">
            Drop a task here
          </div>
        ) : null}
        <QuickAddTask
          onCreate={onCreateTask}
          onOpenChange={onQuickAddOpenChange}
          open={quickAddOpen}
          status={status}
        />
      </div>
    </div>
  );
}

function SortableSubtaskRow({
  control,
  fieldKey,
  hasId,
  index,
  onRemove,
  register,
}: {
  control: Control<TaskInput>;
  fieldKey: string;
  hasId: boolean;
  index: number;
  onRemove: () => void;
  register: UseFormRegister<TaskInput>;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition } =
    useSortable({ id: fieldKey });

  return (
    <div
      ref={setNodeRef}
      className="flex items-center gap-3 rounded-lg border border-line-strong bg-surface-control px-3 py-2.5"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        aria-label="Reorder subtask"
        className="shrink-0 text-text-muted"
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <Controller
        control={control}
        name={`subtasks.${index}.isComplete`}
        render={({ field }) => (
          <BlueprintCheckbox
            checked={Boolean(field.value)}
            onChange={(event) => field.onChange(event.target.checked)}
          />
        )}
      />
      <input
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        placeholder="Subtask title"
        {...register(`subtasks.${index}.title`)}
      />
      <select
        aria-label="Subtask priority"
        className={prioritySelectClassName()}
        {...register(`subtasks.${index}.priority`)}
      >
        {itemPriorities.map((p) => (
          <option key={p} value={p}>
            {priorityLabels[p]}
          </option>
        ))}
      </select>
      {hasId ? <input type="hidden" {...register(`subtasks.${index}.id`)} /> : null}
      <button
        aria-label="Remove subtask"
        className="text-text-muted transition hover:text-danger"
        onClick={onRemove}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function TaskDrawer({
  boardName,
  initialStatus,
  onClose,
  onDelete,
  onSave,
  open,
  task,
}: {
  boardName: string;
  initialStatus: TaskStatus;
  onClose: () => void;
  onDelete: (taskId: string) => Promise<void>;
  onSave: (values: TaskInput, taskId?: string, options?: { closeDrawer?: boolean }) => Promise<void>;
  open: boolean;
  task: SerializedTask | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<TaskInput>({
    defaultValues: {
      title: "",
      description: null,
      status: initialStatus,
      dueDate: null,
      priority: "NONE",
      subtasks: [],
    },
  });
  const { append, fields, move, remove } = useFieldArray({
    control,
    keyName: "fieldKey",
    name: "subtasks",
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    reset({
      title: task?.title ?? "",
      description: task?.description ?? null,
      status: task?.status ?? initialStatus,
      dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : null,
      priority: task?.priority ?? "NONE",
      subtasks:
        task?.subtasks.map((subtask) => ({
          id: subtask.id,
          title: subtask.title,
          isComplete: subtask.isComplete,
          priority: subtask.priority,
        })) ?? [],
    });
  }, [initialStatus, open, reset, task]);

  if (!open) {
    return null;
  }

  const subtaskFieldIds = fields.map((field) => field.fieldKey);
  const subtaskDndId = task ? `task-drawer-${task.id}-subtasks` : "task-drawer-new-subtasks";

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-foreground/30 backdrop-blur-sm">
      <button aria-label="Close task editor" className="flex-1" onClick={onClose} type="button" />

      <div className="blueprint-surface blueprint-surface-strong blueprint-scrollbar relative h-full w-full max-w-2xl overflow-y-auto rounded-none border-y-0 border-r-0 px-4 py-5 sm:px-8 sm:py-6">
        <button
          aria-label="Close task editor"
          className="absolute right-4 top-5 rounded-lg border border-line-strong p-2 text-text-primary transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 sm:right-6 sm:top-6"
          onClick={onClose}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-6 pt-10">
          <div className="space-y-2">
            <p className="blueprint-eyebrow">{boardName}</p>
            <h2 className="blueprint-display text-2xl text-text-primary sm:text-3xl">
              {task ? "Edit task" : "New task"}
            </h2>
          </div>

          <form
            className="space-y-5"
            onSubmit={handleSubmit((values) => {
              setMessage(null);
              startTransition(async () => {
                try {
                  await onSave(values, task?.id, { closeDrawer: true });
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Unable to save task.");
                }
              });
            })}
          >
            <Field error={errors.title?.message} label="Title">
              <BlueprintInput {...register("title", { required: "Title is required." })} />
            </Field>

            <Field label="Description">
              <BlueprintTextarea
                {...register("description")}
                placeholder="Capture context, outcomes, and any details worth keeping."
              />
            </Field>

            <div className="auto-fit-grid gap-4 [--auto-fit-min:14rem]">
              <Field label="Status">
                <select
                  className="blueprint-control h-11 w-full rounded-lg px-4 outline-none transition focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                  {...register("status")}
                >
                  {boardStatuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Due date (optional)">
                <BlueprintInput
                  type="date"
                  {...register("dueDate", {
                    setValueAs: (value) =>
                      value === "" || value === undefined ? null : value,
                  })}
                />
              </Field>

              <Field label="Priority">
                <select
                  className="blueprint-control h-11 w-full rounded-lg px-4 outline-none transition focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                  {...register("priority")}
                >
                  {itemPriorities.map((p) => (
                    <option key={p} value={p}>
                      {priorityLabels[p]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-text-primary">Subtasks</p>
                <BlueprintButton
                  onClick={() => append({ title: "", isComplete: false, priority: "NONE" })}
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                  Add subtask
                </BlueprintButton>
              </div>

              <DndContext
                id={subtaskDndId}
                collisionDetection={closestCenter}
                onDragEnd={(event) => {
                  const { active, over } = event;

                  if (!over || active.id === over.id) {
                    return;
                  }

                  const oldIndex = fields.findIndex((field) => field.fieldKey === active.id);
                  const newIndex = fields.findIndex((field) => field.fieldKey === over.id);

                  if (oldIndex >= 0 && newIndex >= 0) {
                    move(oldIndex, newIndex);
                  }
                }}
                sensors={sensors}
              >
                <SortableContext items={subtaskFieldIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <SortableSubtaskRow
                        control={control}
                        fieldKey={field.fieldKey}
                        hasId={Boolean(field.id)}
                        index={index}
                        key={field.fieldKey}
                        onRemove={() => remove(index)}
                        register={register}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {message ? (
              <p className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                {message}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:items-center sm:justify-between">
              {task ? (
                <BlueprintButton
                  className="justify-center"
                  disabled={isPending}
                  onClick={() => {
                    if (!window.confirm("Delete this task?")) {
                      return;
                    }

                    startTransition(async () => {
                      try {
                        await onDelete(task.id);
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : "Unable to delete task.");
                      }
                    });
                  }}
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete task
                </BlueprintButton>
              ) : (
                <span />
              )}

              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <BlueprintButton
                  className="justify-center"
                  onClick={onClose}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </BlueprintButton>
                <BlueprintButton className="justify-center" disabled={isPending} type="submit">
                  {isPending ? "Saving…" : "Save task"}
                </BlueprintButton>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function BoardWorkspace({
  autoOpenNewTask = false,
  board,
}: {
  autoOpenNewTask?: boolean;
  board: BoardSnapshot;
}) {
  const [tasks, setTasks] = useState(board.tasks);
  const [viewMode, setViewMode] = useState<ViewMode>(VIEW_MODE_DEFAULT);
  const [archiveMode, setArchiveMode] = useState<ArchiveMode>(ARCHIVE_MODE_DEFAULT);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [drawerTask, setDrawerTask] = useState<SerializedTask | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeQuickAddStatus, setActiveQuickAddStatus] = useState<TaskStatus | null>(
    autoOpenNewTask ? defaultNewTaskStatus : null,
  );
  const [drawerVersion, setDrawerVersion] = useState(0);
  const [subtasksPanelTaskId, setSubtasksPanelTaskId] = useState<string | null>(null);
  const subtasksPanelRef = useRef<HTMLDivElement | null>(null);
  const [noteDraft, setNoteDraft] = useState(board.noteContent);
  const [noteStatus, setNoteStatus] = useState<SaveStatus>("idle");
  const [noteMessage, setNoteMessage] = useState<string | null>(null);
  const [taskSaveStatus, setTaskSaveStatus] = useState<SaveStatus>("idle");
  const [taskSaveMessage, setTaskSaveMessage] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState<boolean>(NOTES_OPEN_DEFAULT);
  const boardDndId = `${board.slug}-tasks-dnd`;
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteAbortRef = useRef<AbortController | null>(null);
  const lastSavedNote = useRef(board.noteContent);
  const reorderGenerationRef = useRef(0);
  const reorderPersistChainRef = useRef(Promise.resolve());
  const tasksRef = useRef(tasks);

  useLayoutEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const tasksAtDragStartRef = useRef<SerializedTask[] | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 10,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    let mounted = true;

    queueMicrotask(() => {
      if (!mounted) {
        return;
      }

      setArchiveMode(readArchiveMode(board.slug) ?? ARCHIVE_MODE_DEFAULT);
      setViewMode(readViewMode(board.slug) ?? VIEW_MODE_DEFAULT);
      setNotesOpen(readNotesOpen(board.slug) ?? NOTES_OPEN_DEFAULT);
    });

    return () => {
      mounted = false;
    };
  }, [board.slug]);

  useEffect(() => {
    if (!subtasksPanelTaskId) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSubtasksPanelTaskId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [subtasksPanelTaskId]);

  const openTask = (task: SerializedTask) => {
    setDrawerVersion((value) => value + 1);
    setDrawerTask(task);
    setDrawerOpen(true);
  };

  useEffect(() => {
    if (noteDraft === lastSavedNote.current) {
      return;
    }

    setNoteStatus("saving");
    setNoteMessage(null);

    if (noteTimerRef.current) {
      clearTimeout(noteTimerRef.current);
    }

    noteAbortRef.current?.abort();

    const controller = new AbortController();
    const content = noteDraft;
    noteAbortRef.current = controller;

    noteTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/boards/${board.slug}/note`, {
          body: JSON.stringify({ content }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "PATCH",
          signal: controller.signal,
        });

        if (!response.ok) {
          const errBody = (await response.json().catch(() => null)) as { message?: string } | null;
          setNoteStatus("error");
          setNoteMessage(
            formatApiFailure(response, errBody?.message, "Unable to save notes."),
          );
          return;
        }

        lastSavedNote.current = content;
        setNoteStatus("saved");
        setNoteMessage(null);
        setTimeout(() => {
          setNoteStatus((status) => (status === "saved" ? "idle" : status));
        }, 1600);
      } catch (error) {
        if (!controller.signal.aborted) {
          setNoteStatus("error");
          setNoteMessage(error instanceof Error ? error.message : "Unable to save notes.");
        }
      } finally {
        if (noteAbortRef.current === controller) {
          noteAbortRef.current = null;
        }
      }
    }, 800);

    return () => {
      if (noteTimerRef.current) {
        clearTimeout(noteTimerRef.current);
      }

      controller.abort();
    };
  }, [board.slug, noteDraft]);

  const grouped = groupTasks(tasks);
  const visibleStatuses =
    archiveMode === "on" ? boardStatuses : boardStatuses.filter((status) => status !== "ARCHIVED");
  const isEmpty = tasks.length === 0;

  async function persistTaskOrder(nextTasks: SerializedTask[]) {
    const previous = reorderPersistChainRef.current;
    let release!: () => void;
    reorderPersistChainRef.current = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      const response = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: nextTasks.map((task) => ({
            taskId: task.id,
            status: task.status,
            sortOrder: task.sortOrder,
          })),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(
          formatApiFailure(response, body?.message, "Unable to persist task order."),
        );
      }
    } finally {
      release();
    }
  }

  async function handleSaveTask(
    values: TaskInput,
    taskId?: string,
    options?: { closeDrawer?: boolean },
  ) {
    const endpoint = taskId ? `/api/tasks/${taskId}` : `/api/boards/${board.slug}/tasks`;
    const method = taskId ? "PATCH" : "POST";
    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });
    const body = (await response.json()) as { message?: string; task?: SerializedTask };

    if (!response.ok || !body.task) {
      throw new Error(
        formatApiFailure(response, body.message, "Unable to save task."),
      );
    }

    setTasks((current) => mergeTask(current, body.task!));

    const shouldCloseDrawer = !taskId || options?.closeDrawer !== false;
    if (shouldCloseDrawer) {
      setDrawerOpen(false);
      setDrawerTask(null);
    }
    setTaskSaveStatus("saved");
    setTaskSaveMessage(taskId ? "Task updated" : "Task created");
    setTimeout(() => {
      setTaskSaveStatus("idle");
      setTaskSaveMessage(null);
    }, 1800);
  }

  async function handleQuickCreateTask(title: string, status: TaskStatus) {
    await handleSaveTask(
      { title, description: null, status, dueDate: null, priority: "NONE", subtasks: [] },
      undefined,
    );
  }

  const handleTaskUpdatedFromServer = useCallback((nextTask: SerializedTask) => {
    setTasks((current) => mergeTask(current, nextTask));
  }, []);

  async function handleRenameTask(task: SerializedTask, title: string) {
    await handleSaveTask(taskToInput(task, title), task.id, { closeDrawer: false });
  }

  async function handleDeleteTask(taskId: string) {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "DELETE",
    });
    const body = (await response.json()) as { message?: string };

    if (!response.ok) {
      throw new Error(formatApiFailure(response, body.message, "Unable to delete task."));
    }

    setTasks((current) => current.filter((task) => task.id !== taskId));
    setDrawerOpen(false);
    setDrawerTask(null);
    setTaskSaveStatus("saved");
    setTaskSaveMessage("Task removed");
    setTimeout(() => {
      setTaskSaveStatus("idle");
      setTaskSaveMessage(null);
    }, 1800);
  }

  const handleDragStart = (event: DragStartEvent) => {
    tasksAtDragStartRef.current = tasksRef.current.map((task) => ({
      ...task,
      subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
    }));
    setActiveTaskId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setTasks((prev) => {
      const next = reorderTasks(prev, String(active.id), String(over.id));
      if (tasksBoardLayoutSignature(next) === tasksBoardLayoutSignature(prev)) {
        return prev;
      }
      return next;
    });
  };

  const handleDragCancel = () => {
    setActiveTaskId(null);
    const snapshot = tasksAtDragStartRef.current;
    tasksAtDragStartRef.current = null;
    if (snapshot) {
      setTasks(snapshot);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTaskId(null);
    const baseline = tasksAtDragStartRef.current;
    tasksAtDragStartRef.current = null;

    const { active, over } = event;

    if (!over) {
      if (baseline) {
        setTasks(baseline);
      }
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const current = tasksRef.current;
    const next = reorderTasks(current, activeId, overId);

    if (tasksBoardLayoutSignature(next) !== tasksBoardLayoutSignature(current)) {
      setTasks(next);
    }

    const shouldPersist =
      baseline !== null &&
      tasksBoardLayoutSignature(next) !== tasksBoardLayoutSignature(baseline);

    if (!shouldPersist) {
      return;
    }

    const generation = ++reorderGenerationRef.current;

    try {
      await persistTaskOrder(next);
    } catch (error) {
      if (reorderGenerationRef.current === generation && baseline) {
        setTasks(baseline);
      }
      setTaskSaveStatus("error");
      setTaskSaveMessage(
        error instanceof Error ? error.message : "Unable to reorder tasks.",
      );
      setTimeout(() => {
        setTaskSaveStatus("idle");
        setTaskSaveMessage(null);
      }, 2400);
    }
  };

  const activeTask = activeTaskId ? tasks.find((task) => task.id === activeTaskId) : null;

  const toggleSubtasksPanel = (taskId: string) => {
    setSubtasksPanelTaskId((current) => (current === taskId ? null : taskId));
  };

  const handleArchiveModeChange = (nextArchiveMode: ArchiveMode) => {
    setArchiveMode(nextArchiveMode);
    writeArchiveMode(board.slug, nextArchiveMode);
  };

  const handleViewModeChange = useCallback(
    (nextViewMode: ViewMode) => {
      setViewMode(nextViewMode);
      writeViewMode(board.slug, nextViewMode);
    },
    [board.slug],
  );

  const handleToggleNotes = useCallback(() => {
    setNotesOpen((value) => {
      const next = !value;
      writeNotesOpen(board.slug, next);
      return next;
    });
  }, [board.slug]);

  const handleCloseNotes = useCallback(() => {
    setNotesOpen(false);
    writeNotesOpen(board.slug, false);
  }, [board.slug]);

  const boardArea = (
    <DndContext
      collisionDetection={kanbanCollisionDetection}
      id={boardDndId}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      {viewMode === "board" ? (
        <div className="blueprint-scrollbar flex min-w-0 snap-none items-start gap-4 overflow-x-auto overscroll-x-contain pb-3">
          {visibleStatuses.map((status) => (
            <div className={kanbanLaneItemClassName} key={status}>
              <BoardColumn
                onCreateTask={handleQuickCreateTask}
                onOpenTask={openTask}
                onQuickAddOpenChange={(open) => setActiveQuickAddStatus(open ? status : null)}
                onRenameTask={handleRenameTask}
                onSaveTask={handleSaveTask}
                onTaskUpdated={handleTaskUpdatedFromServer}
                onToggleSubtasksPanel={toggleSubtasksPanel}
                panelRef={subtasksPanelRef}
                quickAddOpen={activeQuickAddStatus === status}
                status={status}
                subtasksPanelTaskId={subtasksPanelTaskId}
                tasks={grouped[status]}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {visibleStatuses.map((status) => (
            <BlueprintCard className="space-y-4 p-4 sm:p-5" key={status} surface="flat">
              <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-3">
                <h2 className="blueprint-display text-lg text-text-primary sm:text-xl">
                  {statusLabels[status]}
                </h2>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-md border border-line-soft bg-surface-control px-2 py-0.5 text-xs font-semibold text-text-primary">
                    {grouped[status].length}
                  </span>
                </div>
              </div>
              <ListViewStatusBody
                onCreateTask={handleQuickCreateTask}
                onOpenTask={openTask}
                onQuickAddOpenChange={(open) => setActiveQuickAddStatus(open ? status : null)}
                onRenameTask={handleRenameTask}
                onSaveTask={handleSaveTask}
                onTaskUpdated={handleTaskUpdatedFromServer}
                onToggleSubtasksPanel={toggleSubtasksPanel}
                panelRef={subtasksPanelRef}
                quickAddOpen={activeQuickAddStatus === status}
                status={status}
                subtasksPanelTaskId={subtasksPanelTaskId}
                tasks={grouped[status]}
              />
            </BlueprintCard>
          ))}
        </div>
      )}

      <DragOverlay>
        {activeTaskId ? (
          <div className="w-[15rem]">
            {activeTask ? <TaskPreview presentation task={activeTask} /> : null}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 space-y-3">
          <PageTitle
            description={board.description ?? undefined}
            eyebrow="Board"
            title={board.name}
          />
        </div>

        <div className="flex flex-col items-stretch gap-3 xl:items-end">
          <BoardHeaderControls
            archiveMode={archiveMode}
            notesOpen={notesOpen}
            onArchiveModeChange={handleArchiveModeChange}
            onNewTask={() => setActiveQuickAddStatus(defaultNewTaskStatus)}
            onToggleNotes={handleToggleNotes}
            onViewModeChange={handleViewModeChange}
            viewMode={viewMode}
          />
          <div className="flex justify-end">
            <SaveIndicator message={taskSaveMessage} status={taskSaveStatus} />
          </div>
        </div>
      </div>

      {isEmpty ? (
        <BlueprintCard className="p-8 text-center sm:p-12" surface="flat">
          <div className="mx-auto max-w-md space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-line-strong bg-surface-control">
              <Sparkles className="h-6 w-6 text-brand" />
            </div>
            <div className="space-y-2">
              <h2 className="blueprint-display text-3xl text-text-primary">A blank canvas</h2>
              <p className="text-base text-text-muted">
                Sketch your first task to start filling out{" "}
                <span className="font-semibold text-text-primary">{board.name}</span>.
              </p>
            </div>
            <BlueprintButton onClick={() => setActiveQuickAddStatus(defaultNewTaskStatus)} variant="hero">
              <Plus className="h-4 w-4" />
              New task
            </BlueprintButton>
          </div>
        </BlueprintCard>
      ) : null}

      <div
        className={cn(
          "grid gap-5",
          notesOpen && "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]",
        )}
      >
        <div className="min-w-0">{boardArea}</div>
        {notesOpen ? (
          <NotesPanel
            className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
            noteDraft={noteDraft}
            noteMessage={noteMessage}
            noteStatus={noteStatus}
            onChange={setNoteDraft}
            onClose={handleCloseNotes}
          />
        ) : null}
      </div>

      <TaskDrawer
        boardName={board.name}
        initialStatus={defaultNewTaskStatus}
        key={drawerVersion}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerTask(null);
        }}
        onDelete={handleDeleteTask}
        onSave={handleSaveTask}
        open={drawerOpen}
        task={drawerTask}
      />
    </div>
  );
}
