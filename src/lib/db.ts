import { PrismaClient } from "@prisma/client";

import { resolveDatabaseUrl } from "./database-url";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let prismaClient: PrismaClient | undefined;

function createPrismaClient() {
  return new PrismaClient({
    datasourceUrl: resolveDatabaseUrl({ allowFallback: true }),
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

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);

    return typeof value === "function" ? value.bind(client) : value;
  },
});
