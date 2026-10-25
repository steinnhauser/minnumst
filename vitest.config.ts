import { defineConfig } from "vitest/config";

// Each project uses its own vite.config.ts (web, admin) or Vitest's Node
// defaults (packages/static-server).
export default defineConfig({
  test: {
    projects: ["web", "admin", "packages/*"],
    // `make test` fails if coverage drops below the current level.
    coverage: {
      provider: "v8",
      reporter: ["text-summary"],
      include: ["web/src/**", "admin/src/**", "packages/*/*.{ts,mjs}"],
      exclude: ["**/*.test.*", "**/test/**", "**/*.d.ts", "**/main.tsx"],
      thresholds: { lines: 70, statements: 70, branches: 60, functions: 75 },
    },
  },
});
