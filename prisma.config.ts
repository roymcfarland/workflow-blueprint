import "dotenv/config";
import { defineConfig } from "prisma/config";

import { resolveDatabaseUrl } from "./src/lib/database-url";

function isPrismaGenerateCommand() {
  return process.env.npm_lifecycle_event === "postinstall" || process.argv.includes("generate");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node --import tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveDatabaseUrl({ allowGeneratePlaceholder: isPrismaGenerateCommand() }),
  },
});
