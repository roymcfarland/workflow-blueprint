import Link from "next/link";
import { ArrowRight, CheckCheck, ClipboardList } from "lucide-react";

import { BoardIcon } from "@/components/board-icon";
import { BlueprintCard } from "@/components/blueprint/card";
import { PageTitle } from "@/components/blueprint/page-title";
import type { DashboardSnapshot } from "@/lib/data";

const chartPalette = ["#dbe4ff", "#9bb6ff", "#1f50f2"];
const chartCenter = 160;
const chartRadius = 118;

function polarPoint(angle: number, radius: number) {
  const radians = ((angle - 90) * Math.PI) / 180;

  return {
    x: chartCenter + radius * Math.cos(radians),
    y: chartCenter + radius * Math.sin(radians),
  };
}

function describeSlice(startAngle: number, endAngle: number, radius: number) {
  const start = polarPoint(startAngle, radius);
  const end = polarPoint(endAngle, radius);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${chartCenter} ${chartCenter}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

export function DashboardOverview({ data }: { data: DashboardSnapshot }) {
  const totalTasks = data.boardBreakdown.reduce((sum, segment) => sum + segment.totalTasks, 0) || 1;
  const chartSegments = data.boardBreakdown.reduce<{
    nextAngle: number;
    segments: Array<{
      color: string;
      labelPosition: ReturnType<typeof polarPoint>;
      path: string;
      percentage: number;
      slug: string;
    }>;
  }>(
    (accumulator, segment, index) => {
      const startAngle = accumulator.nextAngle;
      const sweepAngle = (segment.totalTasks / totalTasks) * 360;
      const endAngle = startAngle + sweepAngle;

      return {
        nextAngle: endAngle,
        segments: [
          ...accumulator.segments,
          {
            color: chartPalette[index % chartPalette.length],
            labelPosition: polarPoint(startAngle + sweepAngle / 2, chartRadius * 0.56),
            path: describeSlice(startAngle, endAngle, chartRadius),
            percentage: segment.percentage,
            slug: segment.slug,
          },
        ],
      };
    },
    { nextAngle: 0, segments: [] },
  ).segments;

  return (
    <div className="fade-up space-y-6">
      <PageTitle title="Dashboard" />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.25fr]">
        <BlueprintCard className="p-6 lg:p-7">
          <div className="space-y-6">
            <div>
              <h2 className="blueprint-title text-3xl text-ink">Task Breakdown</h2>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ink-muted">
                % of total tasks
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="flex h-72 items-center justify-center">
                <svg
                  aria-label="Task breakdown by board"
                  className="h-[20rem] w-[20rem]"
                  role="img"
                  viewBox="0 0 320 320"
                >
                  {chartSegments.map((segment) => (
                    <path
                      d={segment.path}
                      fill={segment.color}
                      key={segment.slug}
                      stroke="#1f50f2"
                      strokeWidth="2"
                    />
                  ))}
                  {chartSegments.map((segment) => (
                    <text
                      fill="#1f50f2"
                      fontSize="24"
                      fontWeight="700"
                      key={`${segment.slug}-label`}
                      textAnchor="middle"
                      x={segment.labelPosition.x}
                      y={segment.labelPosition.y}
                    >
                      {segment.percentage}%
                    </text>
                  ))}
                </svg>
              </div>

              <div className="flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  {data.boardBreakdown.map((segment, index) => (
                    <div className="flex items-start gap-3 text-lg text-ink" key={segment.slug}>
                      <span
                        className="mt-1 h-6 w-6 rounded-md border-2 border-ink"
                        style={{ backgroundColor: chartPalette[index % chartPalette.length] }}
                      />
                      <div>
                        <p className="font-semibold">{segment.name}</p>
                        <p className="text-ink-muted">
                          {segment.percentage}% ({segment.totalTasks})
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t-2 border-ink/20 pt-5 text-lg font-semibold text-ink">
                  Total Tasks{" "}
                  <span className="ml-3 text-2xl font-bold">{data.totalTaskCount}</span>
                </div>
              </div>
            </div>
          </div>
        </BlueprintCard>

        <BlueprintCard className="p-6 lg:p-7">
          <div className="space-y-8">
            <div className="space-y-3">
              <h2 className="blueprint-title text-3xl text-ink">Sprint Completion Rate</h2>
              <p className="text-lg text-ink-muted">(Done / Total active tasks)</p>
            </div>

            <div className="space-y-6">
              <p className="text-center text-[clamp(4rem,8vw,7rem)] font-semibold leading-none text-ink">
                {data.sprintCompletionRate}%
              </p>

              <div className="space-y-3">
                <div className="h-12 overflow-hidden rounded-full border-2 border-ink bg-white/70 dark:bg-paper-strong">
                  <div
                    className="blueprint-fill h-full rounded-full"
                    style={{ width: `${data.sprintCompletionRate}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-lg font-semibold text-ink">
                  <span>{data.doneCount} done</span>
                  <span>{data.activeTaskCount} total</span>
                </div>
              </div>

              <p className="text-lg text-ink-muted">
                Total active tasks = Done + In Progress + On Deck
              </p>
            </div>
          </div>
        </BlueprintCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BlueprintCard className="flex items-center gap-5 p-6 lg:p-7">
          <div className="flex h-24 w-24 items-center justify-center rounded-[1.5rem] border-2 border-ink bg-white/85 dark:bg-paper-strong">
            <ClipboardList className="h-10 w-10 text-ink" />
          </div>
          <div>
            <p className="blueprint-title text-3xl text-ink">In Progress Tasks</p>
            <p className="text-[clamp(3rem,7vw,4.5rem)] font-semibold leading-none text-ink">
              {data.inProgressCount}
            </p>
            <p className="text-lg text-ink-muted">Across all boards</p>
          </div>
        </BlueprintCard>

        <BlueprintCard className="flex items-center gap-5 p-6 lg:p-7">
          <div className="flex h-24 w-24 items-center justify-center rounded-[1.5rem] border-2 border-ink bg-white/85 dark:bg-paper-strong">
            <CheckCheck className="h-10 w-10 text-ink" />
          </div>
          <div>
            <p className="blueprint-title text-3xl text-ink">Tasks Closed (Last 7 Days)</p>
            <p className="text-[clamp(3rem,7vw,4.5rem)] font-semibold leading-none text-ink">
              {data.closedLastSevenDays}
            </p>
            <p className="text-lg text-ink-muted">Across all boards</p>
          </div>
        </BlueprintCard>
      </div>

      <BlueprintCard className="space-y-5 p-6 lg:p-7">
        <div>
          <h2 className="blueprint-title text-3xl text-ink">Jump To Board</h2>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {data.boardBreakdown.map((board) => (
            <Link
              className="rounded-[1.4rem] border-2 border-ink bg-white/85 p-5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(31,80,242,0.12)] dark:bg-paper-strong"
              href={`/boards/${board.slug}`}
              key={board.slug}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-18 w-18 items-center justify-center rounded-full border-2 border-ink bg-white/90 dark:bg-paper">
                    <BoardIcon className="h-8 w-8 text-ink" iconKey={board.iconKey} />
                  </div>
                  <div>
                    <p className="blueprint-title text-2xl text-ink">{board.name}</p>
                    <p className="text-sm text-ink-muted">Open the {board.name} board</p>
                  </div>
                </div>
                <ArrowRight className="h-6 w-6 text-ink" />
              </div>
            </Link>
          ))}
        </div>
      </BlueprintCard>
    </div>
  );
}
