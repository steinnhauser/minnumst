import { describe, expect, it } from "vitest";
import {
  createLogger,
  getRequestId,
  parseLogLevel,
  safeRoute,
} from "./logging.mjs";

describe("container logging", () => {
  it("accepts only the four supported log levels and defaults to INFO", () => {
    expect(parseLogLevel()).toBe("INFO");
    for (const level of ["DEBUG", "INFO", "WARNING", "ERROR"]) {
      expect(parseLogLevel(level)).toBe(level);
    }
    for (const level of ["TRACE", "FATAL", "WARN", ""]) {
      expect(() => parseLogLevel(level)).toThrow(
        "LOG_LEVEL must be DEBUG, INFO, WARNING, or ERROR",
      );
    }
  });

  it("maps supported names to their Pino filtering thresholds", () => {
    for (const [level, threshold] of [
      ["DEBUG", "debug"],
      ["INFO", "info"],
      ["WARNING", "warn"],
      ["ERROR", "error"],
    ]) {
      expect(createLogger("test", level).level).toBe(threshold);
    }
  });

  it("keeps access logs from exposing query values or person slugs", () => {
    expect(safeRoute("/asta-jonsdottir?search=private")).toBe("/app/*");
    expect(safeRoute("/assets/index-123.js?cache=1")).toBe("/assets/*");
  });

  it("preserves safe request IDs and replaces unsafe values", () => {
    expect(getRequestId({ "x-request-id": "test-request-123" })).toBe(
      "test-request-123",
    );
    expect(getRequestId({ "x-request-id": "bad id" })).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });
});
