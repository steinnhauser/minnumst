import type { Page } from "@playwright/test";
import { archive, desk, expect, test } from "./fixtures";

// Saves a new page for a person, with a first story revision.
async function saveNewPage(page: Page, name: string) {
  await page.getByRole("button", { name: "Create a new page" }).click();
  await page.getByRole("textbox", { name: /^Person name/ }).fill(name);
  await page
    .getByRole("textbox", { name: /^Page title/ })
    .fill("A first draft");
  await page
    .getByRole("textbox", { name: /^Story/ })
    .fill("The first version of the story.");
  await page.getByRole("button", { name: "Save revision" }).click();
}

async function createPerson(page: Page, name: string) {
  await saveNewPage(page, name);
  await expect(page.getByRole("status")).toHaveText(/as revision 1\./);
}

// Opens a person's profile from an archive search and returns its address.
async function openInArchive(page: Page, name: string) {
  await page.goto(archive);
  await page.getByLabel("Search by name").fill(name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByLabel("Search results")
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
  await expect(
    page.getByLabel("Person details").getByRole("heading", { level: 2 }),
  ).toHaveText(name);
  return page.url();
}

test("an editor creates a person and keeps every revision of the story", async ({
  page,
  audit,
}, testInfo) => {
  const name = `Browser Check ${testInfo.project.name} ${Date.now()}`;
  await page.goto(desk);
  await audit();

  await createPerson(page, name);

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

test("an editor renames a person and the profile keeps its address", async ({
  page,
  audit,
}, testInfo) => {
  const run = `${testInfo.project.name} ${Date.now()}`;
  const name = `Browser Rename ${run}`;
  const renamed = `Browser Renamed ${run}`;
  await page.goto(desk);
  await createPerson(page, name);
  const profile = await openInArchive(page, name);

  await page.goto(desk);
  await page.getByPlaceholder("Find a person").fill(name);
  await page.getByLabel("Saved pages").getByRole("button", { name }).click();
  const nameField = page.getByRole("textbox", { name: /^Person name/ });
  await expect(nameField).toHaveValue(name);
  await nameField.fill(renamed);

  // A changed name has to be saved on its own before the next revision.
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Update the person name before saving a story revision.",
  );
  await audit();

  await page.getByRole("button", { name: "Update name" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Person name updated in the shared archive.",
  );
  await expect(
    page.getByRole("button", { name: "Update name" }),
  ).toBeDisabled();
  await page.getByPlaceholder("Find a person").fill(run);
  const pages = page.getByLabel("Saved pages");
  await expect(pages.getByRole("button", { name: renamed })).toBeVisible();
  await expect(pages.getByRole("button", { name })).toHaveCount(0);

  // Slugs are permanent, so the old address shows the new name.
  await page.goto(profile);
  await expect(
    page.getByLabel("Person details").getByRole("heading", { level: 2 }),
  ).toHaveText(renamed);
  expect(await openInArchive(page, renamed)).toBe(profile);
  await audit();
});

test("an editor is told what is missing before saving", async ({
  page,
  audit,
}) => {
  await page.goto(desk);
  await page.getByRole("button", { name: "Create a new page" }).click();
  await page
    .getByRole("textbox", { name: /^Page title/ })
    .fill("A story without a person");
  await page
    .getByRole("textbox", { name: /^Story/ })
    .fill("Nobody to save this for yet.");
  await page.getByRole("button", { name: "Save revision" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Add a person name, page title, and story before saving.",
  );
  await expect(page.getByRole("textbox", { name: /^Story/ })).toHaveValue(
    "Nobody to save this for yet.",
  );
  await audit();
});

test("an editor cannot add the same person twice", async ({
  page,
  audit,
  allowedErrors,
}, testInfo) => {
  // The browser logs the API's 409 response as an error.
  allowedErrors.push(/status of 409/);
  const name = `Browser Duplicate ${testInfo.project.name} ${Date.now()}`;
  await page.goto(desk);
  await createPerson(page, name);

  // The same name in other letter case is the same person.
  await saveNewPage(page, name.toUpperCase());
  await expect(page.getByRole("alert")).toHaveText(
    /^A person with this name already exists\. Select them from the pages list and save the story there\. \(request ID: [A-Za-z0-9._-]+\)$/,
  );
  await audit();
});
