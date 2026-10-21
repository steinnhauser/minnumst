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
  it("renames an existing person without creating a story revision", async () => {
    const user = userEvent.setup();
    const existingPerson = {
      id: "person-1",
      name: "Ada Lovelace",
      slug: "ada-lovelace",
      blog: null,
    };
    const renamedPerson = {
      ...existingPerson,
      name: "Ada Byron",
      slug: "ada-lovelace",
    };
    const fetchMock = vi.fn((_: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        Response.json(
          init?.method === "PATCH"
            ? renamedPerson
            : {
                items: [existingPerson],
                total: 1,
                offset: 0,
                limit: 100,
              },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    );
    const nameInput = screen.getByLabelText(/Person name/);
    await user.clear(nameInput);
    await user.type(nameInput, "  Ada   Byron ");
    await user.click(screen.getByRole("button", { name: "Save revision" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Update the person name before saving a story revision.",
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Update name" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Person name updated in the shared archive.",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people/person-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Ada Byron" }),
      }),
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
    expect(
      screen.getByRole("button", { name: /Ada Byron/ }),
    ).toBeInTheDocument();
  });

  it("shows a normalized-name conflict when renaming a person", async () => {
    const user = userEvent.setup();
    const person = {
      id: "person-1",
      name: "Ada Lovelace",
      slug: "ada-lovelace",
      blog: null,
    };
    const fetchMock = vi.fn((_: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PATCH"
          ? Response.json(
              { detail: "A person with this normalized name already exists" },
              { status: 409 },
            )
          : Response.json({
              items: [person],
              total: 1,
              offset: 0,
              limit: 100,
            }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    );
    await user.clear(screen.getByLabelText(/Person name/));
    await user.type(screen.getByLabelText(/Person name/), "Another Person");
    await user.click(screen.getByRole("button", { name: "Update name" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another person already uses this normalized name.",
    );
    expect(
      screen.getByRole("button", { name: /Ada Lovelace/ }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
  });

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
