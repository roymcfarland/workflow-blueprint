import "dotenv/config";
import { defineConfig } from "prisma/config";

import { resolveDatabaseUrl } from "./src/lib/database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node --import tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveDatabaseUrl({ allowFallback: true }),
  },
});
