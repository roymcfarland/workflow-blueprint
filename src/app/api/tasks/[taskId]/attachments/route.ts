import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import { createAttachmentRecord } from "@/lib/data";
import { prisma } from "@/lib/db";
import { attachmentRecordSchema } from "@/lib/validators";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "attachments-create", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { taskId } = await params;
  const payload = await parseJsonPayload(
    request,
    attachmentRecordSchema,
    "Unable to record attachment.",
  );

  if (!payload.ok) {
    return payload.response;
  }

  try {
    const task = await createAttachmentRecord(user.data.id, taskId, payload.data);

    await revalidateTaskPaths(user.data.id, task.id);

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to record attachment." },
      { status: 400 },
    );
  }
}
