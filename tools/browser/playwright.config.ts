import { defineConfig, devices } from "@playwright/test";

// Browser tests against the local stack (`make up`): the public archive on
// 127.0.0.1:5173 and the editorial desk on 127.0.0.1:5174. Run with `make browser`.
export default defineConfig({
  testDir: ".",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
