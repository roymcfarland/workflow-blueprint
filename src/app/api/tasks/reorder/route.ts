import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import { reorderTasksForUser } from "@/lib/data";
import { prisma } from "@/lib/db";
import { taskReorderSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "tasks-reorder", user.data.id),
    limit: 180,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const payload = await parseJsonPayload(request, taskReorderSchema, "Unable to reorder tasks.");

  if (!payload.ok) {
    return payload.response;
  }

  try {
    await reorderTasksForUser(user.data.id, payload.data);
  } catch (error) {
    /* v8 ignore next */
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to reorder tasks." },
      { status: 400 },
    );
  }

  const boards = await prisma.board.findMany({
    where: {
      userId: user.data.id,
      tasks: {
        some: {
          id: {
            in: payload.data.items.map((item) => item.taskId),
          },
        },
      },
    },
    select: {
      slug: true,
    },
  });

  for (const board of boards) {
    revalidatePath(`/boards/${board.slug}`);
  }

  revalidatePath("/dashboard");

  return NextResponse.json({ ok: true });
}
