import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { checkRateLimit, parseJsonPayload, rateLimitKey } from "@/lib/api";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { createUserAccountWithInvitation } from "@/lib/data";
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

  try {
    const passwordHash = await hash(payload.data.password, 12);
    const result = await createUserAccountWithInvitation({
      email: payload.data.email,
      inviteToken: payload.data.inviteToken,
      name: payload.data.name,
      passwordHash,
    });

    if (result.status === "invalid-invitation") {
      return NextResponse.json(
        { message: "That invitation is invalid or has expired." },
        { status: 403 },
      );
    }

    if (result.status === "email-in-use") {
      return NextResponse.json(
        { message: "Unable to create an account with that invitation." },
        { status: 409 },
      );
    }

    const { user } = result;
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
