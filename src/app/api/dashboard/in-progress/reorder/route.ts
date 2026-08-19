import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import { reorderDashboardInProgressForUser } from "@/lib/data";
import { dashboardReorderSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "dashboard-reorder", user.data.id),
    limit: 180,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const payload = await parseJsonPayload(
    request,
    dashboardReorderSchema,
    "Unable to reorder tasks.",
  );

  if (!payload.ok) {
    return payload.response;
  }

  try {
    await reorderDashboardInProgressForUser(user.data.id, payload.data.taskIds);
  } catch (error) {
    /* v8 ignore next */
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to reorder tasks." },
      { status: 400 },
    );
  }

  revalidatePath("/dashboard");

  return NextResponse.json({ ok: true });
}
