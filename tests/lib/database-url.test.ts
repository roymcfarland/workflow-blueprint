import { describe, expect, test } from "vitest";

import {
  hydrateDatabaseUrlEnv,
  isDestructiveDevMigrationArgs,
  isLocalDatabaseHost,
  resolveDatabaseUrl,
} from "@/lib/database-url";

const databaseUrlEnvironmentKeys = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DIRECT_URL",
] as const;

type DatabaseUrlEnvironmentKey = (typeof databaseUrlEnvironmentKeys)[number];

function withDatabaseUrlEnvironment<T>(
  values: Partial<Record<DatabaseUrlEnvironmentKey, string>>,
  callback: () => T,
) {
  const originalValues = new Map(
    databaseUrlEnvironmentKeys.map((key) => [key, process.env[key]] as const),
  );

  try {
    for (const key of databaseUrlEnvironmentKeys) {
      delete process.env[key];

      const value = values[key];
      if (value !== undefined) {
        process.env[key] = value;
      }
    }

    return callback();
  } finally {
    for (const key of databaseUrlEnvironmentKeys) {
      const originalValue = originalValues.get(key);
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  }
}

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

describe("database URL environment resolution", () => {
  test("returns the Prisma generate placeholder when no URL is configured", () => {
    withDatabaseUrlEnvironment({}, () => {
      expect(resolveDatabaseUrl({ allowGeneratePlaceholder: true })).toBe(
        "postgresql://postgres:postgres@localhost:5432/postgres",
      );
    });
  });

  test("throws when no URL is configured", () => {
    withDatabaseUrlEnvironment({}, () => {
      expect(() => resolveDatabaseUrl()).toThrow(
        "Configure a PostgreSQL connection string in one of:",
      );
    });
  });

  test("identifies the configured key when its value is not a PostgreSQL URL", () => {
    withDatabaseUrlEnvironment({ DATABASE_URL: "not-a-connection-string" }, () => {
      expect(() => resolveDatabaseUrl()).toThrow("DATABASE_URL must include");
    });
  });

  test("hydrates DATABASE_URL from another configured PostgreSQL URL", () => {
    const configuredUrl = "postgresql://user:password@db.example.com:5432/workflows";

    withDatabaseUrlEnvironment({ POSTGRES_PRISMA_URL: configuredUrl }, () => {
      hydrateDatabaseUrlEnv();

      expect(process.env.DATABASE_URL).toBe(configuredUrl);
    });
  });
});

describe("isLocalDatabaseHost fallback", () => {
  test.each([
    { expected: true, url: "not-a-valid-url" },
    { expected: false, url: "user@remote.example.com" },
  ])("returns $expected for unparseable URL $url", ({ expected, url }) => {
    expect(isLocalDatabaseHost(url)).toBe(expected);
  });
});
