import { createHash, timingSafeEqual } from "node:crypto";

import type { TaskStatus as PrismaTaskStatus } from "@prisma/client";
import { subDays } from "date-fns";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { checkRateLimit, rateLimitKey } from "@/lib/api";
import { userExists } from "@/lib/data";
import { prisma } from "@/lib/db";
import { demoUser, type ItemPriority } from "@/lib/domain";
import {
  externalDailySummaryResponseSchema,
  type ExternalDailySummaryResponse,
  type ExternalDailySummaryTask,
} from "@/lib/external-contract";

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

const externalRateLimit = {
  limit: 120,
  windowMs: 60_000,
};

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

async function checkExternalRateLimit(request: Request, scope: string) {
  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, scope),
    ...externalRateLimit,
  });

  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    rateLimitResponse.headers.set("X-Robots-Tag", "noindex");
  }

  return rateLimitResponse;
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
) {
  return NextResponse.json(
    { ok: false, error: message },
    {
      headers: externalHeaders(headers),
      status,
    },
  );
}

export function externalApiJson<T>(schema: ZodType<T>, data: T, init?: ResponseInit) {
  const payload = schema.safeParse(data);

  if (!payload.success) {
    console.error("External API response validation failed.", payload.error.flatten());

    return externalApiError("External API response failed validation.", 500);
  }

  return NextResponse.json(payload.data, {
    ...init,
    headers: externalHeaders(init?.headers),
  });
}

export async function requireExternalApiAccess(
  request: Request,
  {
    rateLimitScope = "external-api",
  }: {
    rateLimitScope?: string;
  } = {},
): Promise<ApiResult<{ userId: string }>> {
  const rateLimitResponse = await checkExternalRateLimit(request, rateLimitScope);

  if (rateLimitResponse) {
    return {
      ok: false,
      response: rateLimitResponse,
    };
  }

  const expectedKeys = getRequiredExternalApiKeys();

  if (expectedKeys.length === 0) {
    return {
      ok: false,
      response: externalApiError("External API is not configured.", 503),
    };
  }

  const bearer = readBearerToken(request);

  switch (bearer.kind) {
    case "missing":
      return {
        ok: false,
        response: externalApiError("Missing Authorization header.", 401, {
          "WWW-Authenticate": 'Bearer realm="external-api"',
        }),
      };
    case "malformed":
      return {
        ok: false,
        response: externalApiError("Malformed Authorization header.", 401, {
          "WWW-Authenticate": 'Bearer realm="external-api"',
        }),
      };
    case "ok":
      break;
  }

  if (!tokenMatchesAny(bearer.token, expectedKeys)) {
    return {
      ok: false,
      response: externalApiError("Invalid API key.", 403),
    };
  }

  return {
    data: {
      userId: externalUserId(),
    },
    ok: true,
  };
}

export async function requireExternalApiUser(request: Request) {
  const access = await requireExternalApiAccess(request);

  if (!access.ok) {
    return access;
  }

  if (!(await userExists(access.data.userId))) {
    return {
      ok: false as const,
      response: externalApiError("External API user was not found.", 404),
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

export async function handleExternalDailySummary(request: Request) {
  const access = await requireExternalApiAccess(request, {
    rateLimitScope: "external-daily-summary",
  });

  if (!access.ok) {
    return access.response;
  }

  return externalApiJson(
    externalDailySummaryResponseSchema,
    await buildExternalDailySummary(access.data.userId),
  );
}
