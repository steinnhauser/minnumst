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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import AppLink from "./AppLink";
import {
  inLanguage,
  languageFromPath,
  translations,
  withoutLanguage,
} from "./i18n";
import { isLongEnough, parseRoute, searchPath } from "./routes";
import {
  ada,
  adaProfile,
  pageOf,
  peopleNamed,
  type ErrorResponse,
  type PersonDetail,
  type PersonResponse,
} from "./test/fixtures";

const defaultTitle = translations.en.title;
const OFFLINE =
  "We could not reach the archive just now. Please try again soon.";

const adaJonsdottir = {
  ...ada,
  id: "person-2",
  name: "Ada Jónsdóttir",
  slug: "ada-jonsdottir",
} satisfies PersonResponse;

beforeEach(() => {
  window.history.replaceState(null, "", "/en");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

function goTo(address: string) {
  window.history.replaceState(null, "", address);
}

function searchbox() {
  return screen.getByRole("combobox", { name: "Search by name" });
}

function results() {
  return within(
    screen.getByRole("list", { name: "Search results" }),
  ).getAllByRole("link");
}

function searchRequests(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.includes("/api/people?"));
}

async function goBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) =>
      window.addEventListener("popstate", resolve, { once: true }),
    );
  });
}

describe("the front page", () => {
  it("presents a public search without a sign-in requirement", () => {
    render(<App />);

    expect(searchbox()).toHaveAttribute("placeholder", "Type a name...");
    expect(
      screen.getByText("Open to everyone · No sign-in needed"),
    ).toBeInTheDocument();
    expect(document.title).toBe(defaultTitle);
  });

  it("has its logo lead home from any page", async () => {
    goTo("/en/people/ada-lovelace");
    const user = userEvent.setup();
    stubApi();
    render(<App />);
    await screen.findByRole("heading", { name: "Ada Lovelace" });

    await user.click(screen.getByRole("link", { name: "Minnumst home" }));

    expect(window.location.pathname).toBe("/en");
    expect(
      screen.getByRole("heading", { name: "Find someone to remember." }),
    ).toBeVisible();
  });
});

