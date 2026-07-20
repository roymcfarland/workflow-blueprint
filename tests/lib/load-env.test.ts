import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@next/env", () => ({
  loadEnvConfig: vi.fn(),
}));

describe("loadProjectEnv", () => {
  afterEach(() => {
    vi.resetModules();
  });

  test("loads the project env once and memoizes subsequent calls", async () => {
    const { loadEnvConfig } = await import("@next/env");
    vi.resetModules();

    const { loadProjectEnv } = await import("@/lib/load-env");

    loadProjectEnv();
    loadProjectEnv();

    expect(loadEnvConfig).toHaveBeenCalledTimes(1);
    expect(loadEnvConfig).toHaveBeenCalledWith(process.cwd());
  });
});
