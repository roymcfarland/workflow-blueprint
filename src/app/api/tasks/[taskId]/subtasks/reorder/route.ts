import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import { reorderSubtasksForUser } from "@/lib/data";
import { prisma } from "@/lib/db";
import { subtaskReorderSchema } from "@/lib/validators";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "subtasks-reorder", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { taskId } = await params;
  const payload = await parseJsonPayload(
    request,
    subtaskReorderSchema,
    "Unable to reorder subtasks.",
  );

  if (!payload.ok) {
    return payload.response;
  }

  try {
    const task = await reorderSubtasksForUser(user.data.id, taskId, payload.data);
    const board = await prisma.board.findFirst({
      where: {
        tasks: {
          some: {
            id: taskId,
          },
        },
        userId: user.data.id,
      },
      select: {
        slug: true,
      },
    });

    /* v8 ignore else */
    if (board) {
      revalidatePath(`/boards/${board.slug}`);
    }

    revalidatePath("/dashboard");

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    /* v8 ignore next */
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to reorder subtasks." },
      { status: 400 },
    );
  }
}
