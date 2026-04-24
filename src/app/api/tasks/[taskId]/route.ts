import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth";
import { deleteTaskForUser, updateTaskForUser } from "@/lib/data";
import { prisma } from "@/lib/db";
import { taskInputSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await requireCurrentUser();
  const { taskId } = await params;
  const payload = taskInputSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { message: payload.error.issues[0]?.message ?? "Unable to update task." },
      { status: 400 },
    );
  }

  try {
    const task = await updateTaskForUser(user.id, taskId, payload.data);
    const board = await prisma.board.findFirst({
      where: {
        tasks: {
          some: {
            id: taskId,
          },
        },
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
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await requireCurrentUser();
  const { taskId } = await params;

  const board = await prisma.board.findFirst({
    where: {
      tasks: {
        some: {
          id: taskId,
        },
      },
      userId: user.id,
    },
    select: {
      slug: true,
    },
  });

  try {
    await deleteTaskForUser(user.id, taskId);

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
