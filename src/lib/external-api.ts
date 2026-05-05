import { createHash, timingSafeEqual } from "node:crypto";

import type { TaskStatus as PrismaTaskStatus } from "@prisma/client";
import { subDays } from "date-fns";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { rateLimitKey } from "@/lib/api";
import { userExists } from "@/lib/data";
import { prisma } from "@/lib/db";
import { demoUser, type ItemPriority } from "@/lib/domain";
import {
  externalDailySummaryResponseSchema,
  type ExternalDailySummaryResponse,
  type ExternalDailySummaryTask,
} from "@/lib/external-contract";
import {
  logExternalApiRequest,
  newRequestId,
  type ExternalApiLogFields,
  type ExternalApiOutcome,
} from "@/lib/observability";
import {
  evaluateRateLimit,
  type RateLimitDecision,
} from "@/lib/rate-limit";

type ApiResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      ok: false;
      response: NextResponse;
    };

type BearerResult =
  | { kind: "missing" }
  | { kind: "malformed" }
  | { kind: "ok"; token: string };

type RequireExternalApiAccessOptions = {
  rateLimitScope?: string;
  rateLimitHeaders?: RateLimitHeaders;
  requestId?: string;
};

type RateLimitHeaders = {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
};

type ExternalRateLimitResult =
  | { kind: "ok"; headers: RateLimitHeaders }
  | { kind: "limited"; response: NextResponse; headers: RateLimitHeaders };

export type ExternalApiContext = {
  requestId: string;
  rateLimitHeaders: RateLimitHeaders;
  user: { userId: string };
};

type ExternalApiObservabilityOptions = {
  requireExistingUser?: boolean;
  rateLimitScope?: string;
};

type SentryScope = {
  setContext(name: string, context: Record<string, unknown>): void;
  setTag(name: string, value: string): void;
};

type SentryCaptureApi = {
  captureException(error: unknown): unknown;
  withScope(callback: (scope: SentryScope) => void): void;
};

type SentryCaptureModule = Partial<SentryCaptureApi> & {
  default?: Partial<SentryCaptureApi>;
};

const externalRateLimit = {
  limit: 120,
  windowMs: 60_000,
};

const internalOutcomeHeader = "X-Internal-Outcome";
const recentlyCompletedWindowDays = 7;
const recentlyCompletedLimit = 25;

const priorityMap: Record<ItemPriority, ExternalDailySummaryTask["priority"]> = {
  NONE: "none",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
};

const statusMap: Record<PrismaTaskStatus, ExternalDailySummaryTask["status"]> = {
  ICE_BOX: "ice-box",
  ON_DECK: "on-deck",
  IN_PROGRESS: "in-progress",
  DONE: "done",
  ARCHIVED: "archived",
};

function externalHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);

  nextHeaders.set("Cache-Control", "no-store");
  nextHeaders.set("X-Robots-Tag", "noindex");

  return nextHeaders;
}

function setRateLimitHeaders(headers: Headers, rateLimitHeaders: RateLimitHeaders) {
  headers.set("X-RateLimit-Limit", rateLimitHeaders["X-RateLimit-Limit"]);
  headers.set(
    "X-RateLimit-Remaining",
    rateLimitHeaders["X-RateLimit-Remaining"],
  );
  headers.set("X-RateLimit-Reset", rateLimitHeaders["X-RateLimit-Reset"]);
}

function headersWithRateLimit(
  headers: HeadersInit | undefined,
  rateLimitHeaders: RateLimitHeaders | undefined,
) {
  const nextHeaders = new Headers(headers);

  if (rateLimitHeaders) {
    setRateLimitHeaders(nextHeaders, rateLimitHeaders);
  }

  return nextHeaders;
}

function rateLimitHeadersFor(decision: RateLimitDecision): RateLimitHeaders {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(
      Math.floor(decision.resetAt.getTime() / 1000),
    ),
  };
}

