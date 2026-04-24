import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { parseJsonPayload, requireApiUser } from "@/lib/api";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { updateUserProfile } from "@/lib/data";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  const currentUser = await requireApiUser();

  if (!currentUser.ok) {
    return currentUser.response;
  }

  const payload = await parseJsonPayload(request, profileSchema, "Unable to save profile.");

  if (!payload.ok) {
    return payload.response;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: currentUser.data.id,
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
    const updatedUser = await updateUserProfile(currentUser.data.id, payload.data, passwordHash);
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
