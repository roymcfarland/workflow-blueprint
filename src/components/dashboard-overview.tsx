import Link from "next/link";
import { ArrowRight, CheckCheck, ClipboardList } from "lucide-react";

import { BoardIcon } from "@/components/board-icon";
import { BlueprintCard } from "@/components/blueprint/card";
import { PageTitle } from "@/components/blueprint/page-title";
import type { DashboardSnapshot } from "@/lib/data";
import { getBoardAccentColor } from "@/lib/domain";

const chartCenter = 160;
const chartRadius = 108;
const chartStrokeWidth = 42;
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

function DashboardMetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  detail: string;
  icon: typeof ClipboardList;
  label: string;
  value: number;
}) {
  return (
    <BlueprintCard className="flex items-center gap-4 p-5 lg:p-6">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-control sm:h-14 sm:w-14">
        <Icon className="h-6 w-6 text-brand" />
      </div>
      <div className="min-w-0">
        <p className="blueprint-title text-lg text-text-primary sm:text-xl">{label}</p>
        <p className="text-4xl font-semibold leading-none text-text-primary sm:text-5xl">
          {value}
        </p>
        <p className="text-sm text-text-muted">{detail}</p>
      </div>
    </BlueprintCard>
  );
}

export function DashboardOverview({ data }: { data: DashboardSnapshot }) {
  const totalTasks = data.boardBreakdown.reduce((sum, segment) => sum + segment.totalTasks, 0);
  const chartSegments = getChartSegments(data.boardBreakdown, totalTasks);

  return (
    <div className="fade-up space-y-6">
      <PageTitle title="Dashboard" />

      <div className="auto-fit-grid gap-5 [--auto-fit-min:31rem]">
        <BlueprintCard className="p-5 lg:p-6">
          <div className="space-y-6">
            <div>
              <h2 className="blueprint-title text-xl text-text-primary sm:text-2xl">
                Task Breakdown
              </h2>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                % of total tasks
              </p>
            </div>

            <div className="auto-fit-grid items-center gap-6 [--auto-fit-min:15rem]">
              <div className="flex aspect-square max-h-72 min-h-56 items-center justify-center">
                <svg
                  aria-label="Task breakdown by board"
                  className="h-full max-h-[18rem] w-full max-w-[18rem]"
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
                    fontSize="46"
                    fontWeight="700"
                    textAnchor="middle"
                    x={chartCenter}
                    y={chartCenter - 2}
                  >
                    {data.totalTaskCount}
                  </text>
                  <text
                    fill="var(--text-muted)"
                    fontSize="16"
                    fontWeight="700"
                    textAnchor="middle"
                    x={chartCenter}
                    y={chartCenter + 28}
                  >
                    TASKS
                  </text>
                </svg>
              </div>

              <div className="flex flex-col justify-between gap-5">
                <div className="space-y-3">
                  {data.boardBreakdown.map((segment) => (
                    <Link
                      className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-control px-3 py-2.5 text-text-primary transition hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-control-hover"
                      href={`/boards/${segment.slug}`}
                      key={segment.slug}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-4 w-4 shrink-0 rounded-sm border border-line-strong"
                          style={{ backgroundColor: getBoardAccentColor(segment.slug) }}
                        />
                        <p className="truncate font-semibold">{segment.name}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-text-muted">
                        {segment.percentage}% ({segment.totalTasks})
                      </p>
                    </Link>
                  ))}
                </div>

                <div className="border-t border-line-soft pt-4 text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Total Tasks{" "}
                  <span className="ml-2 text-2xl font-bold tracking-normal text-text-primary">
                    {data.totalTaskCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </BlueprintCard>

        <BlueprintCard className="p-5 lg:p-6">
          <div className="space-y-7">
            <div className="space-y-2">
              <h2 className="blueprint-title text-xl text-text-primary sm:text-2xl">
                Sprint Completion Rate
              </h2>
              <p className="text-base text-text-muted">Done tasks across active work</p>
            </div>

            <div className="space-y-6">
              <p className="text-center text-6xl font-semibold leading-none text-text-primary sm:text-7xl">
                {data.sprintCompletionRate}%
              </p>

              <div className="space-y-3">
                <div className="h-8 overflow-hidden rounded-lg border border-line-strong bg-surface-control">
                  <div
                    className="blueprint-fill h-full rounded-md"
                    style={{ width: `${data.sprintCompletionRate}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm font-semibold uppercase tracking-[0.14em] text-text-muted">
                  <span>{data.doneCount} done</span>
                  <span>{data.activeTaskCount} active</span>
                </div>
              </div>

              <p className="blueprint-panel-muted rounded-lg px-3 py-2 text-sm">
                Active work includes On Deck, In Progress, and Done tasks.
              </p>
            </div>
          </div>
        </BlueprintCard>
      </div>

      <div className="auto-fit-grid gap-5 [--auto-fit-min:20rem]">
        <DashboardMetricCard
          detail="Across all boards"
          icon={ClipboardList}
          label="In Progress Tasks"
          value={data.inProgressCount}
        />

        <DashboardMetricCard
          detail="Closed in the last 7 days"
          icon={CheckCheck}
          label="Tasks Closed"
          value={data.closedLastSevenDays}
        />
      </div>

      <BlueprintCard className="space-y-5 p-5 lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="blueprint-title text-xl text-text-primary sm:text-2xl">Jump To Board</h2>
          <ArrowRight className="h-5 w-5 text-text-muted" />
        </div>
        <div className="auto-fit-grid gap-3 [--auto-fit-min:18rem]">
          {data.boardBreakdown.map((board) => (
            <Link
              className="rounded-lg border border-line-strong bg-surface-control p-4 transition hover:-translate-y-0.5 hover:bg-surface-control-hover hover:shadow-[0_14px_28px_rgba(31,79,207,0.12)]"
              href={`/boards/${board.slug}`}
              key={board.slug}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-control">
                    <BoardIcon className="h-5 w-5 text-brand" iconKey={board.iconKey} />
                  </div>
                  <div className="min-w-0">
                    <p className="blueprint-title truncate text-lg text-text-primary">
                      {board.name}
                    </p>
                    <p className="text-sm text-text-muted">
                      {board.totalTasks} tasks - {board.percentage}% of total
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-brand" />
              </div>
            </Link>
          ))}
        </div>
      </BlueprintCard>
    </div>
  );
}
