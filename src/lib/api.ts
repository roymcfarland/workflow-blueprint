import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { getCurrentUser } from "@/lib/auth";

type ApiResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      ok: false;
      response: NextResponse;
    };

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

const globalForRateLimit = globalThis as unknown as {
  rateLimitBuckets?: Map<string, { count: number; resetAt: number }>;
};

const rateLimitBuckets = globalForRateLimit.rateLimitBuckets ?? new Map();

if (process.env.NODE_ENV !== "production") {
  globalForRateLimit.rateLimitBuckets = rateLimitBuckets;
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

export async function parseJsonPayload<T>(
  request: Request,
  schema: ZodType<T>,
  fallbackMessage: string,
): Promise<ApiResult<T>> {
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

export async function requireApiUser() {
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

export function rateLimitKey(request: Request, scope: string, identifier?: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipAddress = forwardedFor || request.headers.get("x-real-ip") || "local";

  return [scope, ipAddress, identifier?.toLowerCase()].filter(Boolean).join(":");
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return null;
  }

  bucket.count += 1;

  if (bucket.count <= limit) {
    return null;
  }

  const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);

  return NextResponse.json(
    { message: "Too many attempts. Please try again shortly." },
    {
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
      status: 429,
    },
  );
}
