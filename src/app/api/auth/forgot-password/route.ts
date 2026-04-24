import { NextResponse } from "next/server";

import { checkRateLimit, parseJsonPayload, rateLimitKey } from "@/lib/api";
import { createPasswordResetToken, findUserByEmail } from "@/lib/data";
import { forgotPasswordSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const payload = await parseJsonPayload(
    request,
    forgotPasswordSchema,
    "Unable to send reset instructions.",
  );

  if (!payload.ok) {
    return payload.response;
  }

  const rateLimitResponse = checkRateLimit({
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
      message: "If that account exists, a reset link has been prepared.",
    });
  }

  const { token } = await createPasswordResetToken(user.id);
  const resetUrl = new URL(`/reset-password?token=${token}`, request.url);

  return NextResponse.json({
    ok: true,
    message: "If that account exists, a reset link has been prepared.",
    previewLink: process.env.NODE_ENV === "production" ? undefined : resetUrl.toString(),
  });
}
