import { describe, expect, test } from "vitest";

import { isDestructiveDevMigrationArgs, isLocalDatabaseHost } from "@/lib/database-url";

describe("isLocalDatabaseHost", () => {
  test.each([
    "postgresql://u@localhost:5432/db",
    "postgres://u@127.0.0.1/db",
    "postgresql://u@[::1]:5432/db",
    "postgresql:///db?host=/tmp",
  ])("returns true for local connection string %s", (url) => {
    expect(isLocalDatabaseHost(url)).toBe(true);
  });

  test.each([
    "postgresql://u:p@db.abc.supabase.co:5432/postgres",
    "postgresql://u@aws-1-us-east-2.pooler.supabase.com:5432/db",
  ])("returns false for non-local connection string %s", (url) => {
    expect(isLocalDatabaseHost(url)).toBe(false);
  });
});

describe("isDestructiveDevMigrationArgs", () => {
  test.each([
    { argv: ["node", "prisma", "prisma", "migrate", "dev"] },
    { argv: ["node", "prisma", "prisma", "migrate", "reset"] },
    { argv: ["node", "prisma", "prisma", "db", "push"] },
  ])("returns true for destructive dev migration argv $argv", ({ argv }) => {
    expect(isDestructiveDevMigrationArgs(argv)).toBe(true);
  });

  test.each([
    { argv: ["node", "prisma", "prisma", "migrate", "deploy"] },
    { argv: ["node", "prisma", "prisma", "migrate", "status"] },
    { argv: ["node", "prisma", "prisma", "generate"] },
  ])("returns false for safe Prisma argv $argv", ({ argv }) => {
    expect(isDestructiveDevMigrationArgs(argv)).toBe(false);
  });
});
