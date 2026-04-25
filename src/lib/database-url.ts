const postgresUrlPattern = /^postgres(?:ql)?:\/\//i;
const prismaGeneratePlaceholderUrl = "postgresql://postgres:postgres@localhost:5432/postgres";

type DatabaseUrlOptions = {
  allowGeneratePlaceholder?: boolean;
};

export function resolveDatabaseUrl({ allowGeneratePlaceholder = false }: DatabaseUrlOptions = {}) {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    if (!postgresUrlPattern.test(databaseUrl)) {
      throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
    }

    return databaseUrl;
  }

  if (allowGeneratePlaceholder) {
    return prismaGeneratePlaceholderUrl;
  }

  throw new Error("DATABASE_URL must be configured with a PostgreSQL connection string.");
}
