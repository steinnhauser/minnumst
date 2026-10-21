import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAppConfig } from "./config";

afterEach(() => {
  vi.resetModules();
  Reflect.deleteProperty(window, "__MINNUMST_ENV__");
});

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

  it("prefers configuration injected when the container starts", async () => {
    Object.defineProperty(window, "__MINNUMST_ENV__", {
      configurable: true,
      value: {
        VITE_API_URL: "https://runtime.example.test",
        DEBUG: "true",
      },
    });
    vi.resetModules();
    const { appConfig: runtimeConfig } = await import("./config");

    expect(runtimeConfig).toEqual({
      apiUrl: "https://runtime.example.test",
      debug: true,
    });
  });
});
