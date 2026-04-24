import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";

const prismaDirectory = new URL("../prisma/", import.meta.url);
const databaseFile = new URL("../prisma/dev.db", import.meta.url);

await mkdir(prismaDirectory, { recursive: true });

try {
  await access(databaseFile, constants.F_OK);
} catch {
  await writeFile(databaseFile, "");
}
