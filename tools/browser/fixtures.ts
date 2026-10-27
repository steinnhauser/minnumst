import AxeBuilder from "@axe-core/playwright";
import { expect, test as base } from "@playwright/test";

// The local stack's addresses; override them to test other servers.
export const archive =
  process.env.MINNUMST_ARCHIVE_URL ?? "http://127.0.0.1:5173";
export const desk = process.env.MINNUMST_DESK_URL ?? "http://127.0.0.1:5174";

// A page fails its test if the browser logs any error, which includes every
// Content Security Policy violation. A test adds to `allowedErrors` only the
// errors it provokes on purpose, such as the browser's note on a 409 response.
// `audit` checks the page with axe and fails on serious or critical
// accessibility problems.
export const test = base.extend<{
  allowedErrors: RegExp[];
  audit: () => Promise<void>;
}>({
  // Playwright reads a fixture's dependencies from this destructuring.
  // eslint-disable-next-line no-empty-pattern
  allowedErrors: async ({}, use) => {
    await use([]);
  },
  page: async ({ page, allowedErrors }, use) => {
    const errors: string[] = [];
    const record = (text: string) => {
      if (!allowedErrors.some((pattern) => pattern.test(text))) {
        errors.push(text);
      }
    };
    page.on("console", (message) => {
      if (message.type() === "error") record(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    expect(errors, "errors in the browser console").toEqual([]);
  },
  audit: async ({ page }, use) => {
    await use(async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations
        .filter(({ impact }) => impact === "serious" || impact === "critical")
        .map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length})`);
      expect(serious, "serious accessibility violations").toEqual([]);
    });
  },
});

export { expect };
