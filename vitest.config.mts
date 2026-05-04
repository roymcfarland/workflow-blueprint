import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./tests/setup/global.ts"],
    hookTimeout: 60_000,
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    testTimeout: 60_000,
  },
});
