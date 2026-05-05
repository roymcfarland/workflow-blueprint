import { PrismaClient } from "@prisma/client";
import nextEnv from "@next/env";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const envFilePath = join(process.cwd(), ".vitest", "env.json");
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const { loadEnvConfig } = nextEnv;

function requireDatabaseUrl() {
  loadEnvConfig(process.cwd());

  const explicitTestUrl = process.env.TEST_DATABASE_URL?.trim();

  if (explicitTestUrl) {
    return explicitTestUrl;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "Set TEST_DATABASE_URL to a local PostgreSQL admin database before running tests.",
    );
  }

  const parsed = new URL(databaseUrl);

  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      "Refusing to create ephemeral test databases from a non-local DATABASE_URL. " +
        "Set TEST_DATABASE_URL to a local PostgreSQL admin database.",
    );
  }

  return databaseUrl;
}

function databaseUrlFor(baseUrl: string, databaseName: string) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  }

  return `"${value}"`;
}

function runPrismaMigrateDeploy(databaseUrl: string) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, ["prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed with exit code ${result.status}.`);
  }
}

export default async function setup() {
  const baseUrl = requireDatabaseUrl();
  const databaseName = `workflow_blueprint_test_${process.pid}_${Date.now()}`;
  const testDatabaseUrl = databaseUrlFor(baseUrl, databaseName);
  const admin = new PrismaClient({ datasourceUrl: baseUrl });
  let databaseCreated = false;

  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    databaseCreated = true;
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.AUTH_SECRET ??= "workflow-blueprint-test-auth-secret";
    process.env.EXTERNAL_API_KEY ??= "test-external-api-key";
    process.env.EXTERNAL_USER_ID ??= "user_demo_alex_blue";
    process.env.NEXT_PUBLIC_SITE_URL ??= "http://127.0.0.1:3000";

    await mkdir(join(process.cwd(), ".vitest"), { recursive: true });
    await writeFile(
      envFilePath,
      JSON.stringify({
        AUTH_SECRET: process.env.AUTH_SECRET,
        DATABASE_URL: testDatabaseUrl,
        EXTERNAL_API_KEY: process.env.EXTERNAL_API_KEY,
        EXTERNAL_USER_ID: process.env.EXTERNAL_USER_ID,
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      }),
    );

    runPrismaMigrateDeploy(testDatabaseUrl);
  } catch (error) {
    if (databaseCreated) {
      await admin.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
      );
    }

    await admin.$disconnect();
    throw error;
  }

  return async () => {
    await rm(envFilePath, { force: true });

    try {
      await admin.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
      );
    } finally {
      await admin.$disconnect();
    }
  };
}
