import { EventEmitter, once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createApp, parsePort, start } from "./server.mjs";

const serverPath = fileURLToPath(new URL("./server.mjs", import.meta.url));
const env = {
  RUNTIME_CONFIG_KEYS: "VITE_API_URL",
  VITE_API_URL: "https://api.example.org",
  DATABASE_URL: "postgresql://secret",
};
let root;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "static-server-"));
  await mkdir(join(root, "dist", "assets"), { recursive: true });
  await writeFile(join(root, "dist", "index.html"), "<p>Minnumst</p>");
  await writeFile(join(root, "dist", "assets", "app-123.js"), "run();");
});

afterAll(() => rm(root, { recursive: true, force: true }));

afterEach(() => {
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

function fakeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

// Serves the app on an ephemeral port for the duration of one test. Each
// request resolves once the server has finished (and logged) its response.
async function serve(options = {}) {
  const logger = fakeLogger();
  const server = createServer(createApp({ env, root, logger, ...options }));
  let closed;
  server.on("request", (_request, response) => {
    closed = once(response, "close");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const request = async (path, init) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
    await closed;
    return response;
  };
  return { logger, request, close: () => server.close() };
}

// Reserves a port, then frees it for the server under test.
async function freePort() {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((done) => probe.close(done));
  return port;
}

async function waitForServer(port) {
  for (;;) {
    try {
      return await fetch(`http://127.0.0.1:${port}/runtime-config.js`);
    } catch {
      await new Promise((done) => setTimeout(done, 10));
    }
  }
}

// Runs the SIGTERM listener that start() registered, and waits for the close.
async function stopOnSigterm(listenersBefore) {
  const [stop] = process
    .listeners("SIGTERM")
    .filter((listener) => !listenersBefore.includes(listener));
  process.removeListener("SIGTERM", stop);
  stop();
  await new Promise((done) => setTimeout(done, 20));
}

describe("static server", () => {
  it("serves index.html with security headers and a request ID", async () => {
    const app = await serve();
    try {
      const response = await app.request("/");
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("<p>Minnumst</p>");
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
      expect(response.headers.get("content-security-policy")).toContain(
        "connect-src 'self' https://api.example.org;",
      );
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(app.logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ method: "GET", route: "/" }),
        "HTTP request started",
      );
      expect(app.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          route: "/",
          status_code: 200,
          duration_ms: expect.any(Number),
        }),
        "HTTP request completed",
      );
    } finally {
      app.close();
    }
  });

  it("falls back to index.html for client-side routes without logging slugs", async () => {
    const app = await serve();
    try {
      const response = await app.request("/asta-jonsdottir?tab=history", {
        headers: { "X-Request-ID": "req-123" },
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("<p>Minnumst</p>");
      expect(response.headers.get("x-request-id")).toBe("req-123");
      const [fields] = app.logger.info.mock.calls[0];
      expect(fields).toMatchObject({ request_id: "req-123", route: "/app/*" });
      expect(JSON.stringify(fields)).not.toContain("asta");
    } finally {
      app.close();
    }
  });

  it("caches hashed assets for a year and keeps missing assets as 404s", async () => {
    const app = await serve();
    try {
      const asset = await app.request("/assets/app-123.js");
      expect(asset.status).toBe(200);
      expect(await asset.text()).toBe("run();");
      expect(asset.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );

      const missing = await app.request("/assets/missing-456.js");
      expect(missing.status).toBe(404);
      expect(missing.headers.get("cache-control")).toBe("no-cache");
      expect(app.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ route: "/assets/*", status_code: 404 }),
        "HTTP request completed",
      );
    } finally {
      app.close();
    }
  });

  it("serves only the allowlisted runtime configuration, never cached", async () => {
    const app = await serve();
    try {
      const response = await app.request("/runtime-config.js");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/javascript; charset=utf-8",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      const script = await response.text();
      expect(script).toBe(
        'window.__MINNUMST_ENV__ = {"VITE_API_URL":"https://api.example.org"};\n',
      );
      expect(script).not.toContain("secret");

      const head = await app.request("/runtime-config.js", { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
    } finally {
      app.close();
    }
  });

  it("answers methods other than GET and HEAD with 405", async () => {
    const app = await serve();
    try {
      const response = await app.request("/", { method: "POST", body: "x" });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(app.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ method: "POST", status_code: 405 }),
        "HTTP request completed",
      );
    } finally {
      app.close();
    }
  });

  it("logs requests without a method as UNKNOWN", () => {
    const logger = fakeLogger();
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setHeader() {},
      writeHead(statusCode) {
        this.statusCode = statusCode;
        return this;
      },
      end() {
        this.emit("finish");
      },
    });
    createApp({ env, root, logger })({ headers: {}, url: "/" }, response);
    expect(response.statusCode).toBe(405);
    expect(logger.debug.mock.calls[0][0].method).toBe("UNKNOWN");
    expect(logger.warn.mock.calls[0][0].method).toBe("UNKNOWN");
  });

  it("answers 500 and logs when serving a file fails", async () => {
    const failure = new Error("disk unavailable");
    const app = await serve({ serve: () => Promise.reject(failure) });
    try {
      const response = await app.request("/");
      expect(response.status).toBe(500);
      expect(await response.text()).toBe("Internal Server Error");
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(app.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: failure, route: "/" }),
        "Static request failed",
      );
      expect(app.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ status_code: 500 }),
        "HTTP request completed",
      );
    } finally {
      app.close();
    }
  });

  it("drops the connection when serving fails after the headers were sent", async () => {
    const app = await serve({
      serve: async (request, response) => {
        response.writeHead(200);
        response.write("partial");
        throw new Error("read failed");
      },
    });
    try {
      await expect(
        app.request("/").then((response) => response.text()),
      ).rejects.toThrow();
      expect(app.logger.error).toHaveBeenCalledWith(
        expect.anything(),
        "Static request failed",
      );
    } finally {
      app.close();
    }
  });
});

