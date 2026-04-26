import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { UserRole } from "@prisma/client";

import { hydrateDatabaseUrlEnv } from "../src/lib/database-url";
import { prisma } from "../src/lib/db";
import { loadProjectEnv } from "../src/lib/load-env";

loadProjectEnv();
hydrateDatabaseUrlEnv({ preferDirectConnection: true });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function adminEmailsFromEnvironment() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

function actorLabel() {
  return (
    process.env.ADMIN_PROMOTE_ACTOR?.trim() ||
    process.env.USER ||
    process.env.LOGNAME ||
    "scripts/admin-promote"
  );
}

async function confirm(question: string) {
  if (process.env.ADMIN_PROMOTE_NONINTERACTIVE === "true") {
    return true;
  }

  const rl = createInterface({ input, output });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();

  return answer === "y" || answer === "yes";
}

async function promoteAdmins() {
  const emails = [
    ...new Set([
      ...process.argv.slice(2).map(normalizeEmail),
      ...adminEmailsFromEnvironment(),
    ]),
  ].filter(Boolean);

  if (emails.length === 0) {
    throw new Error("Pass at least one email or configure ADMIN_EMAILS.");
  }

  const matches = await prisma.user.findMany({
    where: {
      email: { in: emails },
      role: { not: UserRole.ADMIN },
    },
    select: { id: true, email: true, role: true },
  });

  if (matches.length === 0) {
    console.log("Nothing to do — every requested account is already ADMIN or does not exist.");
    return;
  }

  console.log("About to promote the following accounts to ADMIN:");
  for (const match of matches) {
    console.log(`  - ${match.email}`);
  }

  const proceed = await confirm("Continue? [y/N] ");

  if (!proceed) {
    console.log("Aborted.");
    return;
  }

  const actor = actorLabel();

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: {
        id: { in: matches.map((match) => match.id) },
      },
      data: {
        role: UserRole.ADMIN,
      },
    });

    await tx.adminAuditLog.createMany({
      data: matches.map((match) => ({
        id: randomUUID(),
        actor,
        action: "user.promote_admin",
        target: match.email,
        metadata: {
          userId: match.id,
          previousRole: match.role,
        },
      })),
    });
  });

  console.log(`Promoted ${matches.length} account(s) to ADMIN.`);

  if (matches.length !== emails.length) {
    const unmatched = emails.filter(
      (email) => !matches.some((match) => match.email === email),
    );
    if (unmatched.length > 0) {
      console.log(
        `The following email(s) did not match a user that needed promotion: ${unmatched.join(", ")}`,
      );
    }
  }
}

promoteAdmins()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
