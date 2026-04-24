import { NextResponse } from "next/server";

import { createPasswordResetToken, findUserByEmail } from "@/lib/data";
import { forgotPasswordSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const payload = forgotPasswordSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { message: payload.error.issues[0]?.message ?? "Unable to send reset instructions." },
      { status: 400 },
    );
  }

  const user = await findUserByEmail(payload.data.email);

  if (!user) {
    return NextResponse.json({
      ok: true,
      message: "If that account exists, a reset link has been prepared.",
    });
  }

  const { token, expiresAt } = await createPasswordResetToken(user.id);
  const resetUrl = new URL(`/reset-password?token=${token}`, request.url);

  return NextResponse.json({
    ok: true,
    message: "If that account exists, a reset link has been prepared.",
    previewLink: process.env.NODE_ENV === "production" ? undefined : resetUrl.toString(),
    expiresAt: expiresAt.toISOString(),
  });
}