describe("server startup", () => {
  it("requires a service name, a known log level and a valid port", () => {
    expect(() => start({}, root)).toThrow("SERVICE_NAME must be set");
    expect(() =>
      start({ SERVICE_NAME: "minnumst-test", LOG_LEVEL: "TRACE" }, root),
    ).toThrow("LOG_LEVEL must be DEBUG, INFO, WARNING, or ERROR");
    for (const port of ["http", "1.5", "0", "65536"]) {
      expect(() =>
        start({ SERVICE_NAME: "minnumst-test", PORT: port }, root),
      ).toThrow("PORT must be an integer between 1 and 65535");
    }
  });

  it("listens on port 8080 by default", () => {
    expect(parsePort(undefined)).toBe(8080);
    expect(parsePort("5173")).toBe(5173);
  });

  it("serves on PORT and stops on SIGTERM", async () => {
    const port = await freePort();
    const listenersBefore = process.listeners("SIGTERM");
    const server = start(
      { SERVICE_NAME: "minnumst-test", LOG_LEVEL: "ERROR", PORT: `${port}` },
      root,
    );
    const response = await waitForServer(port);
    expect(response.status).toBe(200);
    await stopOnSigterm(listenersBefore);
    expect(server.listening).toBe(false);
  });

  it("sets a failing exit code when the port is taken", async () => {
    const blocker = createServer().listen(0, "0.0.0.0");
    await once(blocker, "listening");
    const listenersBefore = process.listeners("SIGTERM");
    try {
      const server = start(
        {
          SERVICE_NAME: "minnumst-test",
          LOG_LEVEL: "ERROR",
          PORT: `${blocker.address().port}`,
        },
        root,
      );
      await once(server, "error").catch(() => {});
      expect(process.exitCode).toBe(1);
      await stopOnSigterm(listenersBefore);
    } finally {
      blocker.close();
    }
  });
});

describe("entry point", () => {
  it("starts only when run as `node server.mjs`", async () => {
    const argv = process.argv;
    const listenersBefore = process.listeners("SIGTERM");
    try {
      process.argv = [argv[0]];
      await import("./server.mjs?no-entry");
      expect(process.listeners("SIGTERM")).toEqual(listenersBefore);

      const port = await freePort();
      vi.stubEnv("SERVICE_NAME", "minnumst-test");
      vi.stubEnv("LOG_LEVEL", "ERROR");
      vi.stubEnv("PORT", `${port}`);
      process.argv = [argv[0], serverPath];
      await import("./server.mjs?entry");
      expect((await waitForServer(port)).status).toBe(200);
      await stopOnSigterm(listenersBefore);
      await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
    } finally {
      process.argv = argv;
    }
  });
});
