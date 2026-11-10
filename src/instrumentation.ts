export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { assertEnv } = await import("@/lib/env");
  assertEnv();
}
