import { defineConfig } from "vitest/config";

// Each project uses its own vite.config.ts (web, admin) or Vitest's Node
// defaults (packages/static-server).
export default defineConfig({
  test: {
    projects: ["web", "admin", "packages/*"],
    // `make test` fails on any uncovered line, statement, branch or function.
    coverage: {
      provider: "v8",
      // json-summary feeds tools/scripts/coverage_report.py.
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage/frontends",
      include: ["web/src/**", "admin/src/**", "packages/*/*.{ts,mjs}"],
      exclude: ["**/*.test.*", "**/test/**", "**/*.d.ts", "**/main.tsx"],
      thresholds: {
        lines: 100,
        statements: 100,
        branches: 100,
        functions: 100,
      },
    },
  },
});
