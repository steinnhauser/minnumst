import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("blog page editor", () => {
  it("creates a person-linked page and preserves edits in its history", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/Person name/), "Ada Lovelace");
    await user.type(screen.getByLabelText(/Page title/), "A life in letters");
    await user.type(
      screen.getByLabelText(/Story/),
      "The first version of this story.",
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Draft saved in this browser.",
    );
    expect(screen.getByText("/people/ada-lovelace")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Page title/));
    await user.type(
      screen.getByLabelText(/Page title/),
      "A life in mathematics",
    );
    await user.clear(screen.getByLabelText(/Story/));
    await user.type(
      screen.getByLabelText(/Story/),
      "The second version of this story.",
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await user.click(screen.getByRole("tab", { name: /History/ }));

    expect(screen.getByText("2 VERSIONS")).toBeInTheDocument();
    const revisionList = within(screen.getByRole("list"));
    expect(revisionList.getByText("A life in mathematics")).toBeInTheDocument();
    expect(revisionList.getByText("A life in letters")).toBeInTheDocument();
  });

  it("requires a name, title, and story before saving", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add a person name, page title, and story before saving.",
    );
    expect(localStorage.length).toBe(0);
  });
});
