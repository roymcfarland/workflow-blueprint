import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth";
import { createTaskForBoard } from "@/lib/data";
import { taskInputSchema } from "@/lib/validators";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await requireCurrentUser();
  const { slug } = await params;
  const payload = taskInputSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { message: payload.error.issues[0]?.message ?? "Unable to create task." },
      { status: 400 },
    );
  }

  const task = await createTaskForBoard(user.id, slug, payload.data);

  revalidatePath(`/boards/${slug}`);
  revalidatePath("/dashboard");

  return NextResponse.json({ ok: true, task });
}
