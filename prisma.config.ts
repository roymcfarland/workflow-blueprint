import { defineConfig } from "prisma/config";

import { loadProjectEnv } from "./src/lib/load-env";
import {
  hydrateDatabaseUrlEnv,
  isDestructiveDevMigrationArgs,
  isLocalDatabaseHost,
  resolveDatabaseUrl,
} from "./src/lib/database-url";

loadProjectEnv();
hydrateDatabaseUrlEnv({ preferDirectConnection: true });

function isPrismaGenerateCommand() {
  return process.env.npm_lifecycle_event === "postinstall" || process.argv.includes("generate");
}

const datasourceUrl = resolveDatabaseUrl({
  allowGeneratePlaceholder: isPrismaGenerateCommand(),
  preferDirectConnection: true,
});

if (isDestructiveDevMigrationArgs(process.argv) && !isLocalDatabaseHost(datasourceUrl)) {
  let host = "the configured database";
  try {
    host = new URL(datasourceUrl).hostname || host;
  } catch {
    /* keep the generic label for socket URLs */
  }
  throw new Error(
    `Refusing to run a destructive dev migration command (migrate dev/reset, db push) against a ` +
      `non-local database (host: ${host}). Point DATABASE_URL/DIRECT_URL at a LOCAL Postgres for ` +
      `development. Production migrations apply via 'prisma migrate ` +
      `deploy' on deploy.`,
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node --import tsx prisma/seed.ts",
  },
  datasource: {
    url: datasourceUrl,
  },
});
