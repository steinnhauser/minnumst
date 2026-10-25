import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public people search", () => {
  it("presents a public search without a sign-in requirement", () => {
    render(<App />);

    expect(
      screen.getByRole("combobox", { name: "Search by name" }),
    ).toHaveAttribute("placeholder", "Search for a persons details...");
    expect(
      screen.getByText("Public access · No sign-in required"),
    ).toBeInTheDocument();
  });

  it("asks for a name when the search is submitted empty", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Enter a name to search the directory.",
    );
  });

  it("searches people and loads the selected person's current story", async () => {
    const user = userEvent.setup();
    const person = {
      id: "person-1",
      name: "Ada Lovelace",
      slug: "ada-lovelace",
      created_at: "2026-09-28T10:00:00Z",
      updated_at: "2026-09-28T10:00:00Z",
      blog: {
        title: "A life in letters",
        excerpt: "Notes and correspondence",
        saved_at: "2026-09-28T10:00:00Z",
        revision_count: 1,
      },
    };
    const page = { items: [person], total: 1, offset: 0, limit: 50 };
    const profile = {
      ...person,
      current_blog: {
        id: "revision-1",
        revision_number: 1,
        saved_at: "2026-09-28T10:00:00Z",
        title: "A life in letters",
        excerpt: "Notes and correspondence",
        content: "A story about Ada.",
      },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        Response.json(
          String(input).includes("/api/people/by-slug/") ? profile : page,
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await user.type(
      screen.getByRole("combobox", { name: "Search by name" }),
      "Ada Lovelace",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    );

    expect(await screen.findByText("A story about Ada.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/people?query=Ada+Lovelace&offset=0&limit=50",
      ),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people/by-slug/ada-lovelace",
      expect.anything(),
    );
  });

  it("debounces suggestions and selects them from the keyboard", async () => {
    const user = userEvent.setup();
    const person = {
      id: "person-1",
      name: "Ada Lovelace",
      slug: "ada-lovelace",
      created_at: "2026-09-28T10:00:00Z",
      updated_at: "2026-09-28T10:00:00Z",
      blog: null,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/api/people/by-slug/")) {
        return Promise.resolve(
          Response.json({
            ...person,
            current_blog: {
              id: "revision-1",
              revision_number: 1,
              saved_at: "2026-09-28T10:00:00Z",
              title: "A life in letters",
              excerpt: "",
              content: "A story about Ada.",
            },
          }),
        );
      }
      return Promise.resolve(
        Response.json({ items: [person], total: 1, offset: 0, limit: 8 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    const searchbox = screen.getByRole("combobox", { name: "Search by name" });
    await user.type(searchbox, "Ada");
    const suggestion = await screen.findByRole("option", {
      name: /Ada Lovelace/,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people?query=Ada&offset=0&limit=8",
      expect.anything(),
    );
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes("/api/people?"),
      ),
    ).toHaveLength(1);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(await screen.findByText("A story about Ada.")).toBeInTheDocument();
    expect(suggestion).toHaveAttribute("aria-selected", "true");
  });
});
