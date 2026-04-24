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
};

type CookieOptions = {
  maxAge: number;
};

const textEncoder = new TextEncoder();

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (secret) {
    return textEncoder.encode(secret);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be configured in production.");
  }

  return textEncoder.encode("workflow-blueprint-dev-fallback-secret");
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
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function readSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());

    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await readSession();

  if (!session?.userId) {
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
    },
  });

  if (!user) {
    return null;
  }

  return {
    ...user,
    themePreference: themePreferenceToUi(user.themePreference),
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return user;
}
