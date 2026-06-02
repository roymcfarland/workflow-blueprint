import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { checkRateLimit, rateLimitKey, requireApiUser } from "@/lib/api";
import { markTaskDoneForUser } from "@/lib/data";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "tasks-done", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { taskId } = await params;

  try {
    const task = await markTaskDoneForUser(user.data.id, taskId);
    const board = await prisma.board.findFirst({
      where: {
        id: task.boardId,
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
