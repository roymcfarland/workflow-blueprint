import { ApiTokenScope, UserRole } from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";

import { DELETE, GET, POST } from "@/app/api/external/v1/[transport]/route";
import { GET as getBoards } from "@/app/api/external/v1/boards/route";
import {
  DELETE as deleteSubtask,
  PATCH as patchSubtask,
} from "@/app/api/external/v1/subtasks/[id]/route";
import {
  DELETE as deleteTask,
  PATCH as patchTask,
} from "@/app/api/external/v1/tasks/[id]/route";
import { POST as postSubtask } from "@/app/api/external/v1/tasks/[id]/subtasks/route";
import { createApiToken, getBoardSummaries, getDashboardSnapshot } from "@/lib/data";
import { prisma } from "@/lib/db";
import { createTestBoard, createTestUser, resetDatabase } from "../../helpers/database";

const origin = "http://127.0.0.1:3000";
const toolNames = [
  "get_dashboard", "list_boards", "get_board", "get_daily_summary",
  "create_task", "update_task", "delete_task", "create_board", "update_board",
  "delete_board", "update_board_note", "create_subtask", "update_subtask", "delete_subtask",
];

function request(body?: unknown, token?: string, method = "POST", transport = "mcp") {
  const headers = new Headers({
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request(`${origin}/api/external/v1/${transport}`, {
    body: body === undefined ? undefined : JSON.stringify(body), headers, method,
  });
}

function context(transport = "mcp") {
  return { params: Promise.resolve({ transport }) };
}

function expectHeaders(response: Response, rateLimited = true) {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  expect([...response.headers.keys()].filter((key) => key.startsWith("access-control-"))).toEqual([]);
  if (rateLimited) {
    for (const name of ["Limit", "Remaining", "Reset"]) {
      expect(response.headers.get(`X-RateLimit-${name}`)).toMatch(/^\d+$/);
    }
  }
}

async function rpc(token: string, method: string, params: unknown = {}) {
  const response = await POST(request({ jsonrpc: "2.0", id: 1, method, params }, token), context());
  expectHeaders(response);
  expect(response.status).toBe(200);
  const body = await response.text();
  const json = response.headers.get("Content-Type")?.includes("text/event-stream")
    ? body.split("\n").find((line) => line.startsWith("data: "))!.slice(6)
    : body;
  return JSON.parse(json);
}

async function handshake(token: string) {
  const initialized = await rpc(token, "initialize", {
    capabilities: {}, clientInfo: { name: "mcp-protocol-test", version: "1.0.0" },
    protocolVersion: "2025-03-26",
  });
  expect(initialized.result.protocolVersion).toBe("2025-03-26");
  expect(initialized.result.serverInfo.name).toBe("workflow-blueprint-external-api");
  const response = await POST(request({ jsonrpc: "2.0", method: "notifications/initialized" }, token), context());
  expect(response.status).toBe(202);
  expectHeaders(response);
}

async function fixture(scopes: ApiTokenScope[] = [ApiTokenScope.BOARDS_READ, ApiTokenScope.TASKS_WRITE]) {
  const owner = await createTestUser();
  const other = await createTestUser({ email: "other@example.test" });
  const board = await createTestBoard(owner.id);
  const otherBoard = await prisma.board.update({
    where: { id: (await createTestBoard(other.id)).id },
    data: { name: "Other board", slug: "other-board" },
  });
  const otherTask = await prisma.task.create({ data: {
    id: randomUUID(), boardId: otherBoard.id, title: "Other owner's task", sortOrder: 0,
    status: "ON_DECK", priority: "NONE",
  } });
  const { token } = await createApiToken({ createdById: owner.id, label: "Protocol test", scopes });
  return { board, otherBoard, otherTask, token };
}

describe("external MCP protocol through the real handler", () => {
  beforeEach(resetDatabase);

  test("anonymous requests return an authenticated challenge", async () => {
    const response = await POST(request({ jsonrpc: "2.0", id: 1, method: "tools/list" }), context());
    expect(response.status).toBe(401);
    expectHeaders(response);
    expect(response.headers.get("WWW-Authenticate")).toBe(
      `Bearer error="invalid_token", error_description="No authorization provided", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    );
  });

  test("2025 handshake lists exactly the 14 USER tools and serializes empty schemas", async () => {
    const { token } = await fixture([ApiTokenScope.BOARDS_READ]);
    await handshake(token);
    const listed = await rpc(token, "tools/list");
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(toolNames);
    for (const name of ["get_dashboard", "list_boards", "get_daily_summary"]) {
      expect(listed.result.tools.find((tool: { name: string }) => tool.name === name).inputSchema)
        .toMatchObject({ type: "object", properties: {} });
    }
  });

  test("read-only tokens cannot call write tools", async () => {
    const { board, token } = await fixture([ApiTokenScope.BOARDS_READ]);
    await handshake(token);
    const result = await rpc(token, "tools/call", { name: "create_task", arguments: { boardSlug: board.slug, title: "Denied" } });
    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toContain("Insufficient token scope");
    expect(await prisma.task.count({ where: { boardId: board.id } })).toBe(0);
  });

  test("a read token receives only its owner's boards", async () => {
    const { board, otherBoard, token } = await fixture([ApiTokenScope.BOARDS_READ]);
    await handshake(token);
    const result = await rpc(token, "tools/call", { name: "list_boards", arguments: {} });
    expect(result.result.isError).not.toBe(true);
    const data = JSON.parse(result.result.content[0].text);
    expect(data.boards.map((item: { slug: string }) => item.slug)).toEqual([board.slug]);
    expect(data.boards.map((item: { slug: string }) => item.slug)).not.toContain(otherBoard.slug);
  });

  test("board counts include only visible tasks in data, REST, and MCP", async () => {
    const { board, token } = await fixture([ApiTokenScope.BOARDS_READ]);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    await prisma.task.createMany({
      data: [
        { title: "Always visible", visibleAt: null },
        { title: "Already visible", visibleAt: new Date(now - day) },
        { title: "Hidden until tomorrow", visibleAt: new Date(now + day) },
        { title: "Hidden until later", visibleAt: new Date(now + 2 * day) },
      ].map((task, sortOrder) => ({
        ...task,
        id: randomUUID(),
        boardId: board.id,
        sortOrder,
        status: "ON_DECK" as const,
        priority: "NONE" as const,
      })),
    });

    const summaries = await getBoardSummaries(board.userId);
    const rest = await getBoards(new Request(`${origin}/api/external/v1/boards`, {
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(rest.status).toBe(200);
    const mcp = await rpc(token, "tools/call", { name: "list_boards", arguments: {} });
    expect(mcp.result.isError).not.toBe(true);

    const expectedBoards = [{ slug: board.slug, totalTasks: 2 }];
    expect.soft(summaries, "getBoardSummaries").toMatchObject(expectedBoards);
    expect.soft(await rest.json(), "REST boards").toMatchObject({ data: { boards: expectedBoards } });
    expect.soft(JSON.parse(mcp.result.content[0].text), "MCP list_boards")
      .toMatchObject({ boards: expectedBoards });
  });

  test.each([UserRole.ADMIN, UserRole.USER])(
    "get_dashboard omits active token metadata for a %s owner",
    async (role) => {
      const { board, token } = await fixture([ApiTokenScope.TASKS_READ]);
      await prisma.user.update({ where: { id: board.userId }, data: { role } });
      await prisma.task.create({ data: {
        id: randomUUID(), boardId: board.id, title: "Dashboard task", sortOrder: 0,
        status: "IN_PROGRESS", priority: "NONE",
      } });
      await createApiToken({
        createdById: board.userId,
        label: "Other dashboard token",
        scopes: [ApiTokenScope.BOARDS_READ],
      });

      const mcp = await rpc(token, "tools/call", { name: "get_dashboard", arguments: {} });
      expect(mcp.result.isError).not.toBe(true);
      const dashboard = JSON.parse(mcp.result.content[0].text);
      const { activeTokens, ...expectedDashboard } = await getDashboardSnapshot(board.userId);

      expect(activeTokens).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Other dashboard token" }),
      ]));
      expect(dashboard).not.toHaveProperty("activeTokens");
      expect(dashboard.totalTaskCount).toBe(1);
      expect(dashboard).toEqual(expectedDashboard);
    },
  );

  test("creating and deleting with A's token leaves B's rows unchanged", async () => {
    const { board, otherBoard, otherTask, token } = await fixture();
    await handshake(token);
    const before = await prisma.task.findMany({ where: { boardId: otherBoard.id } });
    const created = await rpc(token, "tools/call", { name: "create_task", arguments: { boardSlug: board.slug, title: "Owner task" } });
    expect(created.result.isError).not.toBe(true);
    const ownTask = await prisma.task.findFirstOrThrow({ where: { boardId: board.id } });
    const denied = await rpc(token, "tools/call", { name: "delete_task", arguments: { taskId: otherTask.id } });
    expect(denied.result.isError).toBe(true);
    const deleted = await rpc(token, "tools/call", { name: "delete_task", arguments: { taskId: ownTask.id } });
    expect(deleted.result.isError).not.toBe(true);
    expect(await prisma.task.count({ where: { boardId: board.id } })).toBe(0);
    expect(await prisma.task.findMany({ where: { boardId: otherBoard.id } })).toEqual(before);
    expect(await prisma.board.findUnique({ where: { id: otherBoard.id } })).toEqual(otherBoard);
  });

  test("legacy SSE remains 404 with response protections", async () => {
    const { token } = await fixture();
    const response = await POST(request({}, token, "POST", "sse"), context("sse"));
    expect(response.status).toBe(404);
    expectHeaders(response, false);
  });

  test.each([["GET", GET], ["DELETE", DELETE]] as const)("%s session operations return 405", async (method, handler) => {
    const { token } = await fixture();
    const response = await handler(request(undefined, token, method), context());
    expect(response.status).toBe(405);
    expectHeaders(response);
    await response.text();
  });

  test("rate-limited requests return 429 with response protections", async () => {
    const { token } = await fixture();
    await prisma.rateLimitBucket.create({ data: {
      key: "external-mcp:local", count: 120, resetAt: new Date(Date.now() + 60_000),
    } });
    const response = await POST(request({ jsonrpc: "2.0", id: 1, method: "tools/list" }, token), context());
    expect(response.status).toBe(429);
    expect(response.headers.has("Retry-After")).toBe(true);
    expectHeaders(response);
  });
});

function modernRequest(token: string, method: string, params: Record<string, unknown> = {}) {
  const req = request({
    jsonrpc: "2.0", id: 1, method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: "mcp-protocol-test", version: "1.0.0" },
      },
    },
  }, token);
  req.headers.set("MCP-Protocol-Version", "2026-07-28");
  req.headers.set("MCP-Method", method);
  if (typeof params.name === "string") req.headers.set("MCP-Name", params.name);
  return req;
}

const visibilityWrites = [
  {
    tool: "update_task",
    handler: patchTask,
    method: "PATCH",
    path: (id: string) => `tasks/${id}`,
    target: "taskId",
    input: { fields: { title: "Updated task" } },
    status: 200,
    expectedTask: { title: "Updated task", subtasks: [{ title: "Original subtask" }] },
  },
  {
    tool: "delete_task",
    handler: deleteTask,
    method: "DELETE",
    path: (id: string) => `tasks/${id}`,
    target: "taskId",
    input: {},
    status: 200,
    expectedTask: null,
  },
  {
    tool: "create_subtask",
    handler: postSubtask,
    method: "POST",
    path: (id: string) => `tasks/${id}/subtasks`,
    target: "taskId",
    input: { body: { title: "Added subtask" } },
    status: 201,
    expectedTask: { subtasks: [{ title: "Original subtask" }, { title: "Added subtask" }] },
  },
  {
    tool: "update_subtask",
    handler: patchSubtask,
    method: "PATCH",
    path: (id: string) => `subtasks/${id}`,
    target: "subtaskId",
    input: { fields: { title: "Updated subtask", isComplete: true } },
    status: 200,
    expectedTask: { subtasks: [{ title: "Updated subtask", isComplete: true }] },
  },
  {
    tool: "delete_subtask",
    handler: deleteSubtask,
    method: "DELETE",
    path: (id: string) => `subtasks/${id}`,
    target: "subtaskId",
    input: {},
    status: 200,
    expectedTask: { subtasks: [] },
  },
];

async function createVisibilityTask(boardId: string, visibleAt: Date | null) {
  return prisma.task.create({
    data: {
      id: randomUUID(),
      boardId,
      title: "Original task",
      sortOrder: 0,
      status: "ON_DECK",
      visibleAt,
      subtasks: { create: { id: randomUUID(), title: "Original subtask", sortOrder: 0 } },
    },
    include: { subtasks: true },
  });
}

function readVisibilityTask(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: { subtasks: { orderBy: { sortOrder: "asc" } } },
  });
}

describe.each(["REST", "MCP"])("%s external task write visibility", (transport) => {
  beforeEach(resetDatabase);

  test.each(visibilityWrites)("$tool treats hidden tasks as missing and allows visible tasks", async ({
    tool, handler, method, path, target, input, status, expectedTask,
  }) => {
    const { board, otherBoard, token } = await fixture([
      ApiTokenScope.TASKS_WRITE,
      ApiTokenScope.SUBTASKS_WRITE,
    ]);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const hidden = await createVisibilityTask(board.id, new Date(now + day));
    const past = await createVisibilityTask(board.id, new Date(now - day));
    const alwaysVisible = await createVisibilityTask(board.id, null);
    const other = await createVisibilityTask(otherBoard.id, null);

    if (transport === "MCP") {
      await handshake(token);
    }

    const invoke = async (id: string) => {
      if (transport === "MCP") {
        const { result } = await rpc(token, "tools/call", {
          name: tool,
          arguments: { [target]: id, ...input },
        });
        return result;
      }

      const response = await handler(request(input.body ?? input.fields, token, method, path(id)), {
        params: Promise.resolve({ id }),
      });
      return { status: response.status, body: await response.json() };
    };
    const idFor = (task: typeof hidden) => target === "taskId" ? task.id : task.subtasks[0].id;
    const message = target === "taskId" ? "Task not found." : "Subtask not found.";
    const missing = await invoke(randomUUID());
    expect(missing).toEqual(transport === "REST"
      ? { status: 404, body: { ok: false, error: message } }
      : { isError: true, content: [{ type: "text", text: message }] });

    for (const task of [hidden, other]) {
      expect(await invoke(idFor(task))).toEqual(missing);
      expect(await readVisibilityTask(task.id)).toEqual(task);
    }

    for (const task of [past, alwaysVisible]) {
      const result = await invoke(idFor(task));
      const expectedResponse = expectedTask ? { id: task.id, ...expectedTask } : { ok: true };
      if (transport === "REST") {
        expect(result.status).toBe(status);
        expect(result.body).toMatchObject(expectedTask
          ? { ok: true, data: expectedResponse }
          : expectedResponse);
      } else {
        expect(result.isError).not.toBe(true);
        expect(JSON.parse(result.content[0].text)).toMatchObject(expectedResponse);
      }

      const stored = await readVisibilityTask(task.id);
      if (expectedTask) {
        expect(stored).toMatchObject({ ...expectedTask, visibleAt: task.visibleAt });
      } else {
        expect(stored).toBeNull();
        expect(await prisma.subtask.findUnique({ where: { id: task.subtasks[0].id } })).toBeNull();
      }
    }
  });
});

describe("2026-07-28 MCP protocol through the real handler", () => {
  beforeEach(resetDatabase);

  test("per-request envelopes support discovery and all 14 tools without initialization", async () => {
    const { token } = await fixture([ApiTokenScope.BOARDS_READ]);
    const discovered = await POST(modernRequest(token, "server/discover"), context());
    expectHeaders(discovered);
    expect(discovered.status).toBe(200);
    expect(await discovered.json()).toMatchObject({
      result: {
        supportedVersions: ["2026-07-28"],
        _meta: { "io.modelcontextprotocol/serverInfo": { name: "workflow-blueprint-external-api" } },
      },
    });
    const listed = await POST(modernRequest(token, "tools/list"), context());
    expectHeaders(listed);
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(toolNames);
  });

  test("native calls receive the owner's auth and enforce write scopes", async () => {
    const { board, token } = await fixture([ApiTokenScope.BOARDS_READ]);
    const listed = await POST(modernRequest(token, "tools/call", { name: "list_boards", arguments: {} }), context());
    expectHeaders(listed);
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(body.result.isError).not.toBe(true);
    expect(JSON.parse(body.result.content[0].text).boards.map((item: { slug: string }) => item.slug)).toEqual([board.slug]);
    const denied = await POST(modernRequest(token, "tools/call", {
      name: "create_task", arguments: { boardSlug: board.slug, title: "Denied native call" },
    }), context());
    expectHeaders(denied);
    expect(await denied.json()).toMatchObject({ result: {
      isError: true, content: [{ type: "text", text: "Insufficient token scope: requires TASKS_WRITE." }],
    } });
    expect(await prisma.task.count({ where: { boardId: board.id } })).toBe(0);
  });

  test("subscriptions/listen is rejected without opening an SSE stream", async () => {
    const { token } = await fixture([ApiTokenScope.BOARDS_READ]);
    const response = await POST(modernRequest(token, "subscriptions/listen", { notifications: {} }), context());
    expectHeaders(response);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Type")).not.toContain("text/event-stream");
    expect(await response.json()).toMatchObject({
      error: { code: -32603, message: "Subscription limit reached" },
    });
  });
});
