import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";

export type AdminAuditEvent = {
  actor: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
};

export async function recordAdminAudit(event: AdminAuditEvent) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        actor: event.actor,
        action: event.action,
        target: event.target,
        metadata: event.metadata ? (event.metadata as object) : undefined,
      },
    });
  } catch (error) {
    // Audit logging should never block the underlying admin action. Surface
    // the failure to logs so an operator can investigate.
    console.error("Unable to write admin audit log.", error);
  }
}
