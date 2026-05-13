import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/db";

type PublicTableRlsState = {
  rls_enabled: boolean;
  table_name: string;
};

const appTableNames = Prisma.dmmf.datamodel.models
  .map((model) => model.dbName ?? model.name)
  .sort();

describe("database RLS", () => {
  test("enables row-level security on every application table in public", async () => {
    const tables = await prisma.$queryRaw<PublicTableRlsState[]>`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname IN (${Prisma.join(appTableNames)})
      ORDER BY c.relname;
    `;

    expect(tables.map((table) => table.table_name)).toEqual(appTableNames);
    expect(tables.filter((table) => !table.rls_enabled)).toEqual([]);
  });
});
