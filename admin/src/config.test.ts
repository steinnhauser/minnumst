import { describe, expect, it } from "vitest";
import { parseAppConfig } from "./config";

describe("app configuration", () => {
  it("reads the API base URL and enables debug mode from environment values", () => {
    expect(
      parseAppConfig({
        DEBUG: "true",
        VITE_API_URL: " http://localhost:3000/api ",
      }),
    ).toEqual({
      apiUrl: "http://localhost:3000/api",
      debug: true,
    });
  });

  it("defaults to the local API and keeps debug mode off", () => {
    expect(parseAppConfig({})).toEqual({
      apiUrl: "http://127.0.0.1:8000",
      debug: false,
    });
    expect(parseAppConfig({ DEBUG: "false" }).debug).toBe(false);
  });
});
