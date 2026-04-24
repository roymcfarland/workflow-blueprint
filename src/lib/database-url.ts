import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const defaultSqliteDatabaseUrl = "file:./dev.db";
const packagedDemoDatabasePath = join(process.cwd(), "prisma", "dev.db");
const runtimeDemoDatabasePath = "/tmp/workflow-blueprint/dev.db";

type DatabaseUrlOptions = {
  allowFallback?: boolean;
};

export function resolveDatabaseUrl({ allowFallback = false }: DatabaseUrlOptions = {}) {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    return databaseUrl;
  }

  if (allowFallback) {
    return getFallbackDatabaseUrl();
  }

  throw new Error("DATABASE_URL must be configured.");
}

function getFallbackDatabaseUrl() {
  if (process.env.NODE_ENV !== "production") {
    return defaultSqliteDatabaseUrl;
  }

  ensureRuntimeDemoDatabase();

  return `file:${runtimeDemoDatabasePath}`;
}

function ensureRuntimeDemoDatabase() {
  if (existsSync(runtimeDemoDatabasePath)) {
    return;
  }

  if (!existsSync(packagedDemoDatabasePath)) {
    throw new Error("Packaged demo database is missing.");
  }

  mkdirSync(dirname(runtimeDemoDatabasePath), { recursive: true });

  const tempDatabasePath = `${runtimeDemoDatabasePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    copyFileSync(packagedDemoDatabasePath, tempDatabasePath);

    if (existsSync(runtimeDemoDatabasePath)) {
      return;
    }

    renameSync(tempDatabasePath, runtimeDemoDatabasePath);
  } finally {
    if (existsSync(tempDatabasePath)) {
      rmSync(tempDatabasePath);
    }
  }
}
