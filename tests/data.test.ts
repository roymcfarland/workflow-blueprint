import { createHash } from "node:crypto";
import { describe, expect, test, beforeEach } from "vitest";

import { createApiToken, createTaskForBoard, listApiTokens, revokeApiToken } from "@/lib/data";
import { prisma } from "@/lib/db";
import { starterBoard } from "@/lib/domain";
import { createTestBoard, createTestUser, resetDatabase } from "./helpers/database";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("src/lib/data.ts", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test("creates a task and subtasks through the Serializable task transaction", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: "",
      dueDate: "2026-05-05",
      priority: "HIGH",
      status: "IN_PROGRESS",
      subtasks: [
        {
          isComplete: false,
          title: "Draft the harness notes",
        },
      ],
      title: "Ship test harness",
    });

    expect(task).toMatchObject({
      description: "",
      dueDate: "2026-05-05T00:00:00.000Z",
      priority: "HIGH",
      sortOrder: 0,
      status: "IN_PROGRESS",
      subtasks: [
        expect.objectContaining({
          isComplete: false,
          priority: "NONE",
          sortOrder: 0,
          title: "Draft the harness notes",
        }),
      ],
      title: "Ship test harness",
    });
    await expect(prisma.task.count()).resolves.toBe(1);
    await expect(prisma.subtask.count()).resolves.toBe(1);
  });

  test("creates API tokens with hash-only persistence", async () => {
    const user = await createTestUser({
      email: "admin@example.test",
      name: "Admin User",
    });

    const { apiToken, token } = await createApiToken({
      createdById: user.id,
      label: "  External Consumer  ",
    });

    expect(token).toMatch(/^wbk_/);
    expect(apiToken).toMatchObject({
      createdBy: {
        email: user.email,
        name: user.name,
      },
      label: "External Consumer",
      prefix: token.slice(0, 12),
      status: "ACTIVE",
    });
    expect(apiToken).not.toHaveProperty("tokenHash");

    const row = await prisma.apiToken.findUniqueOrThrow({
      where: { id: apiToken.id },
    });
    const rowValues = Object.values(row).map((value) =>
      value instanceof Date ? value.toISOString() : String(value ?? ""),
    );

    expect(row.tokenHash).toBe(sha256(token));
    expect(row.prefix).toBe(token.slice(0, 12));
    expect(rowValues).not.toContain(token);
  });

  test("lists API tokens newest first without exposing token hashes", async () => {
    const user = await createTestUser();
    const first = await createApiToken({
      createdById: user.id,
      label: "First consumer",
    });
    const second = await createApiToken({
      createdById: user.id,
      label: "Second consumer",
    });

    await prisma.apiToken.update({
      where: { id: first.apiToken.id },
      data: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    await prisma.apiToken.update({
      where: { id: second.apiToken.id },
      data: { createdAt: new Date("2026-01-02T00:00:00.000Z") },
    });

    const tokens = await listApiTokens();

    expect(tokens.map((token) => token.label)).toEqual(["Second consumer", "First consumer"]);
    expect(tokens.every((token) => !("tokenHash" in token))).toBe(true);
  });

  test("revokes API tokens once and surfaces revoked status", async () => {
    const user = await createTestUser();
    const { apiToken } = await createApiToken({
      createdById: user.id,
      label: "Reporting partner",
    });

    await expect(revokeApiToken(apiToken.id)).resolves.toEqual({
      id: apiToken.id,
      label: "Reporting partner",
    });

    const row = await prisma.apiToken.findUniqueOrThrow({
      where: { id: apiToken.id },
    });
    expect(row.revokedAt).toBeInstanceOf(Date);

    const [listedToken] = await listApiTokens();
    expect(listedToken).toMatchObject({
      id: apiToken.id,
      revokedAt: expect.any(String),
      status: "REVOKED",
    });

    await expect(revokeApiToken(apiToken.id)).resolves.toBeNull();
    await expect(revokeApiToken("missing-token-id")).resolves.toBeNull();
  });
});
