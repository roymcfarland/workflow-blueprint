import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { subDays } from "date-fns";

import { checkRateLimit, rateLimitKey } from "@/lib/api";
import { prisma } from "@/lib/db";
import { boardDefinitions, demoUser, type BoardSlug } from "@/lib/domain";
import type { TaskStatus as PrismaTaskStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type ExternalTaskStatus =
  | "ice-box"
  | "on-deck"
  | "in-progress"
  | "done"
  | "archived";

const statusMap: Record<PrismaTaskStatus, ExternalTaskStatus> = {
  ICE_BOX: "ice-box",
  ON_DECK: "on-deck",
  IN_PROGRESS: "in-progress",
  DONE: "done",
  ARCHIVED: "archived",
};

const allowedCategories = boardDefinitions.map(
  (board) => board.slug,
) as readonly BoardSlug[];

const externalRateLimit = {
  limit: 120,
  windowMs: 60_000,
};

const recentlyCompletedWindowDays = 7;
const recentlyCompletedLimit = 25;

function jsonResponse(body: unknown, status: number, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);

  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex");

  return NextResponse.json(body, { headers, status });
}

function jsonError(message: string, status: number, extraHeaders?: HeadersInit) {
  return jsonResponse({ ok: false, error: message }, status, extraHeaders);
}

function getExpectedApiKeys() {
  const external = process.env.EXTERNAL_API_KEY?.trim() ?? "";
  const readOnly = process.env.READ_ONLY_API_KEY?.trim() ?? "";

  if (external) {
    return [external];
  }

  if (readOnly) {
    return [readOnly];
  }

  return [];
}

function externalUserId() {
  return (
    process.env.EXTERNAL_USER_ID?.trim() ||
    process.env.READ_ONLY_USER_ID?.trim() ||
    demoUser.id
  );
}

type BearerResult =
  | { kind: "missing" }
  | { kind: "malformed" }
  | { kind: "ok"; token: string };

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

// Stable 48-bit positive integer derived from the UUID string. The OpenAPI
// contract types ids as integers, but the DB stores them as UUIDs, so we hash
// the UUID into an integer that fits inside JavaScript's safe-integer range.
function deriveNumericId(value: string) {
  const digest = createHash("sha1").update(value).digest("hex").slice(0, 12);

  return parseInt(digest, 16);
}

function isAllowedCategory(slug: string): slug is BoardSlug {
  return (allowedCategories as readonly string[]).includes(slug);
}

function categoryToCamel(slug: BoardSlug): "personal" | "elevatedOrganics" | "brightlineLabs" {
  switch (slug) {
    case "personal":
      return "personal";
    case "elevated-organics":
      return "elevatedOrganics";
    case "brightline-labs":
      return "brightlineLabs";
  }
}

type ExternalTask = {
  id: number;
  title: string;
  description: string | null;
  status: ExternalTaskStatus;
  category: BoardSlug;
  parentId: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export async function GET(request: Request) {
  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "external-daily-summary"),
    ...externalRateLimit,
  });

  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    rateLimitResponse.headers.set("X-Robots-Tag", "noindex");
    return rateLimitResponse;
  }

  const expectedKeys = getExpectedApiKeys();

  if (expectedKeys.length === 0) {
    return jsonError("External API is not configured.", 503);
  }

  const bearer = readBearerToken(request);

  switch (bearer.kind) {
    case "missing":
      return jsonError("Missing Authorization header.", 401, {
        "WWW-Authenticate": 'Bearer realm="external-api"',
      });
    case "malformed":
      return jsonError("Malformed Authorization header.", 401, {
        "WWW-Authenticate": 'Bearer realm="external-api"',
      });
    case "ok":
      break;
  }

  if (!tokenMatchesAny(bearer.token, expectedKeys)) {
    return jsonError("Invalid API key.", 403);
  }

  const userId = externalUserId();
  const boards = await prisma.board.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    include: {
      tasks: {
        orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
      },
    },
  });

  const tasks: ExternalTask[] = boards
    .filter((board) => isAllowedCategory(board.slug))
    .flatMap((board) =>
      board.tasks.map((task) => ({
        id: deriveNumericId(task.id),
        title: task.title,
        description: task.description,
        status: statusMap[task.status],
        category: board.slug as BoardSlug,
        parentId: null,
        sortOrder: task.sortOrder,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      })),
    );

  const byStatusCount: Record<ExternalTaskStatus, number> = {
    "ice-box": 0,
    "on-deck": 0,
    "in-progress": 0,
    done: 0,
    archived: 0,
  };
  const byCategoryCount = {
    personal: 0,
    elevatedOrganics: 0,
    brightlineLabs: 0,
  };

  for (const task of tasks) {
    byStatusCount[task.status] += 1;
    byCategoryCount[categoryToCamel(task.category)] += 1;
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

  const inProgress = tasks.filter((task) => task.status === "in-progress");
  const onDeck = tasks.filter((task) => task.status === "on-deck");
  const iceBox = tasks.filter((task) => task.status === "ice-box");

  const completionCutoff = subDays(new Date(), recentlyCompletedWindowDays);
  // Built directly off the source rows so we can sort by completedAt without
  // round-tripping through hashed numeric ids.
  const recentlyCompleted: ExternalTask[] = boards
    .filter((board) => isAllowedCategory(board.slug))
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
    .map(({ task, board }) => ({
      id: deriveNumericId(task.id),
      title: task.title,
      description: task.description,
      status: statusMap[task.status],
      category: board.slug as BoardSlug,
      parentId: null,
      sortOrder: task.sortOrder,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }));

  const body = {
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
    inProgress,
    onDeck,
    iceBox,
    recentlyCompleted,
  };

  return jsonResponse(body, 200);
}
