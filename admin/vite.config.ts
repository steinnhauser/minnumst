import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    define: {
      __EFTIRMAL_ENV__: JSON.stringify({
        DEBUG: env.DEBUG ?? "false",
        VITE_API_URL: env.VITE_API_URL ?? "",
      }),
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
    },
  };
});
