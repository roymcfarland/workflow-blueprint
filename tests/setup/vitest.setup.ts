import { afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@/lib/db";

const envFilePath = join(process.cwd(), ".vitest", "env.json");
const testEnv = JSON.parse(readFileSync(envFilePath, "utf8")) as Record<string, string>;

for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] = value;
}

afterAll(async () => {
  await prisma.$disconnect();
});
