import { defineConfig } from "vitest/config";

// Each project uses its own vite.config.ts (web, admin) or Vitest's Node
// defaults (packages/static-server).
export default defineConfig({
  test: {
    projects: ["web", "admin", "packages/*"],
  },
});
