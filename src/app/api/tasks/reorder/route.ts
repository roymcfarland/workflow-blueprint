import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth";
import { reorderTasksForUser } from "@/lib/data";
import { prisma } from "@/lib/db";
import { taskReorderSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const payload = taskReorderSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { message: payload.error.issues[0]?.message ?? "Unable to reorder tasks." },
      { status: 400 },
    );
  }

  await reorderTasksForUser(user.id, payload.data);

  const boards = await prisma.board.findMany({
    where: {
      userId: user.id,
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
