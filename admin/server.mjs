import { createServer } from "node:http";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import handler from "serve-handler";
import {
  createLogger,
  getRequestId,
  parseLogLevel,
  safeRoute,
} from "./server-logging.mjs";

const logLevel = parseLogLevel(process.env.LOG_LEVEL);
const logger = createLogger("minnumst-admin", logLevel);
const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const options = {
  public: fileURLToPath(new URL("./dist/", import.meta.url)),
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
