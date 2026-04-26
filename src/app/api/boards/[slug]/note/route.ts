import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { parseJsonPayload, requireApiUser } from "@/lib/api";
import { updateBoardNote } from "@/lib/data";
import { noteSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const { slug } = await params;
  const payload = await parseJsonPayload(request, noteSchema, "Unable to save notes.");

  if (!payload.ok) {
    return payload.response;
  }

  try {
    await updateBoardNote(user.data.id, slug, payload.data.content);

    revalidatePath(`/boards/${slug}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to save notes." },
      { status: 400 },
    );
  }
}
