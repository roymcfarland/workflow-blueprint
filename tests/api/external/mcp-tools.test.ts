import {
  ApiTokenScope,
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
} from "@/generated/prisma/client";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";

import {
  POST as postMcp,
} from "@/app/api/external/v1/[transport]/route";
import { createApiToken } from "@/lib/data";
import { prisma } from "@/lib/db";
import { resolveExternalToken } from "@/lib/external-api";
import { verifyExternalMcpToken } from "@/lib/mcp-auth";
import { executeExternalMcpTool } from "@/lib/mcp-tools";
import {
  createTestBoard,
  createTestUser,
  resetDatabase,
  seedPlanningData,
} from "../../helpers/database";

function externalUrl(path: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return new URL(path, origin);
}

function mcpRequest(token?: string) {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return new Request(externalUrl("/api/external/v1/mcp"), {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "workflow-blueprint-test", version: "1.0.0" },
        protocolVersion: "2025-03-26",
      },
    }),
    headers,
    method: "POST",
  });
}

async function verifiedMcpAuthInfo(token: string): Promise<AuthInfo> {
  const authInfo = await verifyExternalMcpToken(mcpRequest(token), token);

  if (!authInfo) {
    throw new Error("Expected MCP token verification to succeed.");
  }

  return authInfo;
}

function textContent(result: Awaited<ReturnType<typeof executeExternalMcpTool>>) {
  const block = result.content[0];

  if (!block || block.type !== "text") {
    throw new Error("Expected MCP tool result to include text content.");
  }

  return block.text;
}

function jsonContent(result: Awaited<ReturnType<typeof executeExternalMcpTool>>) {
  expect(result.isError).not.toBe(true);

  return JSON.parse(textContent(result)) as unknown;
}

async function createNamedBoard(userId: string, name: string, slug: string) {
  const board = await createTestBoard(userId);

  return prisma.board.update({
    data: { name, slug },
    where: { id: board.id },
  });
}

async function createRouteTask(boardId: string, title: string) {
  return prisma.task.create({
    data: {
      boardId,
      id: randomUUID(),
      priority: PrismaItemPriority.NONE,
      sortOrder: 0,
      status: PrismaTaskStatus.IN_PROGRESS,
      title,
    },
  });
}

describe("external MCP tools", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlanningData();
  });

  test("DB-token tools operate only on the token owner's data", async () => {
    const owner = await createTestUser({
      email: "mcp-owner@example.test",
      name: "MCP Owner",
    });
    const otherUser = await createTestUser({
      email: "mcp-other@example.test",
      name: "MCP Other",
    });
    const ownerBoard = await createNamedBoard(owner.id, "Owner board", "owner-board");
    const otherBoard = await createNamedBoard(
      otherUser.id,
      "Other board",
      "other-board",
    );
    const otherTask = await createRouteTask(otherBoard.id, "Other user's task");
    const { token } = await createApiToken({
      createdById: owner.id,
      label: "Owner MCP token",
      scopes: [ApiTokenScope.BOARDS_READ, ApiTokenScope.TASKS_WRITE],
    });
    const authInfo = await verifiedMcpAuthInfo(token);

    const ownerBoardResult = await executeExternalMcpTool(
      "get_board",
      { slug: ownerBoard.slug },
      { authInfo },
    );
    const otherBoardResult = await executeExternalMcpTool(
      "get_board",
      { slug: otherBoard.slug },
      { authInfo },
    );
    const otherTaskResult = await executeExternalMcpTool(
      "update_task",
      {
        fields: { title: "Stolen task" },
        taskId: otherTask.id,
      },
      { authInfo },
    );
    const unchangedOtherTask = await prisma.task.findUniqueOrThrow({
      where: { id: otherTask.id },
    });

    expect(jsonContent(ownerBoardResult)).toMatchObject({
      name: "Owner board",
      slug: "owner-board",
    });
    expect(otherBoardResult.isError).toBe(true);
    expect(textContent(otherBoardResult)).toBe("Board not found.");
    expect(otherTaskResult.isError).toBe(true);
    expect(textContent(otherTaskResult)).toBe("Task not found.");
    expect(unchangedOtherTask).toMatchObject({
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Other user's task",
    });
  });

  test("tools reject missing per-tool scopes before mutating data", async () => {
    const owner = await createTestUser({
      email: "mcp-scope-owner@example.test",
      name: "MCP Scope Owner",
    });
    const board = await createNamedBoard(owner.id, "Scope board", "scope-board");
    const task = await createRouteTask(board.id, "Scoped task");
    const { token } = await createApiToken({
      createdById: owner.id,
      label: "Read-only MCP token",
      scopes: [ApiTokenScope.TASKS_READ],
    });
    const authInfo = await verifiedMcpAuthInfo(token);

    const result = await executeExternalMcpTool(
      "update_task",
      {
        fields: { title: "Forbidden update" },
        taskId: task.id,
      },
      { authInfo },
    );
    const unchangedTask = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
    });

    expect(result.isError).toBe(true);
    expect(textContent(result)).toBe(
      "Insufficient token scope: requires TASKS_WRITE.",
    );
    expect(unchangedTask.title).toBe("Scoped task");
  });

  test("MCP token verification resolves DB tokens to their owner", async () => {
    const owner = await createTestUser({
      email: "mcp-resolution-owner@example.test",
      name: "MCP Resolution Owner",
    });
    const { token } = await createApiToken({
      createdById: owner.id,
      label: "Resolution MCP token",
      scopes: [ApiTokenScope.BOARDS_READ],
    });

    const resolved = await resolveExternalToken(mcpRequest(token));
    const authInfo = await verifiedMcpAuthInfo(token);
    const legacyResolved = await resolveExternalToken(
      mcpRequest(process.env.EXTERNAL_API_KEY ?? ""),
    );

    expect(resolved).toEqual({
      scopes: [ApiTokenScope.BOARDS_READ],
      userId: owner.id,
    });
    expect(authInfo.clientId).toBe(owner.id);
    expect(authInfo.extra).toMatchObject({
      scopes: [ApiTokenScope.BOARDS_READ],
      userId: owner.id,
    });
    expect(authInfo.clientId).not.toBe(process.env.EXTERNAL_USER_ID);
    expect(legacyResolved).toBeNull();
  });

  test("anonymous MCP requests are rejected", async () => {
    await expect(verifyExternalMcpToken(mcpRequest(), undefined)).resolves.toBe(
      undefined,
    );

    const response = await postMcp(mcpRequest(), {
      params: Promise.resolve({ transport: "mcp" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });
});
