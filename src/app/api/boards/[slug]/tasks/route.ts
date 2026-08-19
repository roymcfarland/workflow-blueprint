import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import { createTaskForBoard } from "@/lib/data";
import { taskInputSchema } from "@/lib/validators";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "tasks-create", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { slug } = await params;
  const payload = await parseJsonPayload(request, taskInputSchema, "Unable to create task.");

  if (!payload.ok) {
    return payload.response;
  }

  try {
    const task = await createTaskForBoard(user.data.id, slug, payload.data);

    revalidatePath(`/boards/${slug}`);
    revalidatePath("/dashboard");

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    /* v8 ignore next */
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create task." },
      { status: 400 },
    );
  }
}
