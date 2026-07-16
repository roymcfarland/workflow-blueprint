import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "src/generated/**",
    "next-env.d.ts",
    // Generated coverage report (gitignored, but not auto-excluded by ESLint's flat config).
    "coverage/**",
  ]),
]);

export default eslintConfig;
