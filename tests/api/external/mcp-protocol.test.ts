import { ApiTokenScope } from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";

import { DELETE, GET, POST } from "@/app/api/external/v1/[transport]/route";
import { createApiToken } from "@/lib/data";
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
