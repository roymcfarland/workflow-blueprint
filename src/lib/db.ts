import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

import { resolveDatabaseUrl } from "./database-url";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let prismaClient: PrismaClient | undefined;

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: resolveDatabaseUrl(),
      options: "-c timezone=UTC",
    }),
  });
}

function getPrismaClient() {
  if (prismaClient) {
    return prismaClient;
  }

  prismaClient = globalForPrisma.prisma ?? createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prismaClient;
  }

  return prismaClient;
}

// Lazily-resolved Prisma client. The proxy exists so `resolveDatabaseUrl` is
// only invoked on first real use — `prisma generate` and parts of the Vercel
// build import this module without a populated DATABASE_URL, and we don't want
// those to fail. The cost is one bound-method lookup per call.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);

    return typeof value === "function" ? value.bind(client) : value;
  },
});
