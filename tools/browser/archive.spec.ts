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

test("a reader picks a search suggestion with the keyboard", async ({
  page,
  audit,
}) => {
  await page.goto(archive);
  const search = page.getByRole("combobox", { name: "Search by name" });
  const suggestions = page.getByRole("listbox", { name: "Search suggestions" });
  const options = suggestions.getByRole("option");

  // Escape closes the suggestions and keeps what the reader typed.
  await search.fill("Sample Pers");
  await expect(options.first()).toBeVisible();
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await search.press("Escape");
  await expect(suggestions).toBeHidden();
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await expect(search).toHaveValue("Sample Pers");

  // Typing on brings them back, with none highlighted yet.
  await search.press("o");
  await search.press("n");
  await expect(options.nth(1)).toBeVisible();
  await expect(search).not.toHaveAttribute("aria-activedescendant");
  await audit();

  async function expectHighlighted(index: number) {
    const option = options.nth(index);
    await expect(option).toHaveAttribute("aria-selected", "true");
    await expect(search).toHaveAttribute(
      "aria-activedescendant",
      (await option.getAttribute("id"))!,
    );
    await expect(suggestions.locator('[aria-selected="true"]')).toHaveCount(1);
  }

  await search.press("ArrowDown");
  await expectHighlighted(0);
  await search.press("ArrowDown");
  await expectHighlighted(1);
  await search.press("ArrowUp");
  await expectHighlighted(0);

  // Enter opens the highlighted person's profile.
  await search.press("ArrowDown");
  await expectHighlighted(1);
  const name = await options.nth(1).locator("strong").textContent();
  await search.press("Enter");
  await expect(suggestions).toBeHidden();
  await expect(
    page.getByLabel("Person details").getByRole("heading", { level: 2 }),
  ).toHaveText(name ?? "");
  await expect(page).toHaveURL(/\/people\/[a-z0-9-]+$/);
  await audit();
});

test("the about section and footer aren't hidden behind the photo", async ({
  page,
  audit,
}) => {
  await page.goto(archive);

  // A trial click fails if something else would receive the click.
  for (const target of [
    page.getByText("A growing collection"),
    page.getByRole("link", { name: "Source code on GitHub" }),
    page.getByRole("link", { name: "Data protection and sources" }),
  ]) {
    await target.scrollIntoViewIfNeeded();
    await target.click({ trial: true });
  }
  await audit();
});
