import { ApiTokenScope } from "@prisma/client";

import {
  handleExternalDailySummary,
  withExternalApiObservability,
} from "@/lib/external-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/daily-summary",
    async ({ requestId, user }) =>
      handleExternalDailySummary(user.userId, requestId),
    {
      rateLimitScope: "external-daily-summary",
      requiredScope: ApiTokenScope.TASKS_READ,
      requireExistingUser: false,
    },
  );
}
