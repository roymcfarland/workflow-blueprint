import { beforeEach, describe, expect, test } from "vitest";
import type { ZodType } from "zod";

import { GET as getBoard } from "@/app/api/external/v1/boards/[slug]/route";
import { GET as getBoards } from "@/app/api/external/v1/boards/route";
import { GET as getDailySummary } from "@/app/api/external/v1/daily-summary/route";
import { GET as getDashboard } from "@/app/api/external/v1/dashboard/route";
import {
  externalBoardResponseSchema,
  externalBoardsResponseSchema,
  externalDailySummaryResponseSchema,
  externalDashboardResponseSchema,
} from "@/lib/external-contract";
import { resetDatabase, seedPlanningData } from "../../helpers/database";

function externalGetRequest(path: string, apiKey = process.env.EXTERNAL_API_KEY ?? "") {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return new Request(new URL(path, origin), {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    method: "GET",
  });
}

async function expectJsonContract<T>(response: Response, schema: ZodType<T>) {
  const body = await response.json();
  const parsed = schema.safeParse(body);

  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(parsed.success).toBe(true);

  return body;
}

describe("external v1 route contracts", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlanningData();
  });

  test("GET /api/external/v1/dashboard matches the dashboard contract", async () => {
    const response = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));

    await expectJsonContract(response, externalDashboardResponseSchema);
  });

  test("GET /api/external/v1/boards matches the boards contract", async () => {
    const response = await getBoards(externalGetRequest("/api/external/v1/boards"));

    await expectJsonContract(response, externalBoardsResponseSchema);
  });

  test("GET /api/external/v1/boards/[slug] matches the board contract", async () => {
    const response = await getBoard(
      externalGetRequest("/api/external/v1/boards/personal"),
      {
        params: Promise.resolve({ slug: "personal" }),
      },
    );

    await expectJsonContract(response, externalBoardResponseSchema);
  });

  test("GET /api/external/v1/daily-summary matches the daily summary contract", async () => {
    const response = await getDailySummary(
      externalGetRequest("/api/external/v1/daily-summary"),
    );

    await expectJsonContract(response, externalDailySummaryResponseSchema);
  });

  test("GET /api/external/v1/daily-summary preserves the READ_ONLY_API_KEY fallback", async () => {
    const originalExternalApiKey = process.env.EXTERNAL_API_KEY;

    process.env.EXTERNAL_API_KEY = "";

    try {
      const response = await getDailySummary(
        externalGetRequest(
          "/api/external/v1/daily-summary",
          process.env.READ_ONLY_API_KEY,
        ),
      );

      await expectJsonContract(response, externalDailySummaryResponseSchema);
    } finally {
      process.env.EXTERNAL_API_KEY = originalExternalApiKey;
    }
  });
});
