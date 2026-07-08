import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/db";

type PublicTableRlsState = {
  rls_enabled: boolean;
  table_name: string;
};

describe("database RLS", () => {
  test("enables row-level security on every application table in public", async () => {
    const tables = await prisma.$queryRaw<PublicTableRlsState[]>`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname <> '_prisma_migrations'
      ORDER BY c.relname;
    `;

    const tableNames = tables.map((table) => table.table_name);

    // Non-vacuous guards: migrate deploy must have created the app schema,
    // and core tables must be present under their real PostgreSQL names.
    expect(tableNames.length).toBeGreaterThan(0);
    for (const sentinel of ["User", "Board", "Task"]) {
      expect(tableNames).toContain(sentinel);
    }

    expect(tables.filter((table) => !table.rls_enabled)).toEqual([]);
  });
});
