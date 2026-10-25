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

  // The profile has its own address, which opens it directly.
  await expect(page).toHaveURL(/\/people\/[a-z0-9-]+$/);
  const name = await profile.getByRole("heading", { level: 2 }).textContent();
  await page.goto(page.url());
  await expect(
    page.getByLabel("Person details").getByRole("heading", { level: 2 }),
  ).toHaveText(name ?? "");
});
