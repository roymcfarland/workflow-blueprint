import { describe, expect, test, beforeEach } from "vitest";

import { POST } from "@/app/api/auth/sign-up/route";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../helpers/database";
import { jsonRequest } from "../helpers/requests";

describe("POST /api/auth/sign-up", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test("rejects an invalid invitation without creating an account", async () => {
    const response = await POST(
      jsonRequest("/api/auth/sign-up", {
        confirmPassword: "correct horse battery staple",
        email: "New.User@Example.test",
        inviteToken: "missing-token",
        name: "New User",
        password: "correct horse battery staple",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      message:
        "We could not complete that sign-up. Check your invitation link or contact your administrator.",
    });
    expect(response.status).toBe(400);
    await expect(
      prisma.user.findUnique({ where: { email: "new.user@example.test" } }),
    ).resolves.toBeNull();
  });
});
