import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";

import { recordAdminAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

describe("recordAdminAudit", () => {
  test("records an event without metadata", async () => {
    const actor = `l3a-${randomUUID()}`;

    try {
      await expect(
        recordAdminAudit({
          action: "l3a.test",
          actor,
          target: "coverage",
        }),
      ).resolves.toBeUndefined();

      await expect(prisma.adminAuditLog.findFirstOrThrow({ where: { actor } })).resolves.toMatchObject({
        action: "l3a.test",
        metadata: null,
        target: "coverage",
      });
    } finally {
      await prisma.adminAuditLog.deleteMany({ where: { actor } });
    }
  });

  test("logs and absorbs insert failures", async () => {
    const error = new Error("boom");
    const createSpy = vi
      .spyOn(prisma.adminAuditLog, "create")
      .mockRejectedValueOnce(error);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        recordAdminAudit({
          action: "l3a.test",
          actor: "test-actor",
          target: "coverage",
        }),
      ).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith("Unable to write admin audit log.", error);
    } finally {
      consoleErrorSpy.mockRestore();
      createSpy.mockRestore();
    }
  });
});
