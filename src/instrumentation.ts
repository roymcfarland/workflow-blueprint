import * as Sentry from "@sentry/nextjs";

export const onRequestError = Sentry.captureRequestError;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    if (process.env.NEXT_RUNTIME === "edge") {
      await import("../sentry.edge.config");
    }

    return;
  }

  await import("../sentry.server.config");

  const { assertEnv } = await import("@/lib/env");
  assertEnv();
}
