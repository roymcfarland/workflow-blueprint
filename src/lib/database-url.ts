const postgresUrlPattern = /^postgres(?:ql)?:\/\//i;

export function resolveDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    if (!postgresUrlPattern.test(databaseUrl)) {
      throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
    }

    return databaseUrl;
  }

  throw new Error("DATABASE_URL must be configured with a PostgreSQL connection string.");
}
