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
  Plus,
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
import { PageTitle } from "@/components/blueprint/page-title";
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

function TaskMeta({ task }: { task: SerializedTask }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
      {task.dueDate ? (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-line-soft bg-surface-control px-2 py-1",
            isDueSoon(task) && "border-accent bg-accent-soft text-text-primary",
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
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-line-soft bg-surface-control p-1">
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              aria-pressed={active}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm font-semibold leading-none transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft",
                active
                  ? "blueprint-fill text-white"
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
  onArchiveModeChange,
  onNewTask,
  onViewModeChange,
  viewMode,
}: {
  archiveMode: ArchiveMode;
  onArchiveModeChange: (value: ArchiveMode) => void;
  onNewTask: () => void;
  onViewModeChange: (value: ViewMode) => void;
  viewMode: ViewMode;
}) {
  return (
    <div className="w-full rounded-lg border border-line-strong bg-surface-control p-2.5 shadow-[0_12px_26px_rgba(31,79,207,0.1)] sm:w-auto xl:shrink-0">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
        <BlueprintButton className="h-10 shrink-0 px-3.5" onClick={onNewTask}>
          <Plus className="h-4 w-4" />
          Add Task
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
  minHeightClassName,
  noteDraft,
  noteMessage,
  onChange,
}: {
  className?: string;
  minHeightClassName: string;
  noteDraft: string;
  noteMessage: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <BlueprintCard className={cn("p-0", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
        <h2 className="blueprint-title text-xl text-text-primary">Notes</h2>
        {noteMessage ? <p className="text-xs font-semibold text-text-muted">{noteMessage}</p> : null}
      </div>
      <div className="p-4">
        <BlueprintTextarea
          className={cn(
            "resize-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0",
            minHeightClassName,
          )}
          onChange={(event) => onChange(event.target.value)}
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
  onToggleExpand,
}: {
  dragHandle?: React.ReactNode;
  task: SerializedTask;
  expanded?: boolean;
  onOpen?: (task: SerializedTask) => void;
  onToggleExpand?: (taskId: string) => void;
}) {
  return (
    <div className="blueprint-note w-full overflow-hidden text-left text-text-primary">
      <div className="h-1.5" style={getStatusAccentStyle(task.status)} />
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <button
            className="min-w-0 flex-1 space-y-2 text-left"
            onClick={() => onOpen?.(task)}
            type="button"
          >
            <div className="h-0.5 w-10 rounded-full bg-brand/60" />
            <p className="break-words text-base font-semibold leading-snug">{task.title}</p>
          </button>
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
  onToggleExpand,
  task,
}: {
  expanded: boolean;
  onOpen: (task: SerializedTask) => void;
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
        onToggleExpand={onToggleExpand}
        task={task}
      />
    </div>
  );
}

function BoardColumn({
  expandedTaskIds,
  onOpenTask,
  onToggleExpand,
  status,
  tasks,
}: {
  expandedTaskIds: Set<string>;
  onOpenTask: (task: SerializedTask) => void;
  onToggleExpand: (taskId: string) => void;
  status: TaskStatus;
  tasks: SerializedTask[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId(status),
  });

  return (
    <div className="blueprint-surface min-w-0 overflow-hidden">
      <div className="h-2" style={getStatusAccentStyle(status)} />
      <div className="border-b border-line-soft px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="blueprint-title text-xl text-text-primary">{statusLabels[status]}</h2>
          </div>
          <span className="rounded-md border border-line-soft bg-surface-control px-2 py-1 text-sm font-semibold text-text-primary">
            {tasks.length}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "blueprint-scrollbar min-h-[27rem] space-y-3 overflow-y-auto p-3 transition sm:min-h-[32rem] sm:p-4",
          isOver && "bg-brand-soft",
        )}
      >
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              expanded={expandedTaskIds.has(task.id)}
              key={task.id}
              onOpen={onOpenTask}
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
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-text-primary outline-none"
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
  onClose,
  onDelete,
  onSave,
  open,
  task,
}: {
  boardName: string;
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
      status: "ON_DECK",
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
      status: task?.status ?? "ON_DECK",
      dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : null,
      subtasks:
        task?.subtasks.map((subtask) => ({
          id: subtask.id,
          title: subtask.title,
          isComplete: subtask.isComplete,
        })) ?? [],
    });
  }, [open, reset, task]);

  if (!open) {
    return null;
  }

  const subtaskFieldIds = fields.map((field) => field.fieldKey);
  const subtaskDndId = task ? `task-drawer-${task.id}-subtasks` : "task-drawer-new-subtasks";

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-[#071733]/30 backdrop-blur-sm">
      <button aria-label="Close task editor" className="flex-1" onClick={onClose} type="button" />

      <div className="blueprint-surface blueprint-surface-strong blueprint-scrollbar relative h-full w-full max-w-2xl overflow-y-auto rounded-none border-y-0 border-r-0 px-4 py-5 sm:px-8 sm:py-6">
        <button
          aria-label="Close task editor"
          className="absolute right-4 top-5 rounded-lg border border-line-strong p-2 text-text-primary transition hover:bg-surface-control-hover sm:right-6 sm:top-6"
          onClick={onClose}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-6 pt-10">
          <div className="space-y-2">
            <p className="blueprint-title text-2xl text-text-primary sm:text-3xl">
              {task ? "Task Details" : "New Task"}
            </p>
            <p className="text-base text-text-muted">Board: {boardName}</p>
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
            <div className="space-y-2">
              <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
                Title
              </label>
              <BlueprintInput {...register("title", { required: "Title is required." })} />
              {errors.title ? <p className="text-sm text-rose-600">{errors.title.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
                Description
              </label>
              <BlueprintTextarea
                {...register("description")}
                placeholder="Capture context, outcomes, and any details worth keeping."
              />
            </div>

            <div className="auto-fit-grid gap-4 [--auto-fit-min:14rem]">
              <div className="space-y-2">
                <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Status
                </label>
                <select
                  className="blueprint-control h-12 w-full rounded-lg px-4 outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                  {...register("status")}
                >
                  {boardStatuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Due date
                </label>
                <BlueprintInput type="date" {...register("dueDate")} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Subtasks
                </label>
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
                  {isPending ? "Saving..." : "Save Task"}
                </BlueprintButton>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function BoardWorkspace({ board }: { board: BoardSnapshot }) {
  const [tasks, setTasks] = useState(board.tasks);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [archiveMode, setArchiveMode] = useState<ArchiveMode>("on");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [drawerTask, setDrawerTask] = useState<SerializedTask | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerVersion, setDrawerVersion] = useState(0);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [noteDraft, setNoteDraft] = useState(board.noteContent);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
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

  useEffect(() => {
    if (noteDraft === lastSavedNote.current) {
      return;
    }

    setNoteMessage("Saving notes...");

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
          setNoteMessage("Unable to save notes.");
          return;
        }

        lastSavedNote.current = content;
        setNoteMessage("Notes saved");
        setTimeout(() => setNoteMessage(null), 1600);
      } catch (error) {
        if (!controller.signal.aborted) {
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
    setFlashMessage(taskId ? "Task updated" : "Task created");
    setTimeout(() => setFlashMessage(null), 1800);
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
    setFlashMessage("Task removed");
    setTimeout(() => setFlashMessage(null), 1800);
  }

  const openTask = (task: SerializedTask | null) => {
    setDrawerVersion((value) => value + 1);
    setDrawerTask(task);
    setDrawerOpen(true);
  };

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
      setFlashMessage(error instanceof Error ? error.message : "Unable to reorder tasks.");
      setTimeout(() => setFlashMessage(null), 2200);
    }
  };

  const activeTask = activeTaskId ? tasks.find((task) => task.id === activeTaskId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-4">
          <PageTitle title={board.name} />
          {board.description ? (
            <p className="max-w-3xl text-base font-medium text-text-muted">{board.description}</p>
          ) : null}
        </div>

        <BoardHeaderControls
          archiveMode={archiveMode}
          onArchiveModeChange={setArchiveMode}
          onNewTask={() => openTask(null)}
          onViewModeChange={setViewMode}
          viewMode={viewMode}
        />
      </div>

      {flashMessage ? (
        <div className="blueprint-panel-muted rounded-lg px-4 py-3 text-sm font-semibold text-text-primary">
          {flashMessage}
        </div>
      ) : null}

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
                  onOpenTask={openTask}
                  onToggleExpand={(taskId) =>
                    setExpandedTaskIds((current) => toggleSetValue(current, taskId))
                  }
                  status={status}
                  tasks={grouped[status]}
                />
              </div>
            ))}

            <NotesPanel
              className={kanbanLaneItemClassName}
              minHeightClassName="min-h-[32rem]"
              noteDraft={noteDraft}
              noteMessage={noteMessage}
              onChange={setNoteDraft}
            />
          </div>
        ) : (
          <div className="auto-fit-grid gap-5 [--auto-fit-min:18rem]">
            <div className="space-y-5">
              {visibleStatuses.map((status) => (
                <BlueprintCard className="space-y-4 p-4 sm:p-5" key={status}>
                  <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-4 w-4 rounded-sm border border-line-strong"
                        style={getStatusAccentStyle(status)}
                      />
                      <h2 className="blueprint-title text-xl text-text-primary sm:text-2xl">
                        {statusLabels[status]}
                      </h2>
                    </div>
                    <span className="rounded-md border border-line-soft bg-surface-control px-2 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                      {grouped[status].length} tasks
                    </span>
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
                          <div
                            className="h-1.5"
                            style={getStatusAccentStyle(task.status)}
                          />
                          <div className="flex items-start justify-between gap-3 p-4">
                            <div className="space-y-2">
                              <button
                                className="break-words text-left text-lg font-semibold text-text-primary"
                                onClick={() => openTask(task)}
                                type="button"
                              >
                                {task.title}
                              </button>
                              <TaskMeta task={task} />
                            </div>
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
                          </div>
                          {expandedTaskIds.has(task.id) && task.subtasks.length > 0 ? (
                            <div className="px-4 pb-4">
                              <SubtaskList task={task} />
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </SortableContext>
                  </div>
                </BlueprintCard>
              ))}
            </div>

            <NotesPanel
              className="h-fit"
              minHeightClassName="min-h-[24rem]"
              noteDraft={noteDraft}
              noteMessage={noteMessage}
              onChange={setNoteDraft}
            />
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

      <TaskDrawer
        boardName={board.name}
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
