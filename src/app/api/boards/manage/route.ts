import { NextResponse } from "next/server";

import {
  assertSameOriginRequest,
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
  requireApiUser,
} from "@/lib/api";
import { createBoardForUser } from "@/lib/data";
import { createBoardSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const originResponse = assertSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const user = await requireApiUser();

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "create-board", user.data.id),
    limit: 20,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const payload = await parseJsonPayload(request, createBoardSchema, "Unable to create board.");

  if (!payload.ok) {
    return payload.response;
  }

  try {
    const board = await createBoardForUser(user.data.id, payload.data);
    return NextResponse.json({ ok: true, board });
  } catch (error) {
    /* v8 ignore next */
    const message = error instanceof Error ? error.message : "Unable to create board.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
