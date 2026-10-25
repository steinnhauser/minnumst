import { describe, expect, it } from "vitest";
import { apiOrigin, runtimeConfigScript, securityHeaders } from "./config.mjs";

describe("runtime configuration", () => {
  it("exposes only the variables named in RUNTIME_CONFIG_KEYS", () => {
    const env = {
      RUNTIME_CONFIG_KEYS: "VITE_API_URL DEBUG",
      VITE_API_URL: "https://api.example.org",
      DATABASE_URL: "postgresql://secret",
    };
    expect(runtimeConfigScript(env)).toBe(
      'window.__MINNUMST_ENV__ = {"VITE_API_URL":"https://api.example.org","DEBUG":""};\n',
    );
  });

  it("exposes only the API URL by default", () => {
    expect(
      runtimeConfigScript({ VITE_API_URL: "https://api.example.org" }),
    ).toBe(
      'window.__MINNUMST_ENV__ = {"VITE_API_URL":"https://api.example.org"};\n',
    );
  });
});

describe("security headers", () => {
  it("allows connections only to the page's origin and the API origin", () => {
    const env = { VITE_API_URL: "https://api.example.org/some/path" };
    expect(apiOrigin(env)).toBe("https://api.example.org");
    const csp = securityHeaders(env)["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' https://api.example.org;");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe");
  });

  it("falls back to the local API origin used in development", () => {
    expect(apiOrigin({})).toBe("http://127.0.0.1:8000");
  });

  it("denies framing, MIME sniffing and powerful browser features", () => {
    const headers = securityHeaders({});
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });
});
