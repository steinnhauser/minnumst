import { createServer } from "node:http";
import { resolve } from "node:path";
import process from "node:process";
import handler from "serve-handler";
import {
  createLogger,
  getRequestId,
  parseLogLevel,
  safeRoute,
} from "./logging.mjs";

// Serves the single-page app built into ./dist of the working directory.
// SERVICE_NAME labels the JSON logs (minnumst-public, minnumst-admin).
const serviceName = process.env.SERVICE_NAME;
if (!serviceName) throw new Error("SERVICE_NAME must be set");
const logLevel = parseLogLevel(process.env.LOG_LEVEL);
const logger = createLogger(serviceName, logLevel);
const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const options = {
  public: resolve(process.cwd(), "dist"),
  rewrites: [{ source: "/**", destination: "/index.html" }],
  directoryListing: false,
};

const server = createServer((request, response) => {
  const requestId = getRequestId(request.headers);
  const route = safeRoute(request.url);
  const startedAt = process.hrtime.bigint();
  response.setHeader("X-Request-ID", requestId);
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

  void handler(request, response, options).catch((error) => {
    logger.error(
      { err: error, request_id: requestId, method: request.method, route },
      "Static request failed",
    );
    if (response.headersSent) response.destroy(error);
    else response.writeHead(500).end("Internal Server Error");
  });
});

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
