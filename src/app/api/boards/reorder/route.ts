import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { checkRateLimit, parseJsonPayload, rateLimitKey, requireApiUser } from "@/lib/api";
import { reorderBoardsForUser } from "@/lib/data";
import { boardReorderSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "boards-reorder", user.data.id),
    limit: 60,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const payload = await parseJsonPayload(request, boardReorderSchema, "Unable to reorder boards.");

  if (!payload.ok) {
    return payload.response;
  }

  try {
    await reorderBoardsForUser(user.data.id, payload.data.boardSlugs);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to reorder boards." },
      { status: 400 },
    );
  }

  revalidatePath("/dashboard");

  return NextResponse.json({ ok: true });
}
