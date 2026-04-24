import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { createSessionToken, requireCurrentUser, setSessionCookie } from "@/lib/auth";
import { updateUserProfile } from "@/lib/data";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  const currentUser = await requireCurrentUser();
  const payload = profileSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { message: payload.error.issues[0]?.message ?? "Unable to save profile." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      id: currentUser.id,
    },
  });

  if (!user) {
    return NextResponse.json({ message: "Unable to load the signed-in user." }, { status: 404 });
  }

  let passwordHash: string | undefined;

  if (payload.data.newPassword) {
    const currentPasswordMatches = await compare(
      payload.data.currentPassword ?? "",
      user.passwordHash,
    );

    if (!currentPasswordMatches) {
      return NextResponse.json(
        { message: "Current password is incorrect." },
        { status: 400 },
      );
    }

    passwordHash = await hash(payload.data.newPassword, 12);
  }

  try {
    const updatedUser = await updateUserProfile(currentUser.id, payload.data, passwordHash);
    const token = await createSessionToken({
      sub: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
    });

    await setSessionCookie(token);

    return NextResponse.json({ ok: true, user: updatedUser });
  } catch {
    return NextResponse.json(
      { message: "That email address is already in use." },
      { status: 400 },
    );
  }
}
