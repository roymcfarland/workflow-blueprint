import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      exclude: ["src/generated/**"],
      include: ["src/**"],
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
    environment: "node",
    // Vitest's own defaults don't cover ".claude" (only .git/.cache/.idea/.output/.temp),
    // so a nested worktree under .claude/worktrees/** with its own copy of tests/ gets
    // discovered and run a second time alongside the real suite unless excluded here.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**", ".claude/**"],
    fileParallelism: false,
    globalSetup: ["./tests/setup/global.ts"],
    hookTimeout: 60_000,
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    testTimeout: 60_000,
  },
});
