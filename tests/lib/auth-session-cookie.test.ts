import { afterEach, describe, expect, test, vi } from "vitest";

const setSpy = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: setSpy, get: vi.fn(), delete: vi.fn() })),
}));

import { clearSessionCookie, setSessionCookie } from "@/lib/auth";

afterEach(() => {
  setSpy.mockClear();
});

describe("session cookie", () => {
  test("setSessionCookie uses SameSite=Lax and a persistent maxAge", async () => {
    await setSessionCookie("token-123", false);

    expect(setSpy).toHaveBeenCalledTimes(1);
    const [name, value, options] = setSpy.mock.calls[0];
    expect(name).toBe("workflow-blueprint-session");
    expect(value).toBe("token-123");
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  });

  test("rememberMe extends the cookie lifetime to 30 days, still Lax", async () => {
    await setSessionCookie("token-123", true);

    const [, , options] = setSpy.mock.calls[0];
    expect(options.maxAge).toBe(60 * 60 * 24 * 30);
    expect(options.sameSite).toBe("lax");
  });

  test("clearSessionCookie expires the cookie with matching attributes", async () => {
    await clearSessionCookie();

    const [name, value, options] = setSpy.mock.calls[0];
    expect(name).toBe("workflow-blueprint-session");
    expect(value).toBe("");
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
});
