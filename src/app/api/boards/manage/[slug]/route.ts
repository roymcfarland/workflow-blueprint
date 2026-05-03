import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  assertSameOriginRequest,
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import { deleteBoardForUser, updateBoardForUser } from "@/lib/data";
import { updateBoardSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const originResponse = assertSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const user = await requireApiUser();

  if (!user.ok) {
    return user.response;
  }

  const { slug } = await context.params;

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "update-board", user.data.id),
    limit: 30,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const payload = await parseJsonPayload(request, updateBoardSchema, "Unable to update board.");

  if (!payload.ok) {
    return payload.response;
  }

  try {
    const { updated, previousSlug } = await updateBoardForUser(user.data.id, slug, payload.data);

    revalidatePath(`/boards/${previousSlug}`);

    if (updated.slug !== previousSlug) {
      revalidatePath(`/boards/${updated.slug}`);
    }

    revalidatePath("/dashboard");

    return NextResponse.json({ ok: true, board: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update board.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const originResponse = assertSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const user = await requireApiUser();

  if (!user.ok) {
    return user.response;
  }

  const { slug } = await context.params;

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "delete-board", user.data.id),
    limit: 10,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    await deleteBoardForUser(user.data.id, slug);
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete board.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
