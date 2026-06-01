import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/lib/site-config";

export { checkRateLimit } from "@/lib/rate-limit";
export type { RateLimitOptions } from "@/lib/rate-limit";

type ApiResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export function apiError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function originFromHeader(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function assertSameOriginRequest(request: Request) {
  if (safeMethods.has(request.method)) {
    return null;
  }

  const expectedOrigin = siteConfig.url;

  const originHeader = originFromHeader(request.headers.get("origin"));

  if (originHeader) {
    return originHeader === expectedOrigin
      ? null
      : apiError("Cross-origin requests are not allowed.", 403);
  }

  const refererOrigin = originFromHeader(request.headers.get("referer"));

  if (refererOrigin) {
    return refererOrigin === expectedOrigin
      ? null
      : apiError("Cross-origin requests are not allowed.", 403);
  }

  return apiError("Cross-origin requests are not allowed.", 403);
}

export async function parseJsonPayload<T>(
  request: Request,
  schema: ZodType<T>,
  fallbackMessage: string,
): Promise<ApiResult<T>> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: apiError("Request body must be sent as application/json.", 415),
    };
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: apiError("Request body must be valid JSON."),
    };
  }

  const payload = schema.safeParse(body);

  if (!payload.success) {
    return {
      ok: false,
      response: apiError(payload.error.issues[0]?.message ?? fallbackMessage),
    };
  }

  return {
    data: payload.data,
    ok: true,
  };
}

export async function requireApiUser(request?: Request) {
  if (request) {
    const originResponse = assertSameOriginRequest(request);

    if (originResponse) {
      return {
        ok: false as const,
        response: originResponse,
      };
    }
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false as const,
      response: apiError("Authentication is required.", 401),
    };
  }

  return {
    data: user,
    ok: true as const,
  };
}

export async function requireApiAdmin(request?: Request) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user;
  }

  if (user.data.role !== "ADMIN") {
    return {
      ok: false as const,
      response: apiError("Admin access is required.", 403),
    };
  }

  return user;
}

export function rateLimitKey(request: Request, scope: string, identifier?: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipAddress = forwardedFor || request.headers.get("x-real-ip") || "local";

  return [scope, ipAddress, identifier?.toLowerCase()].filter(Boolean).join(":");
}
