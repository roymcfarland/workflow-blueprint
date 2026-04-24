import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { resetPasswordWithToken } from "@/lib/data";
import { prisma } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const payload = resetPasswordSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { message: payload.error.issues[0]?.message ?? "Unable to reset password." },
      { status: 400 },
    );
  }

  const passwordHash = await hash(payload.data.password, 12);
  const userId = await resetPasswordWithToken(payload.data.token, passwordHash);

  if (!userId) {
    return NextResponse.json(
      { message: "That reset link is invalid or has expired." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    return NextResponse.json({ message: "Unable to load that account." }, { status: 404 });
  }

  const token = await createSessionToken({
    sub: user.id,
    email: user.email,
    name: user.name,
  });

  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
