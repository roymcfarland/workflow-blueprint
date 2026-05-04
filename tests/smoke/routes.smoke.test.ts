import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { readOnlyDashboardResponseSchema } from "@/lib/read-only-contract";
import { resetDatabase, seedPlanningData } from "../helpers/database";
import { startNextServer } from "./next-server";

type Server = Awaited<ReturnType<typeof startNextServer>>;

let server: Server;

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

  test("/api/read-only/dashboard returns 200 with a valid READ_ONLY_API_KEY", async () => {
    const response = await fetch(server.url("/api/read-only/dashboard"), {
      headers: {
        authorization: `Bearer ${process.env.READ_ONLY_API_KEY}`,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(readOnlyDashboardResponseSchema.safeParse(body).success).toBe(true);
  });

  test("/api/external/daily-summary returns 200 with a valid EXTERNAL_API_KEY", async () => {
    const response = await fetch(server.url("/api/external/daily-summary"), {
      headers: {
        authorization: `Bearer ${process.env.EXTERNAL_API_KEY}`,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      summary: {
        byStatus: expect.objectContaining({
          done: expect.any(Number),
          inProgress: expect.any(Number),
          onDeck: expect.any(Number),
        }),
        completionRate: expect.stringMatching(/^\d+%$/),
        totalActive: expect.any(Number),
      },
    });
    expect(Date.parse(body.generatedAt)).not.toBeNaN();
  });
});
