import { Prisma } from "@/generated/prisma/client";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import {
  assertSameOriginRequest,
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
} from "@/lib/api";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { createUserAccountWithInvitation } from "@/lib/data";
import { sendWelcomeEmail } from "@/lib/email";
import { signUpSchema } from "@/lib/validators";

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function POST(request: Request) {
  const originResponse = assertSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const payload = await parseJsonPayload(request, signUpSchema, "Unable to create account.");

  if (!payload.ok) {
    return payload.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "sign-up", payload.data.email),
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // The same generic message is used for every failure path below so an
  // attacker holding (or guessing) an invitation token cannot tell whether
  // a particular email already has an account, the token has expired, or
  // anything else. Server logs preserve the actual cause for operators.
  const invitationFailureResponse = NextResponse.json(
    {
      message:
        "We could not complete that sign-up. Check your invitation link or contact your administrator.",
    },
    { status: 400 },
  );

  try {
    const passwordHash = await hash(payload.data.password, 12);
    const result = await createUserAccountWithInvitation({
      email: payload.data.email,
      inviteToken: payload.data.inviteToken,
      name: payload.data.name,
      passwordHash,
    });

    if (result.status === "invalid-invitation") {
      console.warn("Sign-up rejected: invalid invitation token.", {
        email: payload.data.email,
      });
      return invitationFailureResponse;
    }

    if (result.status === "email-in-use") {
      console.warn("Sign-up rejected: email already registered.", {
        email: payload.data.email,
      });
      return invitationFailureResponse;
    }

    const { user } = result;
    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      passwordChangedAt: user.passwordChangedAt,
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
      console.warn("Sign-up rejected: unique constraint violation.", {
        email: payload.data.email,
      });
      return invitationFailureResponse;
    }

    console.error("Unable to create account.", error);
    return NextResponse.json({ message: "Unable to create account." }, { status: 500 });
  }
}
