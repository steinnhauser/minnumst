import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import pino from "pino";

const levels = new Set(["DEBUG", "INFO", "WARNING", "ERROR"]);
const pinoLevels = {
  DEBUG: "debug",
  INFO: "info",
  WARNING: "warn",
  ERROR: "error",
};

export function parseLogLevel(value = "INFO") {
  const level = String(value).trim().toUpperCase();
  if (!levels.has(level)) {
    throw new Error("LOG_LEVEL must be DEBUG, INFO, WARNING, or ERROR");
  }
  return level;
}

export function createLogger(service, level) {
  return pino({
    level: pinoLevels[parseLogLevel(level)],
    base: { service },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level(label) {
        return { level: label === "warn" ? "WARNING" : label.toUpperCase() };
      },
    },
  });
}

export function getRequestId(headers) {
  const candidate = headers["x-request-id"];
  if (
    typeof candidate === "string" &&
    /^[A-Za-z0-9._-]{1,64}$/.test(candidate)
  ) {
    return candidate;
  }
  return randomUUID();
}

export function safeRoute(url) {
  const pathname = new URL(url ?? "/", "http://localhost").pathname;
  if (pathname === "/" || pathname === "/runtime-config.js") return pathname;
  if (pathname.startsWith("/assets/")) return "/assets/*";
  return "/app/*";
}
