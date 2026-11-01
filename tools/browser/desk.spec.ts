import type { Page } from "@playwright/test";
import { archive, desk, expect, test } from "./fixtures";

// Saves a new page for a person, with a first story revision.
async function saveNewPage(page: Page, name: string) {
  await page.getByRole("button", { name: "Create a new page" }).click();
  await page.getByRole("textbox", { name: /^Person name/ }).fill(name);
  await page.getByRole("textbox", { name: /^Born/ }).fill("1850");
  await page
    .getByRole("textbox", { name: /^Page title/ })
    .fill("A first draft");
  await page
    .getByRole("textbox", { name: /^Story/ })
    .fill("The first version of the story.");
  await page.getByRole("button", { name: "Save new version" }).click();
}

async function createPerson(page: Page, name: string) {
  await saveNewPage(page, name);
  await expect(page.getByRole("status")).toHaveText(/as version 1\./);
}

// Opens a person's profile from an archive search and returns its address.
async function openInArchive(page: Page, name: string) {
  await page.goto(archive);
  await page.getByLabel("Search by name").fill(name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByLabel("Search results")
    .getByRole("link", { name: new RegExp(`^${name}`) })
    .click();
  await expect(
    page.getByLabel("Person details").getByRole("heading", { level: 1 }),
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
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByRole("status")).toHaveText(/as version 2\./);

  await page.getByRole("tab", { name: /History/ }).click();
  const history = page.getByLabel("Version history");
  await expect(history.locator(".revision-item")).toHaveCount(2);
  await expect(history).toContainText("(current)");
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
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Update the person name before saving a story revision.",
  );
  await audit();

  await page.getByRole("button", { name: "Update person" }).click();
  await expect(page.getByRole("status")).toHaveText("Person updated.");
  await expect(
    page.getByRole("button", { name: "Update person" }),
  ).toBeDisabled();
  await page.getByPlaceholder("Find a person").fill(run);
  const pages = page.getByLabel("Saved pages");
  await expect(pages.getByRole("button", { name: renamed })).toBeVisible();
  await expect(pages.getByRole("button", { name })).toHaveCount(0);

  // Slugs are permanent, so the old address shows the new name.
  await page.goto(profile);
  await expect(
    page.getByLabel("Person details").getByRole("heading", { level: 1 }),
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
  await page.getByRole("button", { name: "Save new version" }).click();

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

  // The same name and dates, in other letter case, are the same person.
  await saveNewPage(page, name.toUpperCase());
  await expect(page.getByRole("alert")).toHaveText(
    /^A person with this name and these dates already exists\. Select them from the pages list and save the story there\. \(request ID: [A-Za-z0-9._-]+\)$/,
  );
  await audit();
});

test("an editor compares versions and publishes an earlier one again", async ({
  page,
  audit,
}, testInfo) => {
  const name = `Browser Restore ${testInfo.project.name} ${Date.now()}`;
  await page.goto(desk);
  await createPerson(page, name);
  await page
    .getByRole("textbox", { name: /^Story/ })
    .fill("The second version, with more detail.");
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByRole("status")).toHaveText(/as version 2\./);

  await page.getByRole("tab", { name: /History/ }).click();
  await page
    .getByRole("button", { name: "Show changes from version 1" })
    .click();
  await expect(
    page.getByRole("list", { name: "Changes from version 1 to 2" }),
  ).toContainText("The second version, with more detail.");
  await audit();

  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Publish version 1 again" }).click();
  await expect(page.getByRole("status")).toHaveText(/as version 3\./);

  await openInArchive(page, name);
  await expect(page.getByLabel("Person details")).toContainText(
    "The first version of the story.",
  );
});

test("a visitor suggests an edit and it appears only after an editor accepts it", async ({
  page,
  audit,
}, testInfo) => {
  const name = `Browser Suggestion ${testInfo.project.name} ${Date.now()}`;
  const proposal = `A proposal from a visitor, ${Date.now()}.`;
  await page.goto(desk);
  await createPerson(page, name);

  await openInArchive(page, name);
  const details = page.getByLabel("Person details");
  await details.getByRole("button", { name: "Suggest an edit" }).click();
  await audit();
  await details.getByRole("textbox", { name: "Story" }).fill(proposal);
  await details.getByRole("button", { name: "Send for review" }).click();
  await expect(details.getByRole("status")).toContainText(
    "An editor will read",
  );

  await page.reload();
  await expect(page.getByLabel("Person details")).not.toContainText(proposal);

  await page.goto(desk);
  await page.getByRole("link", { name: /Suggestions/ }).click();
  const card = page.getByRole("listitem").filter({ hasText: name });
  await expect(card).toBeVisible();
  await audit();
  await card.getByRole("button", { name: "Accept and publish" }).click();
  await expect(card).toHaveCount(0);

  await openInArchive(page, name);
  await expect(page.getByLabel("Person details")).toContainText(proposal);
});
