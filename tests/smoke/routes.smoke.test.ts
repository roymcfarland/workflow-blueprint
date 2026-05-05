import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { ZodType } from "zod";

import {
  externalBoardResponseSchema,
  externalBoardsResponseSchema,
  externalDailySummaryResponseSchema,
  externalDashboardResponseSchema,
} from "@/lib/external-contract";
import { resetDatabase, seedPlanningData } from "../helpers/database";
import { startNextServer } from "./next-server";

type Server = Awaited<ReturnType<typeof startNextServer>>;

let server: Server;

const externalSmokeCases = [
  {
    path: "/api/external/v1/dashboard",
    schema: externalDashboardResponseSchema,
  },
  {
    path: "/api/external/v1/boards",
    schema: externalBoardsResponseSchema,
  },
  {
    path: "/api/external/v1/boards/personal",
    schema: externalBoardResponseSchema,
  },
  {
    path: "/api/external/v1/daily-summary",
    schema: externalDailySummaryResponseSchema,
  },
] satisfies Array<{
  path: string;
  schema: ZodType;
}>;

describe("smoke routes", () => {
  beforeAll(async () => {
    await resetDatabase();
    await seedPlanningData();
    server = await startNextServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("homepage returns 200", async () => {
    const response = await fetch(server.url("/"));

    expect(response.status).toBe(200);
  });

  test.each(externalSmokeCases)(
    "$path returns 200 with a valid EXTERNAL_API_KEY",
    async ({ path, schema }) => {
      const response = await fetch(server.url(path), {
        headers: {
          authorization: `Bearer ${process.env.EXTERNAL_API_KEY}`,
        },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(schema.safeParse(body).success).toBe(true);
    },
  );

});
