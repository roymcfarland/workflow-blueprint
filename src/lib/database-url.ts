const defaultSqliteDatabaseUrl = "file:./dev.db";

type DatabaseUrlOptions = {
  allowFallback?: boolean;
};

export function resolveDatabaseUrl({ allowFallback = false }: DatabaseUrlOptions = {}) {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    return databaseUrl;
  }

  if (allowFallback) {
    return defaultSqliteDatabaseUrl;
  }

  throw new Error("DATABASE_URL must be configured.");
}
