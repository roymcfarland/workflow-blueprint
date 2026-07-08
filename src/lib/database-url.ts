const postgresUrlPattern = /^postgres(?:ql)?:\/\//i;
const prismaGeneratePlaceholderUrl = "postgresql://postgres:postgres@localhost:5432/postgres";
const runtimeDatabaseUrlEnvironmentKeys = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;
const directDatabaseUrlEnvironmentKeys = [
  "DIRECT_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
] as const;

type DatabaseUrlOptions = {
  allowGeneratePlaceholder?: boolean;
  preferDirectConnection?: boolean;
};

function getDatabaseUrlEnvironmentKeys({ preferDirectConnection = false }: DatabaseUrlOptions = {}) {
  return preferDirectConnection ? directDatabaseUrlEnvironmentKeys : runtimeDatabaseUrlEnvironmentKeys;
}

function getConfiguredDatabaseUrl(options: DatabaseUrlOptions = {}) {
  const databaseUrlEnvironmentKeys = getDatabaseUrlEnvironmentKeys(options);
  const configuredKeys: string[] = [];

  for (const key of databaseUrlEnvironmentKeys) {
    const value = process.env[key]?.trim();

    if (!value) {
      continue;
    }

    configuredKeys.push(key);

    if (postgresUrlPattern.test(value)) {
      return value;
    }
  }

  if (configuredKeys.length > 0) {
    throw new Error(
      `${configuredKeys.join(", ")} must include a PostgreSQL connection string. ` +
        `Supported keys: ${databaseUrlEnvironmentKeys.join(", ")}.`,
    );
  }

  return undefined;
}

export function resolveDatabaseUrl(options: DatabaseUrlOptions = {}) {
  const { allowGeneratePlaceholder = false } = options;
  const databaseUrl = getConfiguredDatabaseUrl(options);

  if (databaseUrl) {
    return databaseUrl;
  }

  if (allowGeneratePlaceholder) {
    return prismaGeneratePlaceholderUrl;
  }

  const databaseUrlEnvironmentKeys = getDatabaseUrlEnvironmentKeys(options);

  throw new Error(
    `Configure a PostgreSQL connection string in one of: ${databaseUrlEnvironmentKeys.join(", ")}.`,
  );
}

export function hydrateDatabaseUrlEnv(options: DatabaseUrlOptions = {}) {
  const databaseUrl = getConfiguredDatabaseUrl(options);

  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }
}

/**
 * Restores real libpq sslmode semantics (encrypt without full chain verification)
 * for the pg driver, which now aliases sslmode=require/prefer/verify-ca to verify-full.
 */
export function withLibpqSslCompat(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("uselibpqcompat", "true");
  return parsed.toString();
}

/** True for localhost / loopback / unix-socket (no host) connection strings. */
export function isLocalDatabaseHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const host = hostname.toLowerCase();
    return (
      host === "" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    // Socket-style URLs (postgresql:///db?host=/tmp) have no parseable host -> treat as local.
    return !/@[^/]*[a-z0-9.-]+\.[a-z]/i.test(url);
  }
}

/** True when argv invokes a destructive DEV migration command (migrate dev/reset, db push). */
export function isDestructiveDevMigrationArgs(argv: readonly string[]): boolean {
  const joined = argv.slice(2).join(" ");
  return /\bmigrate\s+(dev|reset)\b/.test(joined) || /\bdb\s+push\b/.test(joined);
}
