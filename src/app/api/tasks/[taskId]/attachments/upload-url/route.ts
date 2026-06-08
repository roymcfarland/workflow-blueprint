import { NextResponse } from "next/server";

import {
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import {
  assertCanCreateAttachmentForUser,
  buildAttachmentStoragePath,
} from "@/lib/data";
import { createSignedUploadUrl } from "@/lib/storage";
import { attachmentMetaSchema } from "@/lib/validators";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "attachments-upload-url", user.data.id),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { taskId } = await params;
  const payload = await parseJsonPayload(
    request,
    attachmentMetaSchema,
    "Unable to create attachment upload URL.",
  );

  if (!payload.ok) {
    return payload.response;
  }

  try {
    await assertCanCreateAttachmentForUser(user.data.id, taskId);

    const storagePath = buildAttachmentStoragePath(taskId);
    const signedUpload = await createSignedUploadUrl(storagePath);

    return NextResponse.json({
      ok: true,
      uploadUrl: signedUpload.uploadUrl,
      token: signedUpload.token,
      path: storagePath,
      contentType: payload.data.contentType,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create attachment upload URL." },
      { status: 400 },
    );
  }
}
