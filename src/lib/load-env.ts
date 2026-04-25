import { loadEnvConfig } from "@next/env";

let isProjectEnvLoaded = false;

export function loadProjectEnv() {
  if (isProjectEnvLoaded) {
    return;
  }

  loadEnvConfig(process.cwd());
  isProjectEnvLoaded = true;
}
