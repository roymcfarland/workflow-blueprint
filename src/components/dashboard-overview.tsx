"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCheck,
  ClipboardList,
  Plus,
  Sparkles,
} from "lucide-react";

import { BoardIcon } from "@/components/board-icon";
import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintCard } from "@/components/blueprint/card";
import { PageTitle } from "@/components/blueprint/page-title";
import type { DashboardSnapshot, DashboardTaskSummary } from "@/lib/data";
import { getBoardAccentColor } from "@/lib/domain";

const chartCenter = 160;
const chartRadius = 108;
const chartStrokeWidth = 38;
const chartCircumference = 2 * Math.PI * chartRadius;

function getChartSegments(segments: DashboardSnapshot["boardBreakdown"], totalTasks: number) {
  if (totalTasks === 0) {
    return [];
  }

  let offset = 0;

  return segments.map((segment) => {
    const length = (segment.totalTasks / totalTasks) * chartCircumference;
    const chartSegment = {
      color: getBoardAccentColor(segment.slug),
      dashArray: `${length} ${chartCircumference - length}`,
      dashOffset: -offset,
      slug: segment.slug,
    };

    offset += length;

    return chartSegment;
  });
}

function getTaskListKey(tasks: DashboardTaskSummary[]) {
  return tasks
    .map((task) =>
      [
        task.id,
        task.title,
        task.status,
        task.priority,
        task.dueDate ?? "",
        task.boardSlug,
        task.boardName,
        task.boardIconKey,
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
        New task
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

function InProgressPanel({ tasks }: { tasks: DashboardTaskSummary[] }) {
  const router = useRouter();
  const [items, setItems] = useState(tasks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) {
      return;
    }

    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    void persistOrder(next);
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
          <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">In progress</h2>
          <ClipboardList className="h-5 w-5 text-text-muted" />
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-soft px-4 py-6 text-center text-sm text-text-muted">
            Nothing in progress right now.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((task, index) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-control px-3 py-2.5"
                key={task.id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <BoardIcon
                    className="h-4 w-4 shrink-0"
                    iconKey={task.boardIconKey}
                    style={{ color: getBoardAccentColor(task.boardSlug) }}
                  />
                  <div className="min-w-0">
                    <Link
                      className="block truncate text-sm font-semibold text-text-primary transition hover:text-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                      href={`/boards/${task.boardSlug}`}
                    >
                      {task.title}
                    </Link>
                    <p className="truncate text-xs text-text-muted">{task.boardName}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    aria-label={`Move ${task.title} up`}
                    className="blueprint-action rounded-md p-1 disabled:opacity-30"
                    disabled={pending || index === 0}
                    onClick={() => move(index, -1)}
                    type="button"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    aria-label={`Move ${task.title} down`}
                    className="blueprint-action rounded-md p-1 disabled:opacity-30"
                    disabled={pending || index === items.length - 1}
                    onClick={() => move(index, 1)}
                    type="button"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    aria-label={`Mark ${task.title} done`}
                    className="blueprint-action rounded-md p-1 disabled:opacity-30"
                    disabled={pending}
                    onClick={() => void markDone(task.id)}
                    style={{ color: "var(--status-done)" }}
                    type="button"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BlueprintCard>
  );
}

export function DashboardOverview({ data }: { data: DashboardSnapshot }) {
  const totalTasks = data.boardBreakdown.reduce((sum, segment) => sum + segment.totalTasks, 0);
  const chartSegments = getChartSegments(data.boardBreakdown, totalTasks);
  const isEmpty = data.totalTaskCount === 0;
  const completionTooltip = "Done ÷ (Up Next + In Progress + Done)";
  const inProgressPanelKey = getTaskListKey(data.inProgressTasks);

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
        <>
          {/* Snapshot: donut + completion in a single panel. */}
          <BlueprintCard className="p-5 lg:p-6" surface="flat">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">
                    Snapshot
                  </h2>
                  <p className="blueprint-eyebrow">% of total tasks</p>
                </div>

                <div className="grid items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
                  <div className="mx-auto flex aspect-square w-44 items-center justify-center sm:w-52">
                    <svg
                      aria-label="Task breakdown by board"
                      className="h-full w-full"
                      role="img"
                      viewBox="0 0 320 320"
                    >
                      <circle
                        cx={chartCenter}
                        cy={chartCenter}
                        fill="none"
                        r={chartRadius}
                        stroke="var(--brand-soft)"
                        strokeWidth={chartStrokeWidth}
                      />
                      {chartSegments.map((segment) => (
                        <circle
                          cx={chartCenter}
                          cy={chartCenter}
                          fill="none"
                          key={segment.slug}
                          r={chartRadius}
                          stroke={segment.color}
                          strokeDasharray={segment.dashArray}
                          strokeDashoffset={segment.dashOffset}
                          strokeWidth={chartStrokeWidth}
                          transform={`rotate(-90 ${chartCenter} ${chartCenter})`}
                        />
                      ))}
                      <text
                        fill="var(--text-primary)"
                        fontSize="58"
                        fontWeight="700"
                        textAnchor="middle"
                        x={chartCenter}
                        y={chartCenter + 4}
                      >
                        {data.totalTaskCount}
                      </text>
                      <text
                        fill="var(--text-muted)"
                        fontSize="16"
                        fontWeight="700"
                        textAnchor="middle"
                        x={chartCenter}
                        y={chartCenter + 32}
                      >
                        TASKS
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
                            style={{ backgroundColor: getBoardAccentColor(segment.slug) }}
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

              <div className="space-y-4 border-t border-line-soft pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="blueprint-display text-xl text-text-primary sm:text-2xl">
                    Completion rate
                  </h2>
                  <span
                    className="blueprint-eyebrow cursor-help"
                    title={completionTooltip}
                  >
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
                      className="blueprint-fill-flat h-full rounded-full"
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
                      <span className="text-xs font-semibold">In progress</span>
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

          <InProgressPanel key={inProgressPanelKey} tasks={data.inProgressTasks} />
        </>
      )}
    </div>
  );
}
