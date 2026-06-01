import { Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { checkRateLimit, parseJsonPayload, rateLimitKey, requireApiUser } from "@/lib/api";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { updateUserProfile } from "@/lib/data";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validators";

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function PATCH(request: Request) {
  const currentUser = await requireApiUser(request);

  if (!currentUser.ok) {
    return currentUser.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "profile-update", currentUser.data.id),
    limit: 30,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const payload = await parseJsonPayload(request, profileSchema, "Unable to save profile.");

  if (!payload.ok) {
    return payload.response;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: currentUser.data.id,
    },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  });

  if (!user) {
    return NextResponse.json({ message: "Unable to load the signed-in user." }, { status: 404 });
  }

  const wantsPasswordChange = Boolean(payload.data.newPassword);
  const wantsEmailChange = payload.data.email !== user.email;
  const requiresCurrentPassword = wantsPasswordChange || wantsEmailChange;

  if (requiresCurrentPassword) {
    if (!payload.data.currentPassword) {
      return NextResponse.json(
        { message: "Current password is required to change your email or password." },
        { status: 400 },
      );
    }

    const currentPasswordMatches = await compare(payload.data.currentPassword, user.passwordHash);

    if (!currentPasswordMatches) {
      return NextResponse.json(
        { message: "Current password is incorrect." },
        { status: 400 },
      );
    }
  }

  const passwordHash = wantsPasswordChange
    ? await hash(payload.data.newPassword as string, 12)
    : undefined;

  try {
    const updatedUser = await updateUserProfile(currentUser.data.id, payload.data, passwordHash);
    const token = await createSessionToken({
      sub: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      passwordChangedAt: updatedUser.passwordChangedAt,
    });

    await setSessionCookie(token);

    return NextResponse.json({
      ok: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        avatarLabel: updatedUser.avatarLabel,
        themePreference: updatedUser.themePreference,
        role: updatedUser.role,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { message: "That email address is already in use." },
        { status: 409 },
      );
    }

    console.error("Unable to update profile.", error);
    return NextResponse.json({ message: "Unable to save profile." }, { status: 500 });
  }
}
