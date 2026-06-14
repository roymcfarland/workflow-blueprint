import { NextResponse } from "next/server";

import { assertSameOriginRequest, checkRateLimit, rateLimitKey } from "@/lib/api";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { provisionDemoUser, purgeExpiredDemoUsers } from "@/lib/data";

export async function POST(request: Request) {
  const originResponse = assertSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "demo"),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  await purgeExpiredDemoUsers();
  const user = await provisionDemoUser();

  const token = await createSessionToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    passwordChangedAt: user.passwordChangedAt,
  });

  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
