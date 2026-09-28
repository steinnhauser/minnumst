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
      screen.getByRole("searchbox", { name: "Search by name" }),
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: [person], total: 1, offset: 0, limit: 50 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...person,
          current_blog: {
            id: "revision-1",
            revision_number: 1,
            saved_at: "2026-09-28T10:00:00Z",
            title: "A life in letters",
            excerpt: "Notes and correspondence",
            content: "A story about Ada.",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await user.type(screen.getByRole("searchbox"), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    );

    expect(await screen.findByText("A story about Ada.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8000/api/people?query=Ada+Lovelace&offset=0&limit=50",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/api/people/by-slug/ada-lovelace",
    );
  });
});
