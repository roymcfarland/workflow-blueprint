import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  checkRateLimit,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import { deleteLabelForUser } from "@/lib/data";
import { prisma } from "@/lib/db";

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

  /* v8 ignore else */
  if (board) {
    revalidatePath(`/boards/${board.slug}`);
  }

  revalidatePath("/dashboard");
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ labelId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "labels-delete", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { labelId } = await params;

  try {
    const task = await deleteLabelForUser(user.data.id, labelId);

    await revalidateTaskPaths(user.data.id, task.id);

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    /* v8 ignore next */
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete label." },
      { status: 400 },
    );
  }
}
