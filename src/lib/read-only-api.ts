import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { checkRateLimit, rateLimitKey } from "@/lib/api";
import { userExists } from "@/lib/data";
import { demoUser } from "@/lib/domain";

type ApiResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      ok: false;
      response: NextResponse;
    };

const readOnlyRateLimit = {
  limit: 240,
  windowMs: 60_000,
};

function readOnlyHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);

  nextHeaders.set("Cache-Control", "no-store");
  nextHeaders.set("X-Robots-Tag", "noindex");

  return nextHeaders;
}

function getConfiguredApiKey() {
  return process.env.READ_ONLY_API_KEY?.trim() ?? "";
}

function getSubmittedApiKey(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return request.headers.get("x-api-key")?.trim() ?? "";
}

function tokensMatch(submittedToken: string, configuredToken: string) {
  if (!submittedToken || !configuredToken) {
    return false;
  }

  const submittedHash = createHash("sha256").update(submittedToken).digest();
  const configuredHash = createHash("sha256").update(configuredToken).digest();

  return timingSafeEqual(submittedHash, configuredHash);
}

export function readOnlyUserId() {
  return process.env.READ_ONLY_USER_ID?.trim() || demoUser.id;
}

export function readOnlyApiError(message: string, status = 400, headers?: HeadersInit) {
  return NextResponse.json(
    { message },
    {
      headers: readOnlyHeaders(headers),
      status,
    },
  );
}

export function readOnlyApiJson<T>(schema: ZodType<T>, data: T, init?: ResponseInit) {
  const payload = schema.safeParse(data);

  if (!payload.success) {
    console.error("Read-only API response validation failed.", payload.error.flatten());

    return readOnlyApiError("Read-only API response failed validation.", 500);
  }

  return NextResponse.json(payload.data, {
    ...init,
    headers: readOnlyHeaders(init?.headers),
  });
}

export function requireReadOnlyApiAccess(request: Request): ApiResult<{ userId: string }> {
  const rateLimitResponse = checkRateLimit({
    key: rateLimitKey(request, "read-only-api"),
    ...readOnlyRateLimit,
  });

  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    rateLimitResponse.headers.set("X-Robots-Tag", "noindex");

    return {
      ok: false,
      response: rateLimitResponse,
    };
  }

  const configuredApiKey = getConfiguredApiKey();

  if (!configuredApiKey) {
    return {
      ok: false,
      response: readOnlyApiError("Read-only API is not configured.", 503),
    };
  }

  if (!tokensMatch(getSubmittedApiKey(request), configuredApiKey)) {
    return {
      ok: false,
      response: readOnlyApiError("A valid read-only API key is required.", 401, {
        "WWW-Authenticate": 'Bearer realm="read-only-api"',
      }),
    };
  }

  return {
    data: {
      userId: readOnlyUserId(),
    },
    ok: true,
  };
}

export async function requireReadOnlyApiUser(request: Request) {
  const access = requireReadOnlyApiAccess(request);

  if (!access.ok) {
    return access;
  }

  if (!(await userExists(access.data.userId))) {
    return {
      ok: false as const,
      response: readOnlyApiError("Read-only API user was not found.", 404),
    };
  }

  return access;
}
