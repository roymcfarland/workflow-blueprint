import { compare } from "bcryptjs";
import { NextResponse } from "next/server";

import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { findUserByEmail } from "@/lib/data";
import { signInSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const payload = signInSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { message: payload.error.issues[0]?.message ?? "Unable to sign in." },
      { status: 400 },
    );
  }

  const user = await findUserByEmail(payload.data.email);

  if (!user) {
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
    },
    payload.data.rememberMe,
  );

  await setSessionCookie(token, payload.data.rememberMe);

  return NextResponse.json({ ok: true });
}
