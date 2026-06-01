import { compare, hashSync } from "bcryptjs";
import { NextResponse } from "next/server";

import { createSessionToken, setSessionCookie } from "@/lib/auth";
import {
  assertSameOriginRequest,
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
} from "@/lib/api";
import { findUserByEmail } from "@/lib/data";
import { signInSchema } from "@/lib/validators";

// Constant hash used only to equalize bcrypt timing on the unknown-email path,
// so response time doesn't reveal whether an account exists.
const TIMING_EQUALIZER_HASH = hashSync("timing-equalizer", 12);

export async function POST(request: Request) {
  const originResponse = assertSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const payload = await parseJsonPayload(request, signInSchema, "Unable to sign in.");

  if (!payload.ok) {
    return payload.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "sign-in", payload.data.email),
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const user = await findUserByEmail(payload.data.email);

  if (!user) {
    await compare(payload.data.password, TIMING_EQUALIZER_HASH);
    return NextResponse.json(
      { message: "That email and password combination was not recognized." },
      { status: 401 },
    );
  }

  const passwordMatches = await compare(payload.data.password, user.passwordHash);

  if (!passwordMatches) {
    return NextResponse.json(
      { message: "That email and password combination was not recognized." },
      { status: 401 },
    );
  }

  const token = await createSessionToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      passwordChangedAt: user.passwordChangedAt,
    },
    payload.data.rememberMe,
  );

  await setSessionCookie(token, payload.data.rememberMe);

  return NextResponse.json({ ok: true });
}
