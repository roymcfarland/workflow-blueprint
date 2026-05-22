import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import { deleteSubtaskForUser, updateSubtaskForUser } from "@/lib/data";
import { prisma } from "@/lib/db";
import { subtaskUpdateSchema } from "@/lib/validators";

async function revalidateTaskPaths(userId: string, taskId: string) {
  const board = await prisma.board.findFirst({
    where: {
      tasks: {
        some: {
          id: taskId,
        },
      },
      userId,
    },
    select: {
      slug: true,
    },
  });

  if (board) {
    revalidatePath(`/boards/${board.slug}`);
  }

  revalidatePath("/dashboard");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ subtaskId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "subtasks-update", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { subtaskId } = await params;
  const payload = await parseJsonPayload(request, subtaskUpdateSchema, "Unable to update subtask.");

  if (!payload.ok) {
    return payload.response;
  }

  try {
    const task = await updateSubtaskForUser(user.data.id, subtaskId, payload.data);

    await revalidateTaskPaths(user.data.id, task.id);

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update subtask." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ subtaskId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "subtasks-delete", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { subtaskId } = await params;

  try {
    const task = await deleteSubtaskForUser(user.data.id, subtaskId);

    await revalidateTaskPaths(user.data.id, task.id);

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete subtask." },
      { status: 400 },
    );
  }
}
