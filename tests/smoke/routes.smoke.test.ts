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

  test("sign-up without an invitation returns the invite-only message", async () => {
    const response = await fetch(server.url("/sign-up"));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain(
      "New Workflow Blueprint accounts require an invitation from an admin.",
    );
  });

  test("sign-up with an invalid invitation returns the unavailable message", async () => {
    const response = await fetch(server.url("/sign-up?invite=not-a-real-token"));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain(
      "This invitation link is invalid, expired, revoked, or already accepted.",
    );
  });

  test("reset-password without a token returns 404", async () => {
    const response = await fetch(server.url("/reset-password"));

    expect(response.status).toBe(404);
  });

  test("reset-password with a token renders the reset form", async () => {
    const response = await fetch(server.url("/reset-password?token=whatever"));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("Choose a new password");
  });

  test("forgot-password renders the reset-access page", async () => {
    const response = await fetch(server.url("/forgot-password"));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("Reset access");
  });

  test("dashboard redirects unauthenticated visitors to the landing page", async () => {
    const response = await fetch(server.url("/dashboard"), { redirect: "manual" });
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toBeTruthy();
    expect(new URL(location!, server.url("/")).pathname).toBe("/");
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

  test("robots.txt returns 200 and disallows the authenticated app", async () => {
    const response = await fetch(server.url("/robots.txt"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Disallow: /dashboard");
    expect(body).toContain(`Sitemap: ${server.url("/sitemap.xml")}`);
  });

  test("sitemap.xml returns 200 and lists only the public landing page", async () => {
    const response = await fetch(server.url("/sitemap.xml"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain(`<loc>${server.url("/")}</loc>`);
    expect(body).not.toContain("/dashboard");
  });
});
