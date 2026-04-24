import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth";
import { updateBoardNote } from "@/lib/data";
import { noteSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await requireCurrentUser();
  const { slug } = await params;
  const payload = noteSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { message: payload.error.issues[0]?.message ?? "Unable to save notes." },
      { status: 400 },
    );
  }

  await updateBoardNote(user.id, slug, payload.data.content);

  revalidatePath(`/boards/${slug}`);

  return NextResponse.json({ ok: true });
}
