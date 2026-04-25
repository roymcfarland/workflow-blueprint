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

async function promoteAdmins() {
  const emails = [...new Set([...process.argv.slice(2).map(normalizeEmail), ...adminEmailsFromEnvironment()])];

  if (emails.length === 0) {
    throw new Error("Pass at least one email or configure ADMIN_EMAILS.");
  }

  const result = await prisma.user.updateMany({
    where: {
      email: {
        in: emails,
      },
    },
    data: {
      role: UserRole.ADMIN,
    },
  });

  console.log(`Promoted ${result.count} account(s) to ADMIN.`);

  if (result.count !== emails.length) {
    console.log("One or more emails did not match an existing account.");
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