function attachWrapperHeaders(
  response: NextResponse,
  requestId: string,
  rateLimitHeaders: RateLimitHeaders | undefined,
) {
  response.headers.set("X-Request-Id", requestId);

  if (rateLimitHeaders) {
    setRateLimitHeaders(response.headers, rateLimitHeaders);
  }

  response.headers.delete(internalOutcomeHeader);
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function apiKeyPrefixForRequest(request: Request) {
  const bearer = readBearerToken(request);

  if (bearer.kind !== "ok" || bearer.token.length < 8) {
    return null;
  }

  return bearer.token.slice(0, 8);
}

function sentryCaptureApi(module: SentryCaptureModule) {
  if (
    typeof module.captureException === "function" &&
    typeof module.withScope === "function"
  ) {
    return module as SentryCaptureApi;
  }

  if (
    typeof module.default?.captureException === "function" &&
    typeof module.default.withScope === "function"
  ) {
    return module.default as SentryCaptureApi;
  }

  return null;
}

function outcomeForResponse(
  status: number,
  internalOutcome: string | null,
): ExternalApiOutcome {
  if (status === 500 && internalOutcome === "validation_failed") {
    return "validation_failed";
  }

  switch (status) {
    case 200:
      return "ok";
    case 401:
    case 403:
      return "auth_failed";
    case 404:
      return "not_found";
    case 429:
      return "rate_limited";
    default:
      return "server_error";
  }
}

function externalApiLogFields({
  outcome,
  request,
  requestId,
  route,
  startedAt,
  status,
  userId,
}: {
  outcome: ExternalApiOutcome;
  request: Request;
  requestId: string;
  route: string;
  startedAt: number;
  status: number;
  userId: string | null;
}): ExternalApiLogFields {
  return {
    requestId,
    route,
    method: request.method,
    status,
    durationMs: elapsedMs(startedAt),
    apiKeyPrefix: apiKeyPrefixForRequest(request),
    userId,
    outcome,
  };
}

function getExternalApiKey() {
  return process.env.EXTERNAL_API_KEY?.trim() ?? "";
}

function getRequiredExternalApiKeys() {
  const external = getExternalApiKey();

  return external ? [external] : [];
}

function externalUserId() {
  return process.env.EXTERNAL_USER_ID?.trim() || demoUser.id;
}

function readBearerToken(request: Request): BearerResult {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return { kind: "missing" };
  }

  const trimmed = authorization.trim();

  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    return { kind: "malformed" };
  }

  const token = trimmed.slice("bearer ".length).trim();

  if (!token) {
    return { kind: "malformed" };
  }

  return { kind: "ok", token };
}

function tokenMatchesAny(submitted: string, configuredKeys: string[]) {
  if (!submitted || configuredKeys.length === 0) {
    return false;
  }

  const submittedHash = createHash("sha256").update(submitted).digest();

  for (const configured of configuredKeys) {
    if (!configured) {
      continue;
    }

    const configuredHash = createHash("sha256").update(configured).digest();

    if (timingSafeEqual(submittedHash, configuredHash)) {
      return true;
    }
  }

  return false;
}

async function checkExternalRateLimit(
  request: Request,
  scope: string,
  requestId?: string,
): Promise<ExternalRateLimitResult> {
  const decision = await evaluateRateLimit({
    key: rateLimitKey(request, scope),
    ...externalRateLimit,
  });
  const headers = rateLimitHeadersFor(decision);

  if (!decision.limited) {
    return { kind: "ok", headers };
  }

  const responseHeaders = externalHeaders(headers);

  responseHeaders.set("Retry-After", String(decision.retryAfterSeconds));

  if (requestId) {
    responseHeaders.set("X-Request-Id", requestId);
  }

  return {
    kind: "limited",
    headers,
    response: NextResponse.json(
      { message: "Too many attempts. Please try again shortly." },
      {
        headers: responseHeaders,
        status: 429,
      },
    ),
  };
}

function deriveNumericId(value: string) {
  const digest = createHash("sha1").update(value).digest("hex").slice(0, 12);

  return parseInt(digest, 16);
}

