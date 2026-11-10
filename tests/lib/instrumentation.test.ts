import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const assertEnv = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ assertEnv }));

beforeEach(() => {
  assertEnv.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("instrumentation", () => {
  test("validates the environment in the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { register } = await import("@/instrumentation");

    await register();

    expect(assertEnv).toHaveBeenCalledOnce();
  });

  test.each(["edge", "browser"])("skips environment validation in the %s runtime", async (runtime) => {
    vi.stubEnv("NEXT_RUNTIME", runtime);
    const { register } = await import("@/instrumentation");

    await register();

    expect(assertEnv).not.toHaveBeenCalled();
  });
});
