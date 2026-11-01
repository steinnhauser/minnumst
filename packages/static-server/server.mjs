import { realpathSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import { runtimeConfigScript, securityHeaders } from "./config.mjs";
import {
  createLogger,
  getRequestId,
  parseLogLevel,
  safeRoute,
} from "./logging.mjs";

// Serves the single-page app built into ./dist of the working directory, and
// /runtime-config.js from memory, so the container filesystem can be read-only.
// SERVICE_NAME labels the JSON logs (minnumst-public, minnumst-admin).

export function parsePort(value) {
  const port = Number(value ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

// Serves from a list of the build's files made at startup, so a request can only
// ever reach those files. Client-side routes fall back to index.html, including
// ones that look like file names, and missing assets stay 404s.
function fileServer(root) {
  const dist = resolve(root, "dist");
  let handlers;
  return async (request, response, isAsset) => {
    // On the first request, so a missing build is a logged 500 and not a crash.
    handlers ??= {
      assets: sirv(dist, { etag: true }),
      app: sirv(dist, { etag: true, single: true, ignores: false }),
    };
    (isAsset ? handlers.assets : handlers.app)(request, response, () => {
      response.writeHead(404).end("Not Found");
    });
  };
}

// The request handler; `serve` is the file server, replaceable in tests.
export function createApp({ env, root, logger, serve = fileServer(root) }) {
  const runtimeConfig = runtimeConfigScript(env);
  const headers = securityHeaders(env);

  return (request, response) => {
    const requestId = getRequestId(request.headers);
    const route = safeRoute(request.url);
    const startedAt = process.hrtime.bigint();
    response.setHeader("X-Request-ID", requestId);
    for (const [name, value] of Object.entries(headers)) {
      response.setHeader(name, value);
    }
    logger.debug(
      { request_id: requestId, method: request.method ?? "UNKNOWN", route },
      "HTTP request started",
    );
    response.once("finish", () => {
      const statusCode = response.statusCode;
      const fields = {
        request_id: requestId,
        method: request.method ?? "UNKNOWN",
        route,
        status_code: statusCode,
        duration_ms: Number(process.hrtime.bigint() - startedAt) / 1e6,
      };
      if (statusCode >= 500) logger.error(fields, "HTTP request completed");
      else if (statusCode >= 400) logger.warn(fields, "HTTP request completed");
      else logger.info(fields, "HTTP request completed");
    });

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    // A NUL can't name a file; refuse it here rather than fail inside the handler.
    if (request.url?.includes("%00")) {
      response.writeHead(400).end();
      return;
    }
    if (route === "/runtime-config.js") {
      response.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : runtimeConfig);
      return;
    }
    // Built assets have content hashes in their names, so a found asset never
    // changes. Everything else, including errors, is revalidated.
    const isAsset = route === "/assets/*";
    const writeHead = response.writeHead.bind(response);
    response.writeHead = (statusCode, ...rest) => {
      const cacheable = isAsset && (statusCode === 200 || statusCode === 304);
      response.setHeader(
        "Cache-Control",
        cacheable ? "public, max-age=31536000, immutable" : "no-cache",
      );
      return writeHead(statusCode, ...rest);
    };
    void serve(request, response, isAsset).catch((error) => {
      logger.error(
        { err: error, request_id: requestId, method: request.method, route },
        "Static request failed",
      );
      if (response.headersSent) response.destroy(error);
      else response.writeHead(500).end("Internal Server Error");
    });
  };
}

// Validates the environment, listens on PORT and stops on SIGTERM.
export function start(env = process.env, root = process.cwd()) {
  const serviceName = env.SERVICE_NAME;
  if (!serviceName) throw new Error("SERVICE_NAME must be set");
  const logLevel = parseLogLevel(env.LOG_LEVEL);
  const logger = createLogger(serviceName, logLevel);
  const port = parsePort(env.PORT);

  const server = createServer(createApp({ env, root, logger }));
  server.on("error", (error) => {
    logger.error({ err: error }, "HTTP server failed");
    process.exitCode = 1;
  });
  server.listen(port, "0.0.0.0", () => {
    logger.info({ port, log_level: logLevel }, "HTTP server started");
  });
  process.once("SIGTERM", () => {
    server.close(() => logger.info("HTTP server stopped"));
  });
  return server;
}

// `node server.mjs` (the image's CMD) starts the server; importing it does not.
const entryPoint = process.argv[1];
if (entryPoint && realpathSync(entryPoint) === fileURLToPath(import.meta.url)) {
  start();
}
