import { ApiTokenScope } from "@/generated/prisma/client";

import { getDashboardSnapshot } from "@/lib/data";
import {
  externalApiJson,
  withExternalApiObservability,
} from "@/lib/external-api";
import { externalDashboardResponseSchema } from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/dashboard",
    async ({ requestId, user }) => {
      const dashboard = await getDashboardSnapshot(user.userId);

      return externalApiJson(
        externalDashboardResponseSchema,
        {
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
        },
        undefined,
        requestId,
      );
    },
    { requiredScope: ApiTokenScope.TASKS_READ },
  );
}
