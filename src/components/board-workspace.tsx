"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
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
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
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
  statusLabels,
  type TaskStatus,
} from "@/lib/domain";
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

type ViewMode = (typeof boardViewOptions)[number]["value"];
type ArchiveMode = (typeof archiveOptions)[number]["value"];

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

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current);

  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }

  return next;
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

function reorderTasks(tasks: SerializedTask[], activeId: string, overId: string) {
  const activeTask = tasks.find((task) => task.id === activeId);

  if (!activeTask) {
    return tasks;
  }

  const grouped = groupTasks(tasks);
  const activeStatus = activeTask.status;
  const overTask = tasks.find((task) => task.id === overId);
  const destinationStatus = overTask?.status ?? parseColumnId(overId);

  if (!destinationStatus) {
    return tasks;
  }

  if (activeStatus === destinationStatus && overTask) {
    const currentGroup = grouped[activeStatus];
    const activeIndex = currentGroup.findIndex((task) => task.id === activeId);
    const overIndex = currentGroup.findIndex((task) => task.id === overId);

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
    subtasks: task.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      isComplete: subtask.isComplete,
    })),
  };
}

function TaskMeta({ task }: { task: SerializedTask }) {
  const overdue = isOverdue(task);
  const dueSoon = !overdue && isDueSoon(task);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-muted">
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

function SubtaskList({ task }: { task: SerializedTask }) {
  if (task.subtasks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 border-t border-line-soft pt-3 text-sm text-text-muted">
      {task.subtasks.map((subtask) => (
        <div className="flex items-start gap-2" key={subtask.id}>
          <span
            className={cn(
              "mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-line-strong",
              subtask.isComplete && "bg-brand",
            )}
          />
          <span className={cn("break-words", subtask.isComplete && "line-through opacity-70")}>
            {subtask.title}
          </span>
        </div>
      ))}
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

function TaskPreview({
  dragHandle,
  task,
  expanded,
  onOpen,
  onRename,
  onToggleExpand,
}: {
  dragHandle?: React.ReactNode;
  task: SerializedTask;
  expanded?: boolean;
  onOpen?: (task: SerializedTask) => void;
  onRename?: (task: SerializedTask, title: string) => Promise<void>;
  onToggleExpand?: (taskId: string) => void;
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
            {task.subtasks.length > 0 ? (
              <button
                aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
                className="blueprint-action rounded-md p-1"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpand?.(task.id);
                }}
                type="button"
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : null}
            {onOpen ? <TaskDetailsButton onOpen={onOpen} task={task} /> : null}
            {dragHandle ?? <GripVertical className="h-4 w-4 text-text-muted" />}
          </div>
        </div>

        <TaskMeta task={task} />

        {expanded ? <SubtaskList task={task} /> : null}
      </div>
    </div>
  );
}

function SortableTaskCard({
  expanded,
  onOpen,
  onRename,
  onToggleExpand,
  task,
}: {
  expanded: boolean;
  onOpen: (task: SerializedTask) => void;
  onRename: (task: SerializedTask, title: string) => Promise<void>;
  onToggleExpand: (taskId: string) => void;
  task: SerializedTask;
}) {
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

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(isDragging && "opacity-60")}
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
        expanded={expanded}
        onOpen={onOpen}
        onRename={onRename}
        onToggleExpand={onToggleExpand}
        task={task}
      />
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

function AddTaskToStatusButton({
  onNewTask,
  status,
}: {
  onNewTask: (status: TaskStatus) => void;
  status: TaskStatus;
}) {
  const label = `Add task to ${statusLabels[status]}`;

  return (
    <BlueprintButton
      aria-label={label}
      className="h-8 w-8 shrink-0 px-0 py-0"
      onClick={() => onNewTask(status)}
      title={label}
      type="button"
      variant="outline"
    >
      <Plus className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </BlueprintButton>
  );
}

function BoardColumn({
  expandedTaskIds,
  onNewTask,
  onOpenTask,
  onRenameTask,
  onToggleExpand,
  status,
  tasks,
}: {
  expandedTaskIds: Set<string>;
  onNewTask: (status: TaskStatus) => void;
  onOpenTask: (task: SerializedTask) => void;
  onRenameTask: (task: SerializedTask, title: string) => Promise<void>;
  onToggleExpand: (taskId: string) => void;
  status: TaskStatus;
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
            <AddTaskToStatusButton onNewTask={onNewTask} status={status} />
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
              expanded={expandedTaskIds.has(task.id)}
              key={task.id}
              onOpen={onOpenTask}
              onRename={onRenameTask}
              onToggleExpand={onToggleExpand}
              task={task}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-soft px-4 py-6 text-center text-sm text-text-muted">
            Drop a task here
          </div>
        ) : null}
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
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: fieldKey });

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
        className="text-text-muted"
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
  onSave: (values: TaskInput, taskId?: string) => Promise<void>;
  open: boolean;
  task: SerializedTask | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor));
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
      subtasks:
        task?.subtasks.map((subtask) => ({
          id: subtask.id,
          title: subtask.title,
          isComplete: subtask.isComplete,
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
                  await onSave(values, task?.id);
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

              <Field label="Due date">
                <BlueprintInput type="date" {...register("dueDate")} />
              </Field>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-text-primary">Subtasks</p>
                <BlueprintButton
                  onClick={() => append({ title: "", isComplete: false })}
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                  Add subtask
                </BlueprintButton>
              </div>

              <DndContext
                id={subtaskDndId}
                collisionDetection={closestCorners}
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
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [archiveMode, setArchiveMode] = useState<ArchiveMode>("on");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [drawerTask, setDrawerTask] = useState<SerializedTask | null>(null);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>(defaultNewTaskStatus);
  const [drawerOpen, setDrawerOpen] = useState(autoOpenNewTask ?? false);
  const [drawerVersion, setDrawerVersion] = useState(0);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [noteDraft, setNoteDraft] = useState(board.noteContent);
  const [noteStatus, setNoteStatus] = useState<SaveStatus>("idle");
  const [noteMessage, setNoteMessage] = useState<string | null>(null);
  const [taskSaveStatus, setTaskSaveStatus] = useState<SaveStatus>("idle");
  const [taskSaveMessage, setTaskSaveMessage] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const boardDndId = `${board.slug}-tasks-dnd`;
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteAbortRef = useRef<AbortController | null>(null);
  const lastSavedNote = useRef(board.noteContent);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const openTask = (task: SerializedTask) => {
    setDrawerVersion((value) => value + 1);
    setDrawerTask(task);
    setDrawerOpen(true);
  };

  const openNewTask = (status: TaskStatus = defaultNewTaskStatus) => {
    setDrawerVersion((value) => value + 1);
    setNewTaskStatus(status);
    setDrawerTask(null);
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
          setNoteStatus("error");
          setNoteMessage("Unable to save notes.");
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
      throw new Error("Unable to persist task order.");
    }
  }

  async function handleSaveTask(values: TaskInput, taskId?: string) {
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
      throw new Error(body.message ?? "Unable to save task.");
    }

    setTasks((current) => mergeTask(current, body.task!));
    setDrawerOpen(false);
    setDrawerTask(null);
    setTaskSaveStatus("saved");
    setTaskSaveMessage(taskId ? "Task updated" : "Task created");
    setTimeout(() => {
      setTaskSaveStatus("idle");
      setTaskSaveMessage(null);
    }, 1800);
  }

  async function handleRenameTask(task: SerializedTask, title: string) {
    await handleSaveTask(taskToInput(task, title), task.id);
  }

  async function handleDeleteTask(taskId: string) {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "DELETE",
    });
    const body = (await response.json()) as { message?: string };

    if (!response.ok) {
      throw new Error(body.message ?? "Unable to delete task.");
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

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTaskId(null);

    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const previousTasks = tasks;
    const nextTasks = reorderTasks(previousTasks, String(active.id), String(over.id));

    if (nextTasks === previousTasks) {
      return;
    }

    setTasks(nextTasks);

    try {
      await persistTaskOrder(nextTasks);
    } catch (error) {
      setTasks(previousTasks);
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

  const boardArea = (
    <DndContext
      id={boardDndId}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
      onDragStart={(event) => setActiveTaskId(String(event.active.id))}
      sensors={sensors}
    >
      {viewMode === "board" ? (
        <div className="blueprint-scrollbar flex min-w-0 snap-none items-start gap-4 overflow-x-auto overscroll-x-contain pb-3">
          {visibleStatuses.map((status) => (
            <div className={kanbanLaneItemClassName} key={status}>
              <BoardColumn
                expandedTaskIds={expandedTaskIds}
                onNewTask={openNewTask}
                onOpenTask={openTask}
                onRenameTask={handleRenameTask}
                onToggleExpand={(taskId) =>
                  setExpandedTaskIds((current) => toggleSetValue(current, taskId))
                }
                status={status}
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
                  <AddTaskToStatusButton onNewTask={openNewTask} status={status} />
                </div>
              </div>
              <div className="space-y-3">
                <SortableContext
                  items={grouped[status].map((task) => task.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {grouped[status].map((task) => (
                    <div
                      className="overflow-hidden rounded-lg border border-line-strong bg-surface-control"
                      key={task.id}
                    >
                      <div className="h-1.5" style={getStatusAccentStyle(task.status)} />
                      <div className="flex items-start justify-between gap-3 p-4">
                        <div className="min-w-0 flex-1 space-y-2">
                          <EditableTaskTitle
                            className="break-words text-base font-semibold text-text-primary"
                            onRename={handleRenameTask}
                            task={task}
                          />
                          <TaskMeta task={task} />
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {task.subtasks.length > 0 ? (
                            <button
                              aria-label={
                                expandedTaskIds.has(task.id)
                                  ? "Collapse subtasks"
                                  : "Expand subtasks"
                              }
                              className="blueprint-action rounded-md p-1"
                              onClick={() =>
                                setExpandedTaskIds((current) => toggleSetValue(current, task.id))
                              }
                              type="button"
                            >
                              {expandedTaskIds.has(task.id) ? (
                                <ChevronDown className="h-5 w-5" />
                              ) : (
                                <ChevronRight className="h-5 w-5" />
                              )}
                            </button>
                          ) : null}
                          <TaskDetailsButton onOpen={openTask} task={task} />
                        </div>
                      </div>
                      {expandedTaskIds.has(task.id) && task.subtasks.length > 0 ? (
                        <div className="px-4 pb-4">
                          <SubtaskList task={task} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </SortableContext>
                {grouped[status].length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line-soft px-4 py-5 text-center text-sm text-text-muted">
                    Nothing here yet.
                  </div>
                ) : null}
              </div>
            </BlueprintCard>
          ))}
        </div>
      )}

      <DragOverlay>
        {activeTaskId ? (
          <div className="w-[15rem]">
            {activeTask ? <TaskPreview task={activeTask} /> : null}
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
            onArchiveModeChange={setArchiveMode}
            onNewTask={() => openNewTask()}
            onToggleNotes={() => setNotesOpen((value) => !value)}
            onViewModeChange={setViewMode}
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
            <BlueprintButton onClick={() => openNewTask()} variant="hero">
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
            onClose={() => setNotesOpen(false)}
          />
        ) : null}
      </div>

      <TaskDrawer
        boardName={board.name}
        initialStatus={newTaskStatus}
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
