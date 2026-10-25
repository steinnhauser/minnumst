import AxeBuilder from "@axe-core/playwright";
import { expect, test as base } from "@playwright/test";

export const archive = "http://127.0.0.1:5173";
export const desk = "http://127.0.0.1:5174";

// A page fails its test if the browser logs any error, which includes every
// Content Security Policy violation. `audit` checks the page with axe and fails
// on serious or critical accessibility problems.
export const test = base.extend<{ audit: () => Promise<void> }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
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
