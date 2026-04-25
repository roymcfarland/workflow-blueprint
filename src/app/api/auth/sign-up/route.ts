import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { checkRateLimit, parseJsonPayload, rateLimitKey } from "@/lib/api";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { createUserAccount, findUserByEmail } from "@/lib/data";
import { sendWelcomeEmail } from "@/lib/email";
import { signUpSchema } from "@/lib/validators";

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function POST(request: Request) {
  const payload = await parseJsonPayload(request, signUpSchema, "Unable to create account.");

  if (!payload.ok) {
    return payload.response;
  }

  const rateLimitResponse = checkRateLimit({
    key: rateLimitKey(request, "sign-up", payload.data.email),
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const existingUser = await findUserByEmail(payload.data.email);

  if (existingUser) {
    return NextResponse.json(
      { message: "That email address is already in use." },
      { status: 409 },
    );
  }

  try {
    const passwordHash = await hash(payload.data.password, 12);
    const user = await createUserAccount({
      email: payload.data.email,
      name: payload.data.name,
      passwordHash,
    });

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    await setSessionCookie(token);

    try {
      await sendWelcomeEmail({
        name: user.name,
        to: user.email,
      });
    } catch (error) {
      console.error("Unable to send welcome email.", error);
    }

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { message: "That email address is already in use." },
        { status: 409 },
      );
    }

    console.error("Unable to create account.", error);
    return NextResponse.json({ message: "Unable to create account." }, { status: 500 });
  }
}