describe("searching", () => {
  it("goes to a page of results, with an address of its own", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi([ada, adaJonsdottir]);
    render(<App />);

    await user.type(searchbox(), " Ada Lovelace ");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(window.location.pathname).toBe("/en/search");
    expect(window.location.search).toBe("?q=Ada+Lovelace");
    expect(
      await screen.findByText("Showing 1–2 of 2 people."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Results for “Ada Lovelace”" }),
    ).toHaveFocus();
    expect(document.title).toBe("Search | Minnumst");
    expect(results()).toHaveLength(2);
    expect(results()[0]).toHaveAttribute("href", "/en/people/ada-lovelace");
    expect(results()[0]).toHaveTextContent("A short page");
    expect(searchRequests(fetchMock).at(-1)).toContain(
      "/api/people?query=Ada+Lovelace&offset=0&limit=25",
    );
    expect(
      screen.queryByRole("heading", { name: "Find someone to remember." }),
    ).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it.each([
    ["", "Enter a name to search the archive."],
    ["jo", "Please type at least 3 letters."],
    ["j o", "Please type at least 3 letters."],
    ["...", "Please type at least 3 letters."],
  ])(
    "stays on the page and explains when %j is searched for",
    async (typed, message) => {
      const user = userEvent.setup();
      const fetchMock = stubApi();
      render(<App />);

      if (typed) await user.type(searchbox(), typed);
      await user.click(screen.getByRole("button", { name: "Search" }));
      await act(() => new Promise((resolve) => setTimeout(resolve, 300)));

      expect(screen.getByRole("status")).toHaveTextContent(message);
      expect(window.location.pathname).toBe("/en");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("clears that explanation as soon as the reader types again", async () => {
    const user = userEvent.setup();
    stubApi();
    render(<App />);

    await user.type(searchbox(), "jo");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.type(searchbox(), "n");

    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("opens a search from its address, showing what was searched for", async () => {
    goTo("/en/search?q=Ada");
    const fetchMock = stubApi();
    render(<App />);

    await screen.findByText("Showing 1–1 of 1 people.");

    expect(searchbox()).toHaveValue("Ada");
    // A search already on the page needs no suggestions.
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(searchRequests(fetchMock)).toHaveLength(1);
    expect(screen.queryByRole("option")).toBeNull();
  });

  it.each([
    ["/en/search", "Enter a name to search the archive."],
    ["/en/search?q=", "Enter a name to search the archive."],
    ["/en/search?q=jo", "Please type at least 3 letters."],
  ])("asks the database nothing for %s", async (address, message) => {
    goTo(address);
    const fetchMock = stubApi();
    render(<App />);

    expect(
      within(
        screen.getByRole("heading", { name: "Search" }).parentElement!,
      ).getByText(message),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says when nobody matches", async () => {
    goTo("/en/search?q=Nobody");
    stubApi([]);
    render(<App />);

    expect(
      await screen.findByText(
        "We found no one by that name. Try another spelling.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Search results" })).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Pages of results" }),
    ).toBeNull();
  });

  it("explains a failed search", async () => {
    goTo("/en/search?q=Ada");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    render(<App />);

    expect(await screen.findByText(OFFLINE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });

  it("searches again from the results page", async () => {
    goTo("/en/search?q=Ada");
    const user = userEvent.setup();
    const fetchMock = stubApi();
    render(<App />);
    await screen.findByText("Showing 1–1 of 1 people.");

    await user.clear(searchbox());
    fireEvent.change(searchbox(), { target: { value: "Björk" } });
    fireEvent.submit(searchbox());

    await waitFor(() => expect(window.location.search).toBe("?q=Bj%C3%B6rk"));
    await screen.findByRole("heading", { name: "Results for “Björk”" });
    expect(searchRequests(fetchMock).at(-1)).toContain("query=Bj%C3%B6rk");
  });

  it("returns to the front page when the reader goes back", async () => {
    goTo("/en");
    const user = userEvent.setup();
    stubApi();
    render(<App />);
    await user.type(searchbox(), "Ada");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Showing 1–1 of 1 people.");

    await goBack();

    expect(
      screen.getByRole("heading", { name: "Find someone to remember." }),
    ).toBeVisible();
  });

  it.each([
    ["an answer", () => Response.json(pageOf([{ ...ada, name: "Too late" }]))],
    ["an error", () => Response.json({ detail: "Too late" }, { status: 500 })],
  ])("ignores %s for a search no longer wanted", async (_, late) => {
    goTo("/en/search?q=Ada");
    let finish: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText("Searching the archive...")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    await user.click(screen.getByRole("link", { name: "Minnumst home" }));
    await act(async () => finish(late()));

    expect(screen.queryByText(/Too late/)).toBeNull();
  });
});

describe("pages of results", () => {
  function pagination() {
    return screen.getByRole("navigation", { name: "Pages of results" });
  }

  it("moves through the pages a few people at a time", async () => {
    goTo("/en/search?q=Person");
    const user = userEvent.setup();
    const fetchMock = stubApi(peopleNamed(60));
    render(<App />);

    await screen.findByText("Showing 1–25 of 60 people.");
    expect(results()).toHaveLength(25);
    expect(pagination()).toHaveTextContent("Page 1 of 3");
    expect(
      within(pagination()).queryByRole("link", { name: /Previous/ }),
    ).toBeNull();

    await user.click(within(pagination()).getByRole("link", { name: /Next/ }));

    await screen.findByText("Showing 26–50 of 60 people.");
    expect(window.location.search).toBe("?q=Person&page=2");
    expect(searchRequests(fetchMock).at(-1)).toContain("offset=25&limit=25");
    expect(results()[0]).toHaveTextContent("Person 26");
    expect(pagination()).toHaveTextContent("Page 2 of 3");
    expect(searchbox()).toHaveValue("Person");
    expect(
      screen.getByRole("heading", { name: "Results for “Person”" }),
    ).toHaveFocus();

    await user.click(within(pagination()).getByRole("link", { name: /Next/ }));

    await screen.findByText("Showing 51–60 of 60 people.");
    expect(results()).toHaveLength(10);
    expect(
      within(pagination()).queryByRole("link", { name: /Next/ }),
    ).toBeNull();

    await user.click(
      within(pagination()).getByRole("link", { name: /Previous/ }),
    );

    await screen.findByText("Showing 26–50 of 60 people.");
    expect(window.location.search).toBe("?q=Person&page=2");
  });

  it("drops the page number from the first page's address", async () => {
    goTo("/en/search?q=Person&page=2");
    const user = userEvent.setup();
    stubApi(peopleNamed(30));
    render(<App />);
    await screen.findByText("Showing 26–30 of 30 people.");

    await user.click(
      within(pagination()).getByRole("link", { name: /Previous/ }),
    );

    await screen.findByText("Showing 1–25 of 30 people.");
    expect(window.location.search).toBe("?q=Person");
  });

  it("offers no page links when everyone fits on one page", async () => {
    goTo("/en/search?q=Person");
    stubApi(peopleNamed(25));
    render(<App />);

    await screen.findByText("Showing 1–25 of 25 people.");

    expect(
      screen.queryByRole("navigation", { name: "Pages of results" }),
    ).toBeNull();
  });

  it("offers the last page when the address goes past the end", async () => {
    goTo("/en/search?q=Person&page=9");
    const user = userEvent.setup();
    stubApi(peopleNamed(30));
    render(<App />);

    await screen.findByText("There are no results on this page.");

    await user.click(
      screen.getByRole("link", { name: "Go to the last page of results" }),
    );

    await screen.findByText("Showing 26–30 of 30 people.");
    expect(window.location.search).toBe("?q=Person&page=2");
  });

  it("works with the back button", async () => {
    goTo("/en/search?q=Person");
    const user = userEvent.setup();
    stubApi(peopleNamed(30));
    render(<App />);
    await screen.findByText("Showing 1–25 of 30 people.");
    await user.click(within(pagination()).getByRole("link", { name: /Next/ }));
    await screen.findByText("Showing 26–30 of 30 people.");

    await goBack();

    await screen.findByText("Showing 1–25 of 30 people.");
  });

  it("leaves a link alone when the reader wants a new tab", async () => {
    goTo("/en/search?q=Person");
    stubApi(peopleNamed(30));
    render(<App />);
    await screen.findByText("Showing 1–25 of 30 people.");
    document.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });

    fireEvent.click(results()[0], { ctrlKey: true });

    expect(window.location.pathname).toBe("/en/search");
  });
});

describe("the address", () => {
  it("has a link do nothing outside the app rather than fail", () => {
    render(<AppLink to="/somewhere">A link</AppLink>);

    fireEvent.click(screen.getByRole("link", { name: "A link" }));

    expect(window.location.pathname).toBe("/en");
  });

  it.each([
    ["", 1],
    ["&page=2", 2],
    ["&page=0", 1],
    ["&page=-1", 1],
    ["&page=1.5", 1],
    ["&page=abc", 1],
    ["&page=99999999999", 1],
  ])("reads a search with %j as page %i", (extra, page) => {
    expect(parseRoute("/search/", `?q=+Ada+${extra}`)).toEqual({
      view: "search",
      query: "Ada",
      page,
    });
  });

  it("reads the other pages, in both languages", () => {
    expect(parseRoute("/", "")).toEqual({ view: "home" });
    expect(parseRoute("/en", "")).toEqual({ view: "home" });
    expect(parseRoute("/anything/else", "")).toEqual({ view: "home" });
    expect(parseRoute("/en/search", "?q=Ada")).toMatchObject({ query: "Ada" });
    expect(parseRoute("/search", "")).toMatchObject({ query: "" });
    expect(parseRoute("/people/a%20b", "")).toEqual({
      view: "profile",
      slug: "a b",
    });
    expect(parseRoute("/en/people/a/", "")).toEqual({
      view: "profile",
      slug: "a",
    });
  });

  it("builds search addresses that survive any query", () => {
    const address = searchPath("is", "Þóra & Jón?", 3);
    const [path, search] = address.split("?");

    expect(path).toBe("/search");
    expect(parseRoute(path, `?${search}`)).toEqual({
      view: "search",
      query: "Þóra & Jón?",
      page: 3,
    });
  });

  it("counts letters and digits, not spaces or symbols", () => {
    for (const enough of ["jon", "Þór", "j o n", "123", "a1b"]) {
      expect(isLongEnough(enough), enough).toBe(true);
    }
    for (const short of ["", "jo", "j o", "...", "%%%", "a.b"]) {
      expect(isLongEnough(short), short).toBe(false);
    }
  });
});

describe("a person's page", () => {
  it("opens from its address", async () => {
    goTo("/en/people/ada-lovelace");
    const fetchMock = stubApi();

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Ada Lovelace" }),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/api\/people\/by-slug\/ada-lovelace$/,
    );
    expect(document.title).toBe("Ada Lovelace | Minnumst");
    expect(
      screen.queryByRole("link", { name: /Back to the results/ }),
    ).toBeNull();
  });

  it("opens from the results and leads back to the same page of them", async () => {
    goTo("/en/search?q=Person&page=2");
    const user = userEvent.setup();
    stubApi(peopleNamed(30));
    render(<App />);
    await screen.findByText("Showing 26–30 of 30 people.");

    await user.click(results()[0]);

    await screen.findByRole("heading", { name: "Ada Lovelace" });
    await user.click(screen.getByRole("link", { name: /Back to the results/ }));

    await screen.findByText("Showing 26–30 of 30 people.");
    expect(window.location.search).toBe("?q=Person&page=2");
  });

  it("returns to the results with the back button, and keeps the link going forward", async () => {
    goTo("/en/search?q=Person");
    const user = userEvent.setup();
    stubApi(peopleNamed(3));
    render(<App />);
    await screen.findByText("Showing 1–3 of 3 people.");

    await user.click(results()[0]);
    await screen.findByRole("heading", { name: "Ada Lovelace" });
    await goBack();

    await screen.findByText("Showing 1–3 of 3 people.");
  });

  it("says when there is no story yet", async () => {
    goTo("/en/people/ada-lovelace");
    stubApi([ada], { ...ada, current_story: null, sources: [] });

    render(<App />);

    expect(
      await screen.findByText(/No story has been written yet/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Person details" }),
    ).toHaveTextContent("Ada Lovelace");
  });

  it.each(["/en/people/missing", "/en/people/%E0%A4%A"])(
    "says when %s can't be found",
    async (address) => {
      goTo(address);
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

      await screen.findByText(/could not find this page/);
      expect(
        screen.queryByRole("article", { name: "Person details" }),
      ).toBeNull();
      expect(document.title).toBe(defaultTitle);
    },
  );

  it("reports other failures in the API's own words", async () => {
    goTo("/en/people/ada-lovelace");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({ detail: "Out of order" }, { status: 503 }),
        ),
      ),
    );

    render(<App />);

    expect(await screen.findByText("Out of order")).toBeVisible();
  });

  it.each([
    ["an answer", () => Response.json({ ...adaProfile, name: "Too late" })],
    ["an error", () => Response.json({ detail: "Too late" }, { status: 500 })],
  ])("ignores %s for a person no longer wanted", async (_, late) => {
    goTo("/en/people/ada-lovelace");
    let finish: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: "Minnumst home" }));
    await act(async () => finish(late()));

    expect(screen.queryByText(/Too late/)).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    expect(document.title).toBe(defaultTitle);
  });

  it("describes a result with no story by the person's dates, or as a short page", async () => {
    goTo("/en/search?q=Ada");
    const dated = { ...ada, birth_date: "1815" };
    const undated = {
      ...ada,
      id: "person-2",
      name: "Undated",
      slug: "undated",
    };
    const titled = {
      ...ada,
      id: "person-3",
      name: "Titled",
      slug: "titled",
      story: {
        title: "A life in letters",
        excerpt: "",
        saved_at: "2026-09-28T10:00:00Z",
        revision_count: 1,
      },
    };
    stubApi([dated, undated, titled]);
    render(<App />);

    await screen.findByText("Showing 1–3 of 3 people.");

    expect(results()[0]).toHaveTextContent(/Ada Lovelace\s*Born 1815/);
    expect(results()[1]).toHaveTextContent(/Undated\s*A short page/);
    expect(results()[2]).toHaveTextContent(/Titled\s*A life in letters/);
  });

  it.each([
    ["1815-12-10", "1852", "Born 10 December 1815 · Died 1852"],
    ["0874", "0930-01-02", "Born 874 · Died 2 January 930"],
    [null, "1852-06-01", "Died 1 June 1852"],
  ])("writes dates out in words: %s, %s", async (birth, death, text) => {
    goTo("/en/people/ada-lovelace");
    stubApi([ada], { ...adaProfile, birth_date: birth, death_date: death });

    render(<App />);

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("shows a story's introduction when it has one", async () => {
    goTo("/en/people/ada-lovelace");
    stubApi([ada], {
      ...adaProfile,
      current_story: { ...adaProfile.current_story, excerpt: "In short" },
    });

    render(<App />);

    expect(await screen.findByText("In short")).toHaveClass("story-excerpt");
  });

  it("links to the person's sources and offers to suggest an edit", async () => {
    goTo("/en/people/ada-lovelace");
    stubApi([ada], {
      ...adaProfile,
      sources: [
        { title: "Wikidata", url: "https://www.wikidata.org/wiki/Q7259" },
      ],
    });

    render(<App />);

    expect(
      await screen.findByRole("link", { name: "Wikidata" }),
    ).toHaveAttribute("href", "https://www.wikidata.org/wiki/Q7259");
    expect(
      screen.getByRole("button", { name: "Suggest an edit" }),
    ).toBeVisible();
    expect(screen.getByText("A story about Ada.")).toBeVisible();
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

  it("gives the contact address", () => {
    stubApi();
    render(<App />);

    expect(
      screen.getByRole("link", { name: "contact@minnumst.org" }),
    ).toHaveAttribute("href", "mailto:contact@minnumst.org");
  });
});

describe("Icelandic", () => {
  afterEach(() => {
    document.documentElement.lang = "en";
  });

  it("serves Icelandic by default, and links to the same page in the other language", async () => {
    goTo("/people/ada-lovelace");
    const fetchMock = stubApi([ada], {
      ...adaProfile,
      birth_date: "1815-12-10",
      death_date: "1852",
    });

    render(<App />);

    expect(
      await screen.findByText("f. 10. desember 1815 · d. 1852"),
    ).toBeVisible();
    expect(document.documentElement.lang).toBe("is");
    expect(document.title).toBe("Ada Lovelace | Minnumst");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/api\/people\/by-slug\/ada-lovelace$/,
    );
    const toEnglish = screen.getByRole("link", { name: "English" });
    expect(toEnglish).toHaveAttribute("href", "/en/people/ada-lovelace");
    expect(toEnglish).toHaveAttribute("lang", "en");
    expect(screen.getByText("A life in letters")).toBeVisible();
  });

  it("invites a first story on a short page without declining the name", async () => {
    goTo("/people/ada-lovelace");
    stubApi([ada], { ...ada, current_story: null, sources: [] });

    render(<App />);

    const invitation = await screen.findByText(/Engin saga hefur enn/);
    expect(invitation).toHaveTextContent("viðkomandi");
    expect(invitation).not.toHaveTextContent("Ada");
  });

  it("offers Icelandic from the English pages", async () => {
    goTo("/en/people/ada-lovelace");
    stubApi();

    render(<App />);

    await screen.findByRole("heading", { name: "Ada Lovelace" });
    expect(screen.getByRole("link", { name: "Íslenska" })).toHaveAttribute(
      "href",
      "/people/ada-lovelace",
    );
  });

  it("keeps the language, search and page when searching and switching", async () => {
    goTo("/");
    stubApi(peopleNamed(30));
    const user = userEvent.setup();
    render(<App />);

    await user.type(
      screen.getByRole("combobox", { name: "Leita eftir nafni" }),
      "Person",
    );
    await user.click(screen.getByRole("button", { name: "Leita" }));

    expect(window.location.pathname).toBe("/search");
    expect(await screen.findByText("Sýni 1–25 af 30.")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Niðurstöður fyrir „Person“" }),
    ).toBeVisible();

    await user.click(screen.getByRole("link", { name: /Næsta/ }));

    await screen.findByText("Sýni 26–30 af 30.");
    expect(screen.getByText("Síða 2 af 2")).toBeVisible();
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute(
      "href",
      "/en/search?q=Person&page=2",
    );

    await user.click(
      within(
        screen.getByRole("list", { name: "Leitarniðurstöður" }),
      ).getAllByRole("link")[0],
    );

    expect(window.location.pathname).toBe("/people/person-26");
    await screen.findByRole("link", { name: /Aftur í niðurstöður/ });
  });

  it("explains failures in Icelandic instead of the API's English", async () => {
    goTo("/people/ada-lovelace");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({ detail: "Out of order" }, { status: 503 }),
        ),
      ),
    );

    render(<App />);

    expect(
      await screen.findByText(
        "Eitthvað fór úrskeiðis. Vinsamlegast reyndu aftur.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Out of order")).toBeNull();
  });

  it("only takes /en itself for English", () => {
    expect(languageFromPath("/")).toBe("is");
    expect(languageFromPath("/people/a")).toBe("is");
    expect(languageFromPath("/en")).toBe("en");
    expect(languageFromPath("/en/")).toBe("en");
    expect(languageFromPath("/en/people/a")).toBe("en");
    expect(languageFromPath("/english")).toBe("is");
    expect(languageFromPath("/people/en")).toBe("is");
    expect(withoutLanguage("/en")).toBe("/");
    expect(withoutLanguage("/en/people/a")).toBe("/people/a");
    expect(inLanguage("en", "/")).toBe("/en");
    expect(inLanguage("en", "/people/a")).toBe("/en/people/a");
    expect(inLanguage("is", "/")).toBe("/");
  });

  it("points readers whose browser doesn't list Icelandic to the English pages", () => {
    goTo("/");
    stubApi();
    render(<App />);

    const notice = screen.getByRole("link", {
      name: /Read this site in English/,
    });
    expect(notice).toHaveAttribute("href", "/en");
    expect(notice.closest("p")).toHaveAttribute("lang", "en");
  });

  it("leaves that pointer out for readers of Icelandic, and on the English pages", () => {
    goTo("/");
    stubApi();
    const languages = vi
      .spyOn(navigator, "languages", "get")
      .mockReturnValue(["is-IS", "en"]);
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Hverra viltu minnast?" }),
    ).toBeVisible();
    expect(screen.queryByText(/Read this site in English/)).toBeNull();
    expect(screen.getByRole("link", { name: "English" })).toBeVisible();
    cleanup();
    languages.mockRestore();

    goTo("/en");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Find someone to remember." }),
    ).toBeVisible();
    expect(screen.queryByText(/Read this site in English/)).toBeNull();
  });

  it("shows no English text on an Icelandic page, apart from the way to English", () => {
    goTo("/");
    stubApi();
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["is"]);
    const { container } = render(<App />);
    const text = container.textContent ?? "";

    for (const [key, value] of Object.entries(translations.en)) {
      if (
        typeof value !== "string" ||
        value === translations.is[key as never]
      ) {
        continue;
      }
      if (key === "otherLanguageName" || key === "languageNotice") continue;
      expect(text, key).not.toContain(value);
    }
    expect(text).toContain(translations.is.aboutText);
  });

  it("has every text in both languages", () => {
    expect(Object.keys(translations.is).sort()).toEqual(
      Object.keys(translations.en).sort(),
    );
    expect(translations.is.months).toHaveLength(12);
    expect(translations.en.months).toHaveLength(12);
  });
});

