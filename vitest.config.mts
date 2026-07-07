import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./tests/setup/global.ts"],
    hookTimeout: 60_000,
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    testTimeout: 60_000,
  },
});
