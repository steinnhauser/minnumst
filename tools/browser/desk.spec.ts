import { desk, expect, test } from "./fixtures";

test("an editor creates a person and keeps every revision of the story", async ({
  page,
  audit,
}, testInfo) => {
  const name = `Browser Check ${testInfo.project.name} ${Date.now()}`;
  await page.goto(desk);
  await audit();

  await page.getByRole("button", { name: "Create a new page" }).click();
  await page.getByRole("textbox", { name: /^Person name/ }).fill(name);
  await page
    .getByRole("textbox", { name: /^Page title/ })
    .fill("A first draft");
  await page
    .getByRole("textbox", { name: /^Story/ })
    .fill("The first version of the story.");
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(page.getByRole("status")).toHaveText(/as revision 1\./);

  await page
    .getByRole("textbox", { name: /^Story/ })
    .fill("The second version, with more detail.");
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(page.getByRole("status")).toHaveText(/as revision 2\./);

  await page.getByRole("tab", { name: /History/ }).click();
  const history = page.getByLabel("Revision history");
  await expect(history.locator(".revision-item")).toHaveCount(2);
  await expect(history).toContainText("Current version");
  await audit();
});