describe("search suggestions", () => {
  it("waits for three letters", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi();
    render(<App />);

    await user.type(searchbox(), "Ad");
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("debounces suggestions and opens one from the keyboard", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi();
    render(<App />);

    await user.type(searchbox(), "Ada");
    await screen.findByRole("option", { name: /Ada Lovelace/ });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people?query=Ada&offset=0&limit=8",
      expect.anything(),
    );
    expect(searchRequests(fetchMock)).toHaveLength(1);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(await screen.findByText("A story about Ada.")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/en/people/ada-lovelace");
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
    expect(searchbox()).toHaveValue("Ada");
  });

  it("ignores other keys", async () => {
    const user = userEvent.setup();
    stubApi();
    render(<App />);

    await user.type(searchbox(), "Ada");
    await screen.findAllByRole("option");
    await user.keyboard("{Home}");

    expect(screen.getAllByRole("option")).toHaveLength(1);
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

  it("goes to the results when Enter is pressed without a highlighted suggestion", async () => {
    const user = userEvent.setup();
    stubApi([ada, adaJonsdottir]);
    render(<App />);

    await user.type(searchbox(), "Ada");
    await screen.findAllByRole("option");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText("Showing 1–2 of 2 people."),
    ).toBeInTheDocument();
    expect(window.location.search).toBe("?q=Ada");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("opens a suggestion clicked with the mouse", async () => {
    const user = userEvent.setup();
    stubApi();
    render(<App />);

    await user.type(searchbox(), "Ada");
    await user.click(await screen.findByRole("option", { name: /Ada/ }));

    expect(await screen.findByText("A story about Ada.")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/en/people/ada-lovelace");
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
    "ignores a lookup that %s after the reader typed on",
    async (outcome) => {
      const user = userEvent.setup();
      let settle = () => {};
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((resolve, reject) => {
              settle = () =>
                outcome === "arrives"
                  ? resolve(Response.json(pageOf([ada], 8)))
                  : reject(new TypeError("offline"));
            }),
        ),
      );
      render(<App />);

      await user.type(searchbox(), "Ada");
      await waitFor(() =>
        expect(searchbox()).toHaveAttribute("aria-busy", "true"),
      );
      fireEvent.change(searchbox(), { target: { value: "Ad" } });
      await act(() => {
        settle();
        return new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(screen.queryByRole("option")).not.toBeInTheDocument();
      expect(searchbox()).toHaveAttribute("aria-busy", "false");
    },
  );

  it("drops a lookup still waiting when the same search is submitted again", async () => {
    goTo("/en/search?q=Ada");
    const fetchMock = stubApi();
    render(<App />);
    await screen.findByText("Showing 1–1 of 1 people.");
    const before = searchRequests(fetchMock).length;

    fireEvent.change(searchbox(), { target: { value: "Adam" } });
    fireEvent.change(searchbox(), { target: { value: "Ada" } });
    fireEvent.submit(searchbox());
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));

    expect(searchRequests(fetchMock)).toHaveLength(before);
    expect(screen.queryByRole("option")).toBeNull();
  });
});
