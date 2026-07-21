import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertEnv: vi.fn(),
  captureRequestError: vi.fn(),
  edgeConfig: vi.fn(),
  serverConfig: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureRequestError: mocks.captureRequestError,
}));

vi.mock("@/lib/env", () => ({
  assertEnv: mocks.assertEnv,
}));

vi.mock("../../sentry.edge.config", () => {
  mocks.edgeConfig();
  return {};
});

vi.mock("../../sentry.server.config", () => {
  mocks.serverConfig();
  return {};
});

beforeEach(() => {
  mocks.assertEnv.mockReset();
  mocks.captureRequestError.mockReset();
  mocks.edgeConfig.mockReset();
  mocks.serverConfig.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("instrumentation", () => {
  test("registers the server config and validates the environment in the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { register } = await import("@/instrumentation");

    await register();

    expect(mocks.serverConfig).toHaveBeenCalledOnce();
    expect(mocks.assertEnv).toHaveBeenCalledOnce();
    expect(mocks.edgeConfig).not.toHaveBeenCalled();
  });

  test("registers only the edge config in the Edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const { register } = await import("@/instrumentation");

    await register();

    expect(mocks.edgeConfig).toHaveBeenCalledOnce();
    expect(mocks.serverConfig).not.toHaveBeenCalled();
    expect(mocks.assertEnv).not.toHaveBeenCalled();
  });

  test("does not register runtime-specific dependencies for other runtimes", async () => {
    vi.stubEnv("NEXT_RUNTIME", "browser");
    const { register } = await import("@/instrumentation");

    await register();

    expect(mocks.edgeConfig).not.toHaveBeenCalled();
    expect(mocks.serverConfig).not.toHaveBeenCalled();
    expect(mocks.assertEnv).not.toHaveBeenCalled();
  });

  test("exports Sentry's request error handler", async () => {
    const { onRequestError } = await import("@/instrumentation");

    expect(onRequestError).toBe(mocks.captureRequestError);
  });
});
