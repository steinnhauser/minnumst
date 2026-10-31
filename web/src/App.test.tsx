import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  ada,
  adaProfile,
  pageOf,
  peopleNamed,
  type ErrorResponse,
  type PersonDetail,
  type PersonResponse,
} from "./test/fixtures";

const defaultTitle = document.title;

const adaJonsdottir = {
  ...ada,
  id: "person-2",
  name: "Ada Jónsdóttir",
  slug: "ada-jonsdottir",
} satisfies PersonResponse;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  document.title = defaultTitle;
});

// Answers profile requests with `profile` and searches with the requested page
// of `people`.
function stubApi(
  people: readonly PersonResponse[] = [ada],
  profile: PersonDetail = adaProfile,
) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    return Promise.resolve(
      Response.json(
        url.pathname.startsWith("/api/people/by-slug/")
          ? profile
          : pageFrom(people, url),
      ),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function pageFrom(people: readonly PersonResponse[], url: URL) {
  const offset = Number(url.searchParams.get("offset"));
  const limit = Number(url.searchParams.get("limit"));
  return pageOf(
    people.slice(offset, offset + limit),
    limit,
    offset,
    people.length,
  );
}

function searchbox() {
  return screen.getByRole("combobox", { name: "Search by name" });
}

describe("profile URLs", () => {
  it("opens the profile named in the address bar", async () => {
    window.history.replaceState(null, "", "/people/ada-lovelace");
    const fetchMock = stubApi();

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Ada Lovelace" }),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/api\/people\/by-slug\/ada-lovelace$/,
    );
    expect(document.title).toBe("Ada Lovelace | Minnumst");
  });

  it("closes the profile when the reader goes back", async () => {
    window.history.replaceState(null, "", "/");
    window.history.pushState(null, "", "/people/ada-lovelace");
    stubApi();
    render(<App />);
    await screen.findByRole("heading", { name: "Ada Lovelace" });

    await act(async () => {
      window.history.back();
      await new Promise((resolve) =>
        window.addEventListener("popstate", resolve, { once: true }),
      );
    });

    expect(
      screen.queryByRole("heading", { name: "Ada Lovelace" }),
    ).not.toBeInTheDocument();
  });

  it("says when a profile has no published story", async () => {
    window.history.replaceState(null, "", "/people/ada-lovelace");
    stubApi([ada], { ...ada, current_blog: null });

    render(<App />);

    expect(
      await screen.findByText("There is no published story yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Person details" }),
    ).toHaveTextContent("Ada Lovelace");
  });

  it("explains why a profile could not be loaded", async () => {
    window.history.replaceState(null, "", "/people/missing");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { detail: "Person not found" } satisfies ErrorResponse,
            { status: 404 },
          ),
        ),
    );

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Person not found"),
    );
    expect(
      screen.queryByRole("article", { name: "Person details" }),
    ).not.toBeInTheDocument();
    expect(document.title).toBe(defaultTitle);
  });

  it("returns to the start page when searching from a profile", async () => {
    window.history.replaceState(null, "", "/people/ada-lovelace");
    const user = userEvent.setup();
    stubApi();
    render(<App />);
    await screen.findByRole("heading", { name: "Ada Lovelace" });

    await user.type(searchbox(), "Ada");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByText("Showing 1 of 1 people."),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    expect(document.title).toBe(defaultTitle);
  });
});

