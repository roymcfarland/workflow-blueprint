import {
  ApiTokenScope,
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
} from "@/generated/prisma/client";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  POST as postMcp,
} from "@/app/api/external/v1/[transport]/route";
import { createApiToken } from "@/lib/data";
import { prisma } from "@/lib/db";
import { resolveExternalToken } from "@/lib/external-api";
import { verifyExternalMcpToken } from "@/lib/mcp-auth";
import {
  executeExternalMcpTool,
  externalMcpToolNames,
  registerExternalMcpTools,
} from "@/lib/mcp-tools";
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

  test("read-only no-input tools return the token owner's planning data", async () => {
    const owner = await createTestUser({
      email: "mcp-read-owner@example.test",
      name: "MCP Read Owner",
    });
    const board = await createNamedBoard(owner.id, "MCP read board", "mcp-read-board");
    await createRouteTask(board.id, "MCP read task");
    const { token } = await createApiToken({
      createdById: owner.id,
      label: "Read MCP token",
      scopes: [ApiTokenScope.BOARDS_READ, ApiTokenScope.TASKS_READ],
    });
    const authInfo = await verifiedMcpAuthInfo(token);

    const dashboardResult = await executeExternalMcpTool(
      "get_dashboard",
      {},
      { authInfo },
    );
    const boardsResult = await executeExternalMcpTool(
      "list_boards",
      {},
      { authInfo },
    );
    const dailySummaryResult = await executeExternalMcpTool(
      "get_daily_summary",
      {},
      { authInfo },
    );

    expect(jsonContent(dashboardResult)).toMatchObject({
      boardBreakdown: [
        {
          name: "MCP read board",
          slug: "mcp-read-board",
          totalTasks: 1,
        },
      ],
      totalTaskCount: 1,
    });
    expect(jsonContent(boardsResult)).toMatchObject({
      boards: [
        {
          name: "MCP read board",
          slug: "mcp-read-board",
          totalTasks: 1,
        },
      ],
    });
    expect(jsonContent(dailySummaryResult)).toMatchObject({
      inProgress: [
        {
          category: "mcp-read-board",
          title: "MCP read task",
        },
      ],
      summary: {
        byStatus: { inProgress: 1 },
        totalActive: 1,
      },
    });
  });

  test("task tools create and delete a task on the token owner's board", async () => {
    const owner = await createTestUser({
      email: "mcp-task-owner@example.test",
      name: "MCP Task Owner",
    });
    const board = await createNamedBoard(owner.id, "MCP task board", "mcp-task-board");
    const { token } = await createApiToken({
      createdById: owner.id,
      label: "Task-write MCP token",
      scopes: [ApiTokenScope.TASKS_WRITE],
    });
    const authInfo = await verifiedMcpAuthInfo(token);

    const createResult = await executeExternalMcpTool(
      "create_task",
      { boardSlug: board.slug, title: "Created via MCP" },
      { authInfo },
    );
    const createdTask = await prisma.task.findFirstOrThrow({
      where: { boardId: board.id, title: "Created via MCP" },
    });

    expect(jsonContent(createResult)).toMatchObject({
      description: null,
      id: createdTask.id,
      priority: PrismaItemPriority.NONE,
      status: PrismaTaskStatus.ON_DECK,
      subtasks: [],
      title: "Created via MCP",
    });

    const deleteResult = await executeExternalMcpTool(
      "delete_task",
      { taskId: createdTask.id },
      { authInfo },
    );

    expect(jsonContent(deleteResult)).toEqual({ ok: true });
    await expect(
      prisma.task.findUnique({ where: { id: createdTask.id } }),
    ).resolves.toBeNull();
  });

  test("board tools create, update, annotate, and delete a board", async () => {
    const owner = await createTestUser({
      email: "mcp-board-owner@example.test",
      name: "MCP Board Owner",
    });
    const { token } = await createApiToken({
      createdById: owner.id,
      label: "Board-write MCP token",
      scopes: [ApiTokenScope.BOARDS_WRITE],
    });
    const authInfo = await verifiedMcpAuthInfo(token);

    const createResult = await executeExternalMcpTool(
      "create_board",
      { name: "MCP Created Board" },
      { authInfo },
    );
    const createdBoard = await prisma.board.findFirstOrThrow({
      where: { name: "MCP Created Board", userId: owner.id },
    });

    expect(jsonContent(createResult)).toMatchObject({
      iconKey: "briefcase",
      name: "MCP Created Board",
      slug: "mcp-created-board",
    });
    expect(createdBoard.description).toBeNull();

    const updateResult = await executeExternalMcpTool(
      "update_board",
      {
        fields: { name: "Renamed via MCP" },
        slug: createdBoard.slug,
      },
      { authInfo },
    );

    expect(jsonContent(updateResult)).toMatchObject({
      name: "Renamed via MCP",
      slug: "renamed-via-mcp",
    });

    const noteResult = await executeExternalMcpTool(
      "update_board_note",
      {
        body: { content: "Note via MCP" },
        slug: "renamed-via-mcp",
      },
      { authInfo },
    );
    const persistedNote = await prisma.boardNote.findUniqueOrThrow({
      where: { boardId: createdBoard.id },
    });

    expect(jsonContent(noteResult)).toEqual({ ok: true });
    expect(persistedNote.content).toBe("Note via MCP");

    const deleteResult = await executeExternalMcpTool(
      "delete_board",
      { slug: "renamed-via-mcp" },
      { authInfo },
    );

    expect(jsonContent(deleteResult)).toEqual({ ok: true });
    await expect(
      prisma.board.findUnique({ where: { id: createdBoard.id } }),
    ).resolves.toBeNull();
  });

  test("subtask tools create, update, and delete a real subtask", async () => {
    const owner = await createTestUser({
      email: "mcp-subtask-owner@example.test",
      name: "MCP Subtask Owner",
    });
    const board = await createNamedBoard(
      owner.id,
      "MCP subtask board",
      "mcp-subtask-board",
    );
    const task = await createRouteTask(board.id, "MCP subtask parent");
    const { token } = await createApiToken({
      createdById: owner.id,
      label: "Subtask-write MCP token",
      scopes: [ApiTokenScope.SUBTASKS_WRITE],
    });
    const authInfo = await verifiedMcpAuthInfo(token);

    const createResult = await executeExternalMcpTool(
      "create_subtask",
      {
        body: { title: "Subtask via MCP" },
        taskId: task.id,
      },
      { authInfo },
    );
    const createdSubtask = await prisma.subtask.findFirstOrThrow({
      where: { taskId: task.id, title: "Subtask via MCP" },
    });

    expect(jsonContent(createResult)).toMatchObject({
      id: task.id,
      subtasks: [
        {
          id: createdSubtask.id,
          isComplete: false,
          title: "Subtask via MCP",
        },
      ],
    });

    const updateResult = await executeExternalMcpTool(
      "update_subtask",
      {
        fields: { isComplete: true },
        subtaskId: createdSubtask.id,
      },
      { authInfo },
    );

    expect(jsonContent(updateResult)).toMatchObject({
      id: task.id,
      subtasks: [
        {
          id: createdSubtask.id,
          isComplete: true,
          title: "Subtask via MCP",
        },
      ],
    });
    await expect(
      prisma.subtask.findUnique({ where: { id: createdSubtask.id } }),
    ).resolves.toMatchObject({ isComplete: true });

    const deleteResult = await executeExternalMcpTool(
      "delete_subtask",
      { subtaskId: createdSubtask.id },
      { authInfo },
    );

    expect(jsonContent(deleteResult)).toMatchObject({
      id: task.id,
      subtasks: [],
    });
    await expect(
      prisma.subtask.findUnique({ where: { id: createdSubtask.id } }),
    ).resolves.toBeNull();
  });

  test("tool dispatch reports unknown names, invalid input, and missing auth", async () => {
    const owner = await createTestUser({
      email: "mcp-dispatch-owner@example.test",
      name: "MCP Dispatch Owner",
    });
    const { token } = await createApiToken({
      createdById: owner.id,
      label: "Dispatch MCP token",
      scopes: [ApiTokenScope.BOARDS_READ, ApiTokenScope.TASKS_WRITE],
    });
    const authInfo = await verifiedMcpAuthInfo(token);

    const unknownToolResult = await executeExternalMcpTool(
      "not_a_real_tool" as never,
      {},
      { authInfo },
    );
    const invalidInputResult = await executeExternalMcpTool(
      "create_task",
      { boardSlug: "missing-title" },
      { authInfo },
    );
    const missingAuthResult = await executeExternalMcpTool(
      "list_boards",
      {},
      {},
    );

    expect(unknownToolResult.isError).toBe(true);
    expect(textContent(unknownToolResult)).toBe(
      "Unknown MCP tool: not_a_real_tool.",
    );
    expect(invalidInputResult.isError).toBe(true);
    expect(textContent(invalidInputResult)).not.toBe("");
    expect(missingAuthResult.isError).toBe(true);
    expect(textContent(missingAuthResult)).toBe("Authentication required.");
  });

  test("externalMcpToolNames returns all registered tools in declaration order", () => {
    expect(externalMcpToolNames()).toEqual([
      "get_dashboard",
      "list_boards",
      "get_board",
      "get_daily_summary",
      "create_task",
      "update_task",
      "delete_task",
      "create_board",
      "update_board",
      "delete_board",
      "update_board_note",
      "create_subtask",
      "update_subtask",
      "delete_subtask",
    ]);
  });

  test("registerExternalMcpTools registers all tools and delegates execution", async () => {
    const owner = await createTestUser({
      email: "mcp-registration-owner@example.test",
      name: "MCP Registration Owner",
    });
    await createNamedBoard(
      owner.id,
      "MCP registration board",
      "mcp-registration-board",
    );
    const { token } = await createApiToken({
      createdById: owner.id,
      label: "Registration MCP token",
      scopes: [ApiTokenScope.BOARDS_READ],
    });
    const authInfo = await verifiedMcpAuthInfo(token);
    const registerTool = vi.fn();
    const fakeServer = { registerTool } as unknown as McpServer;

    registerExternalMcpTools(fakeServer);

    expect(registerTool).toHaveBeenCalledTimes(14);
    const createTaskRegistration = registerTool.mock.calls.find(
      ([name]) => name === "create_task",
    );
    expect(createTaskRegistration?.[1]).toMatchObject({ title: "Create Task" });

    const listBoardsRegistration = registerTool.mock.calls.find(
      ([name]) => name === "list_boards",
    );
    const registeredCallback = listBoardsRegistration?.[2] as
      | ((
          input: unknown,
          extra: { authInfo?: AuthInfo },
        ) => ReturnType<typeof executeExternalMcpTool>)
      | undefined;

    expect(registeredCallback).toBeTypeOf("function");
    const registeredResult = await registeredCallback?.({}, { authInfo });
    const directResult = await executeExternalMcpTool(
      "list_boards",
      {},
      { authInfo },
    );

    expect(registeredResult).toEqual(directResult);
  });
});