function slugToCamel(slug: string): string {
  return slug.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function serializeExternalTask(
  task: {
    id: string;
    title: string;
    description: string | null;
    status: PrismaTaskStatus;
    priority: ItemPriority;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  },
  category: string,
): ExternalDailySummaryTask {
  return {
    id: deriveNumericId(task.id),
    title: task.title,
    description: task.description,
    status: statusMap[task.status],
    category,
    priority: priorityMap[task.priority],
    parentId: null,
    sortOrder: task.sortOrder,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function externalApiError(
  message: string,
  status = 400,
  headers?: HeadersInit,
  requestId?: string,
) {
  const responseHeaders = externalHeaders(headers);

  if (requestId) {
    responseHeaders.set("X-Request-Id", requestId);
  }

  return NextResponse.json(
    { ok: false, error: message },
    {
      headers: responseHeaders,
      status,
    },
  );
}

export function externalApiJson<T>(
  schema: ZodType<T>,
  data: T,
  init?: ResponseInit,
  requestId?: string,
) {
  const payload = schema.safeParse(data);

  if (!payload.success) {
    console.error("External API response validation failed.", payload.error.flatten());

    return externalApiError(
      "External API response failed validation.",
      500,
      {
        [internalOutcomeHeader]: "validation_failed",
      },
      requestId,
    );
  }

  const responseHeaders = externalHeaders(init?.headers);

  if (requestId) {
    responseHeaders.set("X-Request-Id", requestId);
  }

  return NextResponse.json(payload.data, {
    ...init,
    headers: responseHeaders,
  });
}

export async function withExternalApiObservability(
  request: Request,
  route: string,
  handler: (ctx: ExternalApiContext) => Promise<NextResponse>,
  {
    rateLimitScope = "external-api",
    requireExistingUser = true,
  }: ExternalApiObservabilityOptions = {},
): Promise<NextResponse> {
  const requestId = newRequestId();
  const startedAt = performance.now();
  let rateLimitHeaders: RateLimitHeaders | undefined;
  let resolvedUserId: string | null = null;

  try {
    const rateLimit = await checkExternalRateLimit(
      request,
      rateLimitScope,
      requestId,
    );
    rateLimitHeaders = rateLimit.headers;

    if (rateLimit.kind === "limited") {
      attachWrapperHeaders(rateLimit.response, requestId, rateLimit.headers);

      logExternalApiRequest(
        externalApiLogFields({
          outcome: "rate_limited",
          request,
          requestId,
          route,
          startedAt,
          status: rateLimit.response.status,
          userId: null,
        }),
      );

      return rateLimit.response;
    }

    const access = await resolveExternalApiAccess(request, {
      rateLimitHeaders,
      requestId,
    });

    if (!access.ok) {
      const internalOutcome = access.response.headers.get(internalOutcomeHeader);
      const outcome = outcomeForResponse(access.response.status, internalOutcome);

      attachWrapperHeaders(access.response, requestId, rateLimitHeaders);
      logExternalApiRequest(
        externalApiLogFields({
          outcome,
          request,
          requestId,
          route,
          startedAt,
          status: access.response.status,
          userId: null,
        }),
      );

      return access.response;
    }

    resolvedUserId = access.data.userId;

    if (requireExistingUser && !(await userExists(resolvedUserId))) {
      const response = externalApiError(
        "External API user was not found.",
        404,
        headersWithRateLimit(undefined, rateLimitHeaders),
        requestId,
      );

      attachWrapperHeaders(response, requestId, rateLimitHeaders);
      logExternalApiRequest(
        externalApiLogFields({
          outcome: "not_found",
          request,
          requestId,
          route,
          startedAt,
          status: response.status,
          userId: resolvedUserId,
        }),
      );

      return response;
    }

    const response = await handler({
      requestId,
      rateLimitHeaders,
      user: { userId: resolvedUserId },
    });
    const internalOutcome = response.headers.get(internalOutcomeHeader);
    const outcome = outcomeForResponse(response.status, internalOutcome);

    attachWrapperHeaders(response, requestId, rateLimitHeaders);

    logExternalApiRequest(
      externalApiLogFields({
        outcome,
        request,
        requestId,
        route,
        startedAt,
        status: response.status,
        userId: resolvedUserId,
      }),
    );

    return response;
  } catch (error) {
    const outcome: ExternalApiOutcome = "server_error";
    console.error("External API handler threw.", { requestId, route, error });

    try {
      const Sentry = sentryCaptureApi(await import("@sentry/nextjs"));

      if (!Sentry) {
        throw new Error("Sentry capture API is unavailable.");
      }

      Sentry.withScope((scope) => {
        scope.setTag("requestId", requestId);
        scope.setTag("route", route);
        scope.setTag("outcome", outcome);
        scope.setContext("externalApiRequest", {
          apiKeyPrefix: apiKeyPrefixForRequest(request),
          method: request.method,
          userId: resolvedUserId,
        });
        Sentry.captureException(error);
      });
    } catch (sentryError) {
      console.error("Sentry capture failed for external API throw.", sentryError);
    }

    const response = externalApiError(
      "Internal server error.",
      500,
      headersWithRateLimit(undefined, rateLimitHeaders),
      requestId,
    );
    attachWrapperHeaders(response, requestId, rateLimitHeaders);

    logExternalApiRequest(
      externalApiLogFields({
        outcome,
        request,
        requestId,
        route,
        startedAt,
        status: response.status,
        userId: resolvedUserId,
      }),
    );

    return response;
  }
}

async function resolveExternalApiAccess(
  request: Request,
  {
    rateLimitHeaders,
    requestId,
  }: Pick<RequireExternalApiAccessOptions, "rateLimitHeaders" | "requestId"> = {},
): Promise<ApiResult<{ userId: string }>> {
  const expectedKeys = getRequiredExternalApiKeys();

  if (expectedKeys.length === 0) {
    return {
      ok: false,
      response: externalApiError(
        "External API is not configured.",
        503,
        headersWithRateLimit(undefined, rateLimitHeaders),
        requestId,
      ),
    };
  }

  const bearer = readBearerToken(request);

  switch (bearer.kind) {
    case "missing":
      return {
        ok: false,
        response: externalApiError(
          "Missing Authorization header.",
          401,
          headersWithRateLimit(
            {
              "WWW-Authenticate": 'Bearer realm="external-api"',
            },
            rateLimitHeaders,
          ),
          requestId,
        ),
      };
    case "malformed":
      return {
        ok: false,
        response: externalApiError(
          "Malformed Authorization header.",
          401,
          headersWithRateLimit(
            {
              "WWW-Authenticate": 'Bearer realm="external-api"',
            },
            rateLimitHeaders,
          ),
          requestId,
        ),
      };
    case "ok":
      break;
  }

  if (!tokenMatchesAny(bearer.token, expectedKeys)) {
    return {
      ok: false,
      response: externalApiError(
        "Invalid API key.",
        403,
        headersWithRateLimit(undefined, rateLimitHeaders),
        requestId,
      ),
    };
  }

  return {
    data: {
      userId: externalUserId(),
    },
    ok: true,
  };
}

export async function requireExternalApiAccess(
  request: Request,
  {
    rateLimitHeaders,
    rateLimitScope = "external-api",
    requestId,
  }: RequireExternalApiAccessOptions = {},
): Promise<ApiResult<{ userId: string }>> {
  const rateLimit: ExternalRateLimitResult = rateLimitHeaders
    ? { kind: "ok", headers: rateLimitHeaders }
    : await checkExternalRateLimit(request, rateLimitScope, requestId);

  if (rateLimit.kind === "limited") {
    return {
      ok: false,
      response: rateLimit.response,
    };
  }

  return resolveExternalApiAccess(request, {
    rateLimitHeaders: rateLimit.headers,
    requestId,
  });
}

export async function requireExternalApiUser(
  request: Request,
  options: RequireExternalApiAccessOptions = {},
) {
  const rateLimit: ExternalRateLimitResult = options.rateLimitHeaders
    ? { kind: "ok", headers: options.rateLimitHeaders }
    : await checkExternalRateLimit(
        request,
        options.rateLimitScope ?? "external-api",
        options.requestId,
      );

  if (rateLimit.kind === "limited") {
    return {
      ok: false as const,
      response: rateLimit.response,
    };
  }

  const access = await resolveExternalApiAccess(request, {
    rateLimitHeaders: rateLimit.headers,
    requestId: options.requestId,
  });

  if (!access.ok) {
    return access;
  }

  if (!(await userExists(access.data.userId))) {
    return {
      ok: false as const,
      response: externalApiError(
        "External API user was not found.",
        404,
        headersWithRateLimit(undefined, rateLimit.headers),
        options.requestId,
      ),
    };
  }

  return access;
}

export async function buildExternalDailySummary(
  userId: string,
): Promise<ExternalDailySummaryResponse> {
  const boards = await prisma.board.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    include: {
      tasks: {
        orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
      },
    },
  });

  const tasks = boards.flatMap((board) =>
    board.tasks.map((task) =>
      serializeExternalTask(
        {
          ...task,
          priority: task.priority as ItemPriority,
        },
        board.slug,
      ),
    ),
  );

  const byStatusCount: Record<ExternalDailySummaryTask["status"], number> = {
    "ice-box": 0,
    "on-deck": 0,
    "in-progress": 0,
    done: 0,
    archived: 0,
  };
  const byCategoryCount: Record<string, number> = {};

  for (const board of boards) {
    byCategoryCount[slugToCamel(board.slug)] = 0;
  }

  for (const task of tasks) {
    byStatusCount[task.status] += 1;
    const camelCategory = slugToCamel(task.category);
    byCategoryCount[camelCategory] = (byCategoryCount[camelCategory] ?? 0) + 1;
  }

  const totalActive =
    byStatusCount["ice-box"] +
    byStatusCount["on-deck"] +
    byStatusCount["in-progress"] +
    byStatusCount.done;

  const completionDenominator =
    byStatusCount["on-deck"] + byStatusCount["in-progress"] + byStatusCount.done;
  const completionPercentage =
    completionDenominator === 0
      ? 0
      : Math.round((byStatusCount.done / completionDenominator) * 100);

  const completionCutoff = subDays(new Date(), recentlyCompletedWindowDays);
  const recentlyCompleted = boards
    .flatMap((board) =>
      board.tasks
        .filter(
          (task) =>
            task.status === "DONE" &&
            task.completedAt !== null &&
            task.completedAt >= completionCutoff,
        )
        .map((task) => ({
          task,
          board,
          completedAtMs: task.completedAt?.getTime() ?? 0,
        })),
    )
    .sort((a, b) => b.completedAtMs - a.completedAtMs)
    .slice(0, recentlyCompletedLimit)
    .map(({ task, board }) =>
      serializeExternalTask(
        {
          ...task,
          priority: task.priority as ItemPriority,
        },
        board.slug,
      ),
    );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalActive,
      completionRate: `${completionPercentage}%`,
      byStatus: {
        iceBox: byStatusCount["ice-box"],
        onDeck: byStatusCount["on-deck"],
        inProgress: byStatusCount["in-progress"],
        done: byStatusCount.done,
        archived: byStatusCount.archived,
      },
      byCategory: byCategoryCount,
    },
    inProgress: tasks.filter((task) => task.status === "in-progress"),
    onDeck: tasks.filter((task) => task.status === "on-deck"),
    iceBox: tasks.filter((task) => task.status === "ice-box"),
    recentlyCompleted,
  };
}

export async function handleExternalDailySummary(userId: string, requestId?: string) {
  return externalApiJson(
    externalDailySummaryResponseSchema,
    await buildExternalDailySummary(userId),
    undefined,
    requestId,
  );
}
