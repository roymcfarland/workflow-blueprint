import { NextResponse } from "next/server";

import {
  assertSameOriginRequest,
  checkRateLimit,
  parseJsonPayload,
  rateLimitKey,
} from "@/lib/api";
import { createPasswordResetToken, findUserByEmail } from "@/lib/data";
import { buildAppUrl, sendPasswordResetEmail } from "@/lib/email";
import { forgotPasswordSchema } from "@/lib/validators";

const passwordResetMessage = "If that account exists, a reset link has been sent.";

export async function POST(request: Request) {
  const originResponse = assertSameOriginRequest(request);

  if (originResponse) {
    return originResponse;
  }

  const payload = await parseJsonPayload(
    request,
    forgotPasswordSchema,
    "Unable to send reset instructions.",
  );

  if (!payload.ok) {
    return payload.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "forgot-password", payload.data.email),
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const user = await findUserByEmail(payload.data.email);

  if (!user) {
    return NextResponse.json({
      ok: true,
      message: passwordResetMessage,
    });
  }

  const { token } = await createPasswordResetToken(user.id);
  const resetUrl = buildAppUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const isProduction = process.env.NODE_ENV === "production";
  let message = passwordResetMessage;

  try {
    const delivery = await sendPasswordResetEmail({
      name: user.name,
      resetUrl,
      to: user.email,
    });

    if (delivery.status === "skipped") {
      message = "Email is not configured locally. Use the preview reset link below.";
    }
  } catch (error) {
    console.error("Unable to send password reset email.", error);

    if (!isProduction) {
      message = "Email delivery failed locally. Use the preview reset link below.";
    }
  }

  return NextResponse.json({
    ok: true,
    message: isProduction ? passwordResetMessage : message,
    previewLink: isProduction ? undefined : resetUrl,
  });
}
