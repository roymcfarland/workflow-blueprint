import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { parseJsonPayload, requireApiUser } from "@/lib/api";
import { deleteTaskForUser, updateTaskForUser } from "@/lib/data";
import { prisma } from "@/lib/db";
import { taskInputSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const { taskId } = await params;
  const payload = await parseJsonPayload(request, taskInputSchema, "Unable to update task.");

  if (!payload.ok) {
    return payload.response;
  }

  try {
    const task = await updateTaskForUser(user.data.id, taskId, payload.data);
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

    if (board) {
      revalidatePath(`/boards/${board.slug}`);
    }

    revalidatePath("/dashboard");

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update task." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const { taskId } = await params;

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

  try {
    await deleteTaskForUser(user.data.id, taskId);

    if (board) {
      revalidatePath(`/boards/${board.slug}`);
    }

    revalidatePath("/dashboard");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete task." },
      { status: 400 },
    );
  }
}
