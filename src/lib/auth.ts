import { ThemePreference as PrismaThemePreference } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import {
  sessionCookieName,
  themePreferenceDbMap,
  themePreferenceUiMap,
  type ThemePreference,
} from "@/lib/domain";

type SessionClaims = {
  sub: string;
  email: string;
  name: string;
  passwordChangedAt: Date;
};

type CookieOptions = {
  maxAge: number;
};

const minimumProductionSecretLength = 32;
const devFallbackSecret = "workflow-blueprint-dev-fallback-secret";
const textEncoder = new TextEncoder();

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim();

  if (secret) {
    if (process.env.NODE_ENV === "production" && secret.length < minimumProductionSecretLength) {
      throw new Error(
        `AUTH_SECRET must be at least ${minimumProductionSecretLength} characters in production.`,
      );
    }

    return textEncoder.encode(secret);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be configured in production.");
  }

  return textEncoder.encode(devFallbackSecret);
}

function cookieConfig(rememberMe = false): CookieOptions {
  return {
    maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7,
  };
}

export function themePreferenceToUi(preference: PrismaThemePreference): ThemePreference {
  return themePreferenceUiMap[preference];
}

export function themePreferenceToDb(preference: ThemePreference) {
  return themePreferenceDbMap[preference];
}

export async function createSessionToken(user: SessionClaims, rememberMe = false) {
  return new SignJWT({
    email: user.email,
    name: user.name,
    pwdAt: Math.floor(user.passwordChangedAt.getTime() / 1000),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${cookieConfig(rememberMe).maxAge}s`)
    .sign(getAuthSecret());
}

export async function setSessionCookie(token: string, rememberMe = false) {
  const cookieStore = await cookies();
  const config = cookieConfig(rememberMe);

  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    maxAge: config.maxAge,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

type SessionPayload = {
  userId: string;
  email: unknown;
  name: unknown;
  passwordChangedAtSeconds: number | null;
};

async function readSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());

    if (typeof payload.sub !== "string") {
      return null;
    }

    const passwordChangedAtSeconds =
      typeof payload.pwdAt === "number" && Number.isFinite(payload.pwdAt) ? payload.pwdAt : null;

    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      passwordChangedAtSeconds,
    };
  } catch {
    return null;
  }
}

export async function readSession() {
  const payload = await readSessionPayload();

  if (!payload) {
    return null;
  }

  return {
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
  };
}

export async function getCurrentUser() {
  const session = await readSessionPayload();

  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatarLabel: true,
      themePreference: true,
      role: true,
      passwordChangedAt: true,
    },
  });

  if (!user) {
    return null;
  }

  // Reject sessions issued before the most recent password change. New tokens
  // include the user's passwordChangedAt as a `pwdAt` claim. Old tokens (no
  // claim) are also rejected so password changes/resets fully invalidate them.
  const currentPwdAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);

  if (
    session.passwordChangedAtSeconds === null ||
    session.passwordChangedAtSeconds < currentPwdAtSeconds
  ) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarLabel: user.avatarLabel,
    role: user.role,
    themePreference: themePreferenceToUi(user.themePreference),
    passwordChangedAt: user.passwordChangedAt,
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return user;
}

export async function requireCurrentAdmin() {
  const user = await requireCurrentUser();

  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return user;
}
