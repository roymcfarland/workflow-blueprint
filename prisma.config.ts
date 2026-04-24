import "dotenv/config";
import { defineConfig } from "prisma/config";

import { resolveDatabaseUrl } from "./src/lib/database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
  datasource: {
    url: resolveDatabaseUrl({ allowFallback: true }),
  },
});
