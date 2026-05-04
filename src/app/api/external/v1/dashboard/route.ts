import { getDashboardSnapshot } from "@/lib/data";
import {
  externalApiJson,
  requireExternalApiUser,
} from "@/lib/external-api";
import { externalDashboardResponseSchema } from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireExternalApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const dashboard = await getDashboardSnapshot(user.data.userId);

  return externalApiJson(externalDashboardResponseSchema, {
    ok: true,
    data: {
      boardBreakdown: dashboard.boardBreakdown,
      sprintCompletionRate: dashboard.completionRate,
      doneCount: dashboard.doneCount,
      activeTaskCount: dashboard.activeTaskCount,
      inProgressCount: dashboard.inProgressCount,
      closedLastSevenDays: dashboard.closedLastSevenDays,
      totalTaskCount: dashboard.totalTaskCount,
    },
  });
}
