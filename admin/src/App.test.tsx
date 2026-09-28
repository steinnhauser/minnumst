import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function emptyPeoplePage() {
  return Response.json({ items: [], total: 0, offset: 0, limit: 100 });
}

function savedBlog(revisionNumber: number, title: string, content: string) {
  return Response.json({
    revision_count: revisionNumber,
    current_revision: {
      id: `revision-${revisionNumber}`,
      revision_number: revisionNumber,
      saved_at: `2026-09-28T${10 + revisionNumber}:00:00Z`,
      title,
      excerpt: "",
      content,
    },
  });
}

describe("blog page editor", () => {
  it("creates one person and appends each edit to API revision history", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(emptyPeoplePage())
      .mockResolvedValueOnce(
        Response.json({
          id: "person-1",
          name: "Ada Lovelace",
          slug: "ada-lovelace",
          blog: null,
        }),
      )
      .mockResolvedValueOnce(savedBlog(1, "A life in letters", "First version"))
      .mockResolvedValueOnce(
        savedBlog(2, "A life in mathematics", "Second version"),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await screen.findByText("No people have been added yet.");
    await user.type(screen.getByLabelText(/Person name/), "Ada Lovelace");
    await user.type(screen.getByLabelText(/Page title/), "A life in letters");
    await user.type(screen.getByLabelText(/Story/), "First version");
    await user.click(screen.getByRole("button", { name: "Save revision" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved to the shared archive as revision 1.",
    );
    expect(screen.getByText("/people/ada-lovelace")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Page title/));
    await user.type(
      screen.getByLabelText(/Page title/),
      "A life in mathematics",
    );
    await user.clear(screen.getByLabelText(/Story/));
    await user.type(screen.getByLabelText(/Story/), "Second version");
    await user.click(screen.getByRole("button", { name: "Save revision" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved to the shared archive as revision 2.",
    );
    await user.click(screen.getByRole("tab", { name: /History/ }));

    expect(screen.getByText("2 VERSIONS")).toBeInTheDocument();
    const revisionList = within(screen.getByRole("list"));
    expect(revisionList.getByText("A life in mathematics")).toBeInTheDocument();
    expect(revisionList.getByText("A life in letters")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(2);
  });

  it("requires a name, title, and story before creating a person", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(emptyPeoplePage());
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Save revision" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add a person name, page title, and story before saving.",
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        ["POST", "PUT"].includes(init?.method ?? ""),
      ),
    ).toHaveLength(0);
  });
});