describe("public people search", () => {
  it("presents a public search without a sign-in requirement", () => {
    render(<App />);

    expect(searchbox()).toHaveAttribute(
      "placeholder",
      "Search for a persons details...",
    );
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
      ...ada,
      blog: {
        title: "A life in letters",
        excerpt: "Notes and correspondence",
        saved_at: "2026-09-28T10:00:00Z",
        revision_count: 1,
      },
    } satisfies PersonResponse;
    const fetchMock = stubApi([person], {
      ...person,
      current_blog: {
        ...adaProfile.current_blog,
        excerpt: "Notes and correspondence",
      },
    });
    render(<App />);

    await user.type(searchbox(), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    );

    expect(await screen.findByText("A story about Ada.")).toBeInTheDocument();
    expect(screen.getByText("Notes and correspondence")).toHaveClass(
      "story-excerpt",
    );
    expect(window.location.pathname).toBe("/people/ada-lovelace");
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

  it("lists people without a story as plain profiles", async () => {
    const fetchMock = stubApi();
    render(<App />);

    // Submitting before the suggestion delay ends skips the suggestion lookup.
    fireEvent.change(searchbox(), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    ).toHaveTextContent("Person profile");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing 1 of 1 people.",
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says when nobody matches the search", async () => {
    const user = userEvent.setup();
    stubApi([]);
    render(<App />);

    await user.type(searchbox(), "Nobody");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByText("No people found. Try another name."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Search results")).not.toBeInTheDocument();
  });

  it("explains a failed search", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    render(<App />);

    await user.type(searchbox(), "Ada");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByText(
        "Could not reach the Minnumst API. Check that it is running.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });
});

describe("site footer", () => {
  it("links to the source code, the license and the data protection rules", () => {
    stubApi();
    render(<App />);

    const repository = "https://github.com/steinnhauser/minnumst";
    expect(
      screen.getByRole("link", { name: "Source code on GitHub" }),
    ).toHaveAttribute("href", repository);
    expect(
      screen.getByRole("link", { name: "Code licensed under Apache-2.0" }),
    ).toHaveAttribute("href", `${repository}/blob/main/LICENSE`);
    expect(
      screen.getByRole("link", { name: "Data protection and sources" }),
    ).toHaveAttribute("href", `${repository}#data-protection-and-sources`);
    expect(screen.getByText(/© 2026/)).toBeInTheDocument();
  });
});

describe("search suggestions", () => {
  it("debounces suggestions and selects them from the keyboard", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi();
    render(<App />);

    await user.type(searchbox(), "Ada");
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

  it("moves through suggestions with the arrow keys and closes them with Escape", async () => {
    const user = userEvent.setup();
    stubApi([ada, adaJonsdottir]);
    render(<App />);

    await user.type(searchbox(), "Ada");
    await screen.findAllByRole("option");
    const active = () => searchbox().getAttribute("aria-activedescendant");
    expect(active()).toBeNull();

    await user.keyboard("{ArrowDown}");
    expect(active()).toBe("person-suggestion-person-1");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(active()).toBe("person-suggestion-person-2");
    await user.keyboard("{ArrowUp}");
    expect(active()).toBe("person-suggestion-person-1");
    await user.keyboard("{ArrowUp}");
    expect(active()).toBe("person-suggestion-person-2");
    expect(
      screen.getByRole("option", { name: /Ada Jónsdóttir/ }),
    ).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(searchbox()).toHaveAttribute("aria-expanded", "false");
    expect(active()).toBeNull();
  });

  it("wraps to the last suggestion when moving up from the input", async () => {
    const user = userEvent.setup();
    stubApi([ada, adaJonsdottir]);
    render(<App />);

    await user.type(searchbox(), "Ada");
    await screen.findAllByRole("option");
    await user.keyboard("{ArrowUp}");

    expect(searchbox()).toHaveAttribute(
      "aria-activedescendant",
      "person-suggestion-person-2",
    );
  });

  it("searches the typed name when Enter is pressed without a highlighted suggestion", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi([ada, adaJonsdottir]);
    render(<App />);

    await user.type(searchbox(), "Ada");
    await screen.findAllByRole("option");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText("Showing 2 of 2 people."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/people?query=Ada&offset=0&limit=50",
      expect.anything(),
    );
  });

  it("opens a suggestion clicked with the mouse", async () => {
    const user = userEvent.setup();
    stubApi();
    render(<App />);

    await user.type(searchbox(), "Ada");
    await user.click(await screen.findByRole("option", { name: /Ada/ }));

    expect(await screen.findByText("A story about Ada.")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/people/ada-lovelace");
    expect(searchbox()).toHaveFocus();
  });

  it("shows no suggestions when the lookup fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await user.type(searchbox(), "Ada");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(searchbox()).toHaveAttribute("aria-busy", "false"),
    );
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it.each(["arrives", "fails"])(
    "ignores a suggestion lookup that %s after the search was submitted",
    async (outcome) => {
      const user = userEvent.setup();
      let settleSuggestions = () => {};
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL) =>
          String(input).endsWith("limit=8")
            ? new Promise<Response>((resolve, reject) => {
                settleSuggestions = () =>
                  outcome === "arrives"
                    ? resolve(Response.json(pageOf([ada], 8)))
                    : reject(new TypeError("offline"));
              })
            : Promise.resolve(Response.json(pageOf([]))),
        ),
      );
      render(<App />);

      await user.type(searchbox(), "Ada");
      await waitFor(() =>
        expect(searchbox()).toHaveAttribute("aria-busy", "true"),
      );
      await user.click(screen.getByRole("button", { name: "Search" }));
      await screen.findByText("No people found. Try another name.");
      await act(() => {
        settleSuggestions();
        return new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(screen.queryByRole("option")).not.toBeInTheDocument();
      expect(searchbox()).toHaveAttribute("aria-busy", "false");
    },
  );
});

describe("more search results", () => {
  function results() {
    return within(screen.getByLabelText("Search results")).getAllByRole(
      "button",
    );
  }

  function showMore() {
    return screen.queryByRole("button", { name: "Show more people" });
  }

  async function search(name: string) {
    fireEvent.change(searchbox(), { target: { value: name } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
  }

  it("pages through every match and announces the count", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(peopleNamed(120));
    render(<App />);

    await search("Person");
    expect(
      await screen.findByText("Showing 50 of 120 people."),
    ).toBeInTheDocument();
    expect(results()).toHaveLength(50);

    await user.click(showMore()!);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Showing 100 of 120 people.",
      ),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/people?query=Person&offset=50&limit=50",
      expect.anything(),
    );
    expect(results()).toHaveLength(100);
    expect(results()[50]).toHaveFocus();
    expect(results()[50]).toHaveTextContent("Person 51");

    await user.click(showMore()!);
    await screen.findByText("Showing 120 of 120 people.");
    expect(results()).toHaveLength(120);
    expect(results()[100]).toHaveFocus();
    expect(showMore()).not.toBeInTheDocument();
  });

  it("shows no button when every match fits on one page", async () => {
    stubApi(peopleNamed(50));
    render(<App />);

    await search("Person");

    await screen.findByText("Showing 50 of 50 people.");
    expect(showMore()).not.toBeInTheDocument();
  });

  it("keeps the results and allows a retry when a page fails", async () => {
    const user = userEvent.setup();
    const people = peopleNamed(60);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return url.searchParams.get("offset") === "50"
          ? Promise.reject(new TypeError("offline"))
          : Promise.resolve(Response.json(pageFrom(people, url)));
      }),
    );
    render(<App />);
    await search("Person");
    await screen.findByText("Showing 50 of 60 people.");

    await user.click(showMore()!);

    expect(
      await screen.findByText(
        "Could not reach the Minnumst API. Check that it is running.",
      ),
    ).toBeInTheDocument();
    expect(results()).toHaveLength(50);
    expect(showMore()).toBeEnabled();
  });

  it("lists nobody twice when the archive changes between pages", async () => {
    const user = userEvent.setup();
    const people = peopleNamed(52);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input));
        // A new match ahead of Person 50 pushes them onto the next page.
        return Promise.resolve(
          Response.json(
            url.searchParams.get("offset") === "50"
              ? pageOf([people[49], people[50]], 50, 50, 52)
              : pageFrom(people, url),
          ),
        );
      }),
    );
    render(<App />);
    await search("Person");
    await screen.findByText("Showing 50 of 52 people.");

    await user.click(showMore()!);

    await screen.findByText("Showing 51 of 52 people.");
    expect(results()).toHaveLength(51);
    expect(results()[50]).toHaveFocus();
    expect(showMore()).not.toBeInTheDocument();
  });

  it("stops offering more when a page comes back empty", async () => {
    const user = userEvent.setup();
    const people = peopleNamed(60);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return Promise.resolve(
          Response.json(
            url.searchParams.get("offset") === "50"
              ? pageOf([], 50, 50, 60)
              : pageFrom(people, url),
          ),
        );
      }),
    );
    render(<App />);
    await search("Person");
    await screen.findByText("Showing 50 of 60 people.");

    await user.click(showMore()!);

    await waitFor(() => expect(showMore()).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing 50 of 60 people.",
    );
    expect(results()).toHaveLength(50);
  });

  it.each([
    ["search", "arrives", "0"],
    ["search", "fails", "0"],
    ["next page", "arrives", "50"],
    ["next page", "fails", "50"],
  ])(
    "ignores a %s that %s after the search was edited",
    async (_request, outcome, heldOffset) => {
      const people = peopleNamed(60);
      let settle = () => {};
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL) => {
          const url = new URL(String(input));
          if (url.searchParams.get("offset") !== heldOffset) {
            return Promise.resolve(Response.json(pageFrom(people, url)));
          }
          return new Promise<Response>((resolve, reject) => {
            settle = () =>
              outcome === "arrives"
                ? resolve(Response.json(pageFrom(people, url)))
                : reject(new TypeError("offline"));
          });
        }),
      );
      render(<App />);
      await search("Person");
      if (heldOffset === "50") {
        await screen.findByText("Showing 50 of 60 people.");
        fireEvent.click(showMore()!);
        expect(showMore()).toBeDisabled();
      }
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true"),
      );

      fireEvent.change(searchbox(), { target: { value: "Someone else" } });
      await act(() => {
        settle();
        return new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(screen.queryByLabelText("Search results")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("");
      expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "false");
      expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
    },
  );
});
