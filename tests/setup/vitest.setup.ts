import { afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@/lib/db";

const envFilePath = join(process.cwd(), ".vitest", "env.json");
const testEnv = JSON.parse(readFileSync(envFilePath, "utf8")) as Record<string, string>;

for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] = value;
}

function hasUsableLocalStorage() {
  try {
    return (
      typeof globalThis.localStorage?.getItem === "function" &&
      typeof globalThis.localStorage?.setItem === "function" &&
      typeof globalThis.localStorage?.clear === "function"
    );
  } catch {
    return false;
  }
}

function installLocalStorageShim() {
  if (hasUsableLocalStorage()) {
    return;
  }

  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

installLocalStorageShim();

afterAll(async () => {
  await prisma.$disconnect();
});
