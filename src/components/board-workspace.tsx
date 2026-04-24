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
import { useEffect, useRef, useState, useTransition } from "react";
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
import { BlueprintPillToggle } from "@/components/blueprint/pill-toggle";
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
  { label: "On", value: "on" },
  { label: "Off", value: "off" },
] as const;

type ViewMode = (typeof boardViewOptions)[number]["value"];
type ArchiveMode = (typeof archiveOptions)[number]["value"];

const statusAccentColors: Record<TaskStatus, string> = {
  ARCHIVED: "#9aa6bd",
  DONE: "#1a9f72",
  ICE_BOX: "#8cb0ff",
  IN_PROGRESS: "#f4b740",
  ON_DECK: "#63c7c9",
};

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
    <div className="blueprint-note w-full space-y-3 p-4 text-left text-ink">
      <div className="flex items-start justify-between gap-3">
        <button className="flex-1 space-y-2 text-left" onClick={() => onOpen?.(task)} type="button">
          <div className="h-0.5 w-10 rounded-full bg-ink/50" />
          <p className="break-words text-base font-semibold leading-snug">{task.title}</p>
        </button>
        <div className="flex items-center gap-1">
          {task.subtasks.length > 0 ? (
            <button
              aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
              className="rounded-full p-1 text-ink-muted transition hover:bg-white/70"
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
          {dragHandle ?? <GripVertical className="h-4 w-4 text-ink-muted" />}
        </div>
      </div>

      {task.dueDate ? (
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatShortDate(task.dueDate)}
        </div>
      ) : null}

      {expanded && task.subtasks.length > 0 ? (
        <div className="space-y-2 border-t border-ink/20 pt-3 text-sm text-ink-muted">
          {task.subtasks.map((subtask) => (
            <div className="flex items-center gap-2" key={subtask.id}>
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full border border-ink",
                  subtask.isComplete && "bg-ink",
                )}
              />
              <span>{subtask.title}</span>
            </div>
          ))}
        </div>
      ) : null}
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
        rotate: `${(task.sortOrder % 2 === 0 ? -1 : 1) * 0.75}deg`,
      }}
      className={cn(isDragging && "opacity-60")}
    >
      <TaskPreview
        dragHandle={
          <button
            aria-label={`Drag ${task.title}`}
            className="cursor-grab rounded-full p-1 text-ink-muted transition hover:bg-white/70 active:cursor-grabbing"
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
    <div className="blueprint-surface min-w-[15.5rem] overflow-hidden rounded-[1.6rem] bg-white/86 dark:bg-paper-strong sm:min-w-[16rem]">
      <div className="h-2" style={{ backgroundColor: statusAccentColors[status] }} />
      <div className="blueprint-title border-b-2 border-ink px-5 py-4 text-center text-2xl text-ink sm:text-3xl">
        {statusLabels[status]}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "blueprint-scrollbar min-h-[28rem] space-y-4 overflow-y-auto p-4 transition sm:min-h-[34rem] sm:p-5",
          isOver && "bg-ink-soft/15",
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
          <div className="rounded-[1.1rem] border-2 border-dashed border-ink-soft px-4 py-6 text-center text-sm text-ink-muted">
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
      className="flex items-center gap-3 rounded-[1.1rem] border-2 border-ink bg-white/80 px-3 py-3 dark:bg-paper-strong"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button className="text-ink-muted" type="button" {...attributes} {...listeners}>
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
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none"
        placeholder="Subtask title"
        {...register(`subtasks.${index}.title`)}
      />
      {hasId ? <input type="hidden" {...register(`subtasks.${index}.id`)} /> : null}
      <button className="text-ink-muted transition hover:text-rose-600" onClick={onRemove} type="button">
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

      <div className="blueprint-surface blueprint-surface-strong blueprint-scrollbar relative h-full w-full max-w-2xl overflow-y-auto border-y-0 border-r-0 rounded-none px-4 py-5 sm:px-8 sm:py-6">
        <button
          aria-label="Close task editor"
          className="absolute right-4 top-5 rounded-full border-2 border-ink p-2 text-ink sm:right-6 sm:top-6"
          onClick={onClose}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-6 pt-10">
          <div className="space-y-2">
            <p className="blueprint-title text-3xl text-ink sm:text-4xl">
              {task ? "Task Details" : "New Task"}
            </p>
            <p className="text-lg text-ink-muted">Board: {boardName}</p>
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
              <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
                Title
              </label>
              <BlueprintInput {...register("title", { required: "Title is required." })} />
              {errors.title ? <p className="text-sm text-rose-600">{errors.title.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
                Description
              </label>
              <BlueprintTextarea
                {...register("description")}
                placeholder="Capture context, outcomes, and any details worth keeping."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
                  Status
                </label>
                <select
                  className="h-14 w-full rounded-[1.1rem] border-2 border-ink bg-white/92 px-4 text-ink outline-none focus-visible:ring-4 focus-visible:ring-ink-soft dark:bg-paper-strong"
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
                <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
                  Due date
                </label>
                <BlueprintInput type="date" {...register("dueDate")} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
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
              <p className="rounded-[1.1rem] border-2 border-rose-500/30 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {message}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-ink/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
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
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-5">
          <PageTitle title={`${board.name} Tasks`} />
          <BlueprintButton onClick={() => openTask(null)} variant="outline">
            <Plus className="h-5 w-5" />
            New Task
          </BlueprintButton>
        </div>

        <div className="space-y-4 xl:pt-4">
          <BlueprintPillToggle
            label="View:"
            onChange={(value) => setViewMode(value)}
            options={boardViewOptions}
            value={viewMode}
          />
          <BlueprintPillToggle
            label="Archived:"
            onChange={(value) => setArchiveMode(value)}
            options={archiveOptions}
            value={archiveMode}
          />
        </div>
      </div>

      {flashMessage ? (
        <div className="rounded-[1.2rem] border-2 border-ink-soft bg-white/75 px-4 py-3 text-sm font-semibold text-ink dark:bg-paper-strong">
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
          <div className="blueprint-scrollbar flex gap-4 overflow-x-auto pb-2">
            {visibleStatuses.map((status) => (
              <BoardColumn
                expandedTaskIds={expandedTaskIds}
                key={status}
                onOpenTask={openTask}
                onToggleExpand={(taskId) =>
                  setExpandedTaskIds((current) => {
                    const next = new Set(current);

                    if (next.has(taskId)) {
                      next.delete(taskId);
                    } else {
                      next.add(taskId);
                    }

                    return next;
                  })
                }
                status={status}
                tasks={grouped[status]}
              />
            ))}

            <BlueprintCard className="min-w-[17rem] p-0">
              <div className="blueprint-title border-b-2 border-ink px-5 py-4 text-center text-2xl text-ink sm:text-3xl">
                Notes
              </div>
              <div className="space-y-3 p-5">
                <BlueprintTextarea
                  className="min-h-[34rem] resize-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                  onChange={(event) => setNoteDraft(event.target.value)}
                  value={noteDraft}
                />
                {noteMessage ? <p className="text-sm text-ink-muted">{noteMessage}</p> : null}
              </div>
            </BlueprintCard>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-5">
              {visibleStatuses.map((status) => (
                <BlueprintCard className="space-y-4 p-5" key={status}>
                  <div className="flex items-center justify-between gap-3 border-b-2 border-ink/20 pb-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-4 w-4 rounded-full border-2 border-ink"
                        style={{ backgroundColor: statusAccentColors[status] }}
                      />
                      <h2 className="blueprint-title text-2xl text-ink sm:text-3xl">
                        {statusLabels[status]}
                      </h2>
                    </div>
                    <span className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
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
                          className="rounded-[1.2rem] border-2 border-ink bg-white/80 p-4 dark:bg-paper-strong"
                          key={task.id}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2">
                              <button
                                className="break-words text-left text-lg font-semibold text-ink"
                                onClick={() => openTask(task)}
                                type="button"
                              >
                                {task.title}
                              </button>
                              <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
                                {task.dueDate ? (
                                  <span className="flex items-center gap-1">
                                    <CalendarDays className="h-4 w-4" />
                                    {formatShortDate(task.dueDate)}
                                  </span>
                                ) : null}
                                <span>{task.subtasks.filter((subtask) => subtask.isComplete).length}/{task.subtasks.length} subtasks</span>
                              </div>
                            </div>
                            {task.subtasks.length > 0 ? (
                              <button
                                aria-label={
                                  expandedTaskIds.has(task.id)
                                    ? "Collapse subtasks"
                                    : "Expand subtasks"
                                }
                                className="rounded-full p-1 text-ink-muted transition hover:bg-white/70"
                                onClick={() =>
                                  setExpandedTaskIds((current) => {
                                    const next = new Set(current);

                                    if (next.has(task.id)) {
                                      next.delete(task.id);
                                    } else {
                                      next.add(task.id);
                                    }

                                    return next;
                                  })
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
                            <div className="mt-4 space-y-2 border-t border-ink/20 pt-3 text-sm text-ink-muted">
                              {task.subtasks.map((subtask) => (
                                <div className="flex items-center gap-2" key={subtask.id}>
                                  <span
                                    className={cn(
                                      "h-2.5 w-2.5 rounded-full border border-ink",
                                      subtask.isComplete && "bg-ink",
                                    )}
                                  />
                                  <span>{subtask.title}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </SortableContext>
                  </div>
                </BlueprintCard>
              ))}
            </div>

            <BlueprintCard className="h-fit p-5">
              <div className="space-y-3">
                <h2 className="blueprint-title text-2xl text-ink sm:text-3xl">Notes</h2>
                <BlueprintTextarea
                  className="min-h-[24rem] resize-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                  onChange={(event) => setNoteDraft(event.target.value)}
                  value={noteDraft}
                />
                {noteMessage ? <p className="text-sm text-ink-muted">{noteMessage}</p> : null}
              </div>
            </BlueprintCard>
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
