import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  checkRateLimit,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import {
  deleteAttachmentForUser,
  getAttachmentForDownload,
} from "@/lib/data";
import { prisma } from "@/lib/db";
import { createSignedDownloadUrl } from "@/lib/storage";

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "attachments-download", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { attachmentId } = await params;

  try {
    const attachment = await getAttachmentForDownload(user.data.id, attachmentId);
    const url = await createSignedDownloadUrl(attachment.storagePath);

    return NextResponse.json({ ok: true, url, fileName: attachment.fileName });
  } catch (error) {
    /* v8 ignore next */
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create attachment download URL." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "attachments-delete", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { attachmentId } = await params;

  try {
    const task = await deleteAttachmentForUser(user.data.id, attachmentId);

    await revalidateTaskPaths(user.data.id, task.id);

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    /* v8 ignore next */
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete attachment." },
      { status: 400 },
    );
  }
}
