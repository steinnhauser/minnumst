import { archive, expect, test } from "./fixtures";

test("a reader finds a person and reads their story", async ({
  page,
  audit,
}) => {
  await page.goto(archive);
  await audit();

  await page.getByLabel("Search by name").fill("Sample Person");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Search results").getByRole("button").first().click();

  const profile = page.getByLabel("Person details");
  await expect(profile.getByRole("heading", { level: 2 })).toContainText(
    "Sample Person",
  );
  await expect(profile.locator(".story-content")).not.toBeEmpty();
  await audit();
});
