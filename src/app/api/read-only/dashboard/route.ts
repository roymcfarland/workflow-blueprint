import { getDashboardSnapshot } from "@/lib/data";
import {
  readOnlyApiJson,
  requireReadOnlyApiUser,
} from "@/lib/read-only-api";
import { readOnlyDashboardResponseSchema } from "@/lib/read-only-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireReadOnlyApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const dashboard = await getDashboardSnapshot(user.data.userId);

  return readOnlyApiJson(readOnlyDashboardResponseSchema, {
    ok: true,
    data: dashboard,
  });
}
