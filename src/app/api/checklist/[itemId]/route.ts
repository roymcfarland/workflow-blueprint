import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import { deleteChecklistItemForUser, updateChecklistItemForUser } from "@/lib/data";
import { prisma } from "@/lib/db";
import { checklistUpdateSchema } from "@/lib/validators";

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
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "checklist-update", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { itemId } = await params;
  const payload = await parseJsonPayload(
    request,
    checklistUpdateSchema,
    "Unable to update checklist item.",
  );

  if (!payload.ok) {
    return payload.response;
  }

  try {
    const task = await updateChecklistItemForUser(user.data.id, itemId, payload.data);

    await revalidateTaskPaths(user.data.id, task.id);

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update checklist item." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "checklist-delete", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { itemId } = await params;

  try {
    const task = await deleteChecklistItemForUser(user.data.id, itemId);

    await revalidateTaskPaths(user.data.id, task.id);

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete checklist item." },
      { status: 400 },
    );
  }
}
