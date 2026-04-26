import { NextResponse } from "next/server";

import { assertSameOriginRequest } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const originResponse = assertSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}
