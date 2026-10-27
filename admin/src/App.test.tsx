import { StrictMode } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  apiPerson,
  apiResponse,
  apiRevision,
  blogResponse,
  blogSummary,
  peoplePage,
} from "./test/fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetModules();
  Reflect.deleteProperty(window, "__MINNUMST_ENV__");
});

type ApiCall = { method: string; path: string };

// Answers each request by method and path, like the API's router would.
function stubApi(route: (call: ApiCall) => Response | Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(
      route({
        method: init?.method ?? "GET",
        path: new URL(String(input)).pathname,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function callsTo(fetchMock: ReturnType<typeof stubApi>, method: string) {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init?.method ?? "GET") === method,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

// A successful response whose body can't be read and that fails with
// something other than an Error, so no message reaches the editor.
function unreadableResponse() {
  return Object.assign(new Response(), {
    json: () => Promise.reject("unreadable"),
  });
}

const ada = apiPerson({
  id: "person-1",
  name: "Ada Lovelace",
  slug: "ada-lovelace",
});
const bjork = apiPerson({
  id: "person-2",
  name: "Björk Guðmundsdóttir",
  slug: "bjork-gudmundsdottir",
});
const adaRevisions = [
  apiRevision(1, {
    saved_at: "2026-09-27T12:00:00Z",
    title: "A life in letters",
    content: "First version",
  }),
  apiRevision(2, {
    title: "A life in mathematics",
    excerpt: "Numbers and engines",
    content: "Second version",
  }),
];
const adaWithStory = apiPerson({ ...ada, blog: blogSummary(adaRevisions[1]) });

describe("blog page editor", () => {
  it("lists people and filters them by name", async () => {
    const user = userEvent.setup();
    stubApi(() => apiResponse(peoplePage([adaWithStory, bjork])));
    render(<App />);

    expect(screen.getByText("Loading people...")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: /Ada Lovelace\s*A life in mathematics/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Björk Guðmundsdóttir\s*Untitled page/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 PAGES")).toBeInTheDocument();
    expect(screen.queryByText("DEBUG")).not.toBeInTheDocument();

    const filter = screen.getByRole("searchbox");
    await user.type(filter, "BJÖRK");
    expect(
      screen.queryByRole("button", { name: /Ada Lovelace/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Björk/ })).toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, "Sigríður");
    expect(screen.getByText("No matching names.")).toBeInTheDocument();
  });

  it("describes a new page before it is saved", async () => {
    const user = userEvent.setup();
    stubApi(() => apiResponse(peoplePage([])));
    render(<App />);

    await screen.findByText("No people have been added yet.");
    expect(screen.getByText("0 PAGES")).toBeInTheDocument();
    expect(screen.getByText("New story")).toBeInTheDocument();
    expect(screen.getByText("Not assigned")).toBeInTheDocument();
    expect(screen.getByText("/people/person-name")).toBeInTheDocument();
    expect(screen.getByText("0 saved versions")).toBeInTheDocument();
    expect(screen.getByText("No versions saved")).toBeInTheDocument();
    expect(screen.getByText("http://127.0.0.1:8000")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update name" }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Person name/), "Ada");
    expect(screen.getByText("/people/...")).toBeInTheDocument();
    expect(screen.getAllByText("Ada")).toHaveLength(2);

    await user.click(screen.getByRole("tab", { name: "Preview" }));
    const preview = within(screen.getByRole("article"));
    expect(preview.getByText("Your page title")).toBeInTheDocument();
    expect(
      preview.getByText("Your story will appear here as you write."),
    ).toBeInTheDocument();
    expect(preview.queryByText(/A STORY ABOUT/)).not.toBeInTheDocument();
    expect(preview.queryByText(/Public story/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText("0 VERSIONS")).toBeInTheDocument();
    expect(
      screen.getByText("Save this page to start its history."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Write" }));
    expect(screen.getByLabelText(/Person name/)).toHaveValue("Ada");
    await user.type(screen.getByLabelText(/Introduction/), "Letters home");
    await user.click(screen.getByRole("tab", { name: "Preview" }));
    expect(
      within(screen.getByRole("article")).getByText("Letters home"),
    ).toBeInTheDocument();
  });

  it("loads a page's immutable history when it is selected", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(({ path }) =>
      path === "/api/people/person-1/blog/revisions"
        ? apiResponse(adaRevisions)
        : apiResponse(peoplePage([adaWithStory, bjork])),
    );
    render(<App />);

    const adaButton = await screen.findByRole("button", {
      name: /Ada Lovelace/,
    });
    await user.click(adaButton);

    expect(
      await screen.findByDisplayValue("Second version"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Page title/)).toHaveValue(
      "A life in mathematics",
    );
    expect(screen.getByLabelText(/Introduction/)).toHaveValue(
      "Numbers and engines",
    );
    expect(adaButton).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Edit page" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Update name" })).toBeDisabled();
    expect(screen.getByText("2 saved versions")).toBeInTheDocument();
    expect(screen.getByText("Last saved Sep 28, 2026")).toBeInTheDocument();
    expect(screen.getByText("/people/ada-lovelace")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /History\s*2/ }));
    const revisions = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toHaveTextContent("Current version");
    expect(revisions[0]).toHaveTextContent("A life in mathematics");
    expect(revisions[0]).toHaveTextContent("Numbers and engines");
    expect(revisions[1]).toHaveTextContent("Saved version");
    expect(revisions[1]).toHaveTextContent("A life in letters");
    // Without an introduction, the history shows the story itself.
    expect(revisions[1]).toHaveTextContent("First version");

    await user.click(screen.getByRole("tab", { name: "Preview" }));
    const preview = within(screen.getByRole("article"));
    expect(preview.getByText("A STORY ABOUT ADA LOVELACE")).toBeInTheDocument();
    expect(
      preview.getByRole("heading", { name: "A life in mathematics" }),
    ).toBeInTheDocument();
    expect(preview.getByText("Numbers and engines")).toBeInTheDocument();
    expect(preview.getByText("Second version")).toBeInTheDocument();
    expect(
      preview.getByText("Public story · ada-lovelace"),
    ).toBeInTheDocument();

    // A person without a story has no history yet.
    await user.click(screen.getByRole("button", { name: /Björk/ }));
    expect(screen.getByLabelText(/Page title/)).toHaveValue("");
    expect(screen.getByLabelText(/Story/)).toHaveValue("");
    await user.click(screen.getByRole("tab", { name: /History\s*0/ }));
    expect(
      screen.getByText("Save this page to start its history."),
    ).toBeInTheDocument();

    // Returning to a page reuses the history that was already loaded.
    await user.click(adaButton);
    expect(screen.getByLabelText(/Story/)).toHaveValue("Second version");
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/blog/revisions"),
      ),
    ).toHaveLength(1);
  });

  it("falls back to the story summary when no revisions come back", async () => {
    const user = userEvent.setup();
    const revision = apiRevision(1, {
      title: "A life in letters",
      excerpt: "Letters home",
    });
    stubApi(({ path }) =>
      path === "/api/people/person-1/blog/revisions"
        ? apiResponse([])
        : apiResponse(
            peoplePage([apiPerson({ ...ada, blog: blogSummary(revision) })]),
          ),
    );
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent("");
    expect(screen.getByLabelText(/Page title/)).toHaveValue(
      "A life in letters",
    );
    expect(screen.getByLabelText(/Introduction/)).toHaveValue("Letters home");
    expect(screen.getByLabelText(/Story/)).toHaveValue("");
    expect(screen.getByText("1 saved version")).toBeInTheDocument();
    expect(screen.getByText("Last saved Sep 28, 2026")).toBeInTheDocument();
    expect(screen.getByText("1 PAGE")).toBeInTheDocument();
  });

  it("shows why a page's history could not be loaded", async () => {
    const user = userEvent.setup();
    stubApi(({ path }) =>
      path === "/api/people/person-1/blog/revisions"
        ? apiResponse({ detail: "Person not found" }, { status: 404 })
        : apiResponse(peoplePage([adaWithStory])),
    );
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Person not found",
    );
  });

  it("ignores history that arrives after another page was selected", async () => {
    const user = userEvent.setup();
    const pending = [deferred<Response>(), deferred<Response>()];
    let revisionRequests = 0;
    stubApi(({ path }) =>
      path === "/api/people/person-1/blog/revisions"
        ? pending[revisionRequests++].promise
        : apiResponse(peoplePage([adaWithStory, bjork])),
    );
    render(<App />);

    const adaButton = await screen.findByRole("button", {
      name: /Ada Lovelace/,
    });
    await user.click(adaButton);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading saved revisions...",
    );
    await user.click(screen.getByRole("button", { name: "New page" }));
    await act(async () => pending[0].resolve(apiResponse(adaRevisions)));

    expect(screen.getByLabelText(/Story/)).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(adaButton).not.toHaveAttribute("aria-current");

    // The stale history was not kept, so selecting Ada again reloads it.
    await user.click(adaButton);
    await user.click(screen.getByRole("button", { name: /Björk/ }));
    await act(async () =>
      pending[1].resolve(
        apiResponse({ detail: "Person not found" }, { status: 404 }),
      ),
    );

    expect(revisionRequests).toBe(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Person name/)).toHaveValue(
      "Björk Guðmundsdóttir",
    );
  });

  it("shows an error when people can't be loaded", async () => {
    stubApi(() => new Response("Internal Server Error", { status: 500 }));
    render(<App />);

    expect(
      await screen.findByText("The Minnumst API returned 500."),
    ).toBeInTheDocument();
  });

  it("falls back to a generic message when people can't be read", async () => {
    stubApi(() => unreadableResponse());
    render(<App />);

    expect(
      await screen.findByText("Could not load people."),
    ).toBeInTheDocument();
  });

  it("falls back to generic messages when a write fails without one", async () => {
    const user = userEvent.setup();
    stubApi(({ method, path }) =>
      method === "GET" && path === "/api/people"
        ? apiResponse(peoplePage([adaWithStory, bjork]))
        : unreadableResponse(),
    );
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load this page's history.",
    );

    await user.click(screen.getByRole("button", { name: /Björk/ }));
    await user.type(screen.getByLabelText(/Person name/), " Jónsdóttir");
    await user.click(screen.getByRole("button", { name: "Update name" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The name could not be updated.",
    );

    await user.click(screen.getByRole("button", { name: "New page" }));
    await user.type(screen.getByLabelText(/Person name/), "Sigríður");
    await user.type(screen.getByLabelText(/Page title/), "A farm by the sea");
    await user.type(screen.getByLabelText(/Story/), "She kept the farm.");
    await user.click(screen.getByRole("button", { name: "Save revision" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The page could not be saved.",
    );
  });

  it("ignores the people list from a cancelled first load", async () => {
    const loads = [deferred<Response>(), deferred<Response>()];
    let peopleRequests = 0;
    stubApi(() => loads[peopleRequests++].promise);
    // StrictMode runs the loading effect twice, cancelling the first run.
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(peopleRequests).toBe(2);

    await act(async () => loads[0].resolve(apiResponse(peoplePage([bjork]))));
    expect(screen.getByText("Loading people...")).toBeInTheDocument();

    await act(async () => loads[1].resolve(apiResponse(peoplePage([ada]))));
    expect(
      screen.getByRole("button", { name: /Ada Lovelace/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Björk/ }),
    ).not.toBeInTheDocument();
  });

  it("ignores an error from a cancelled first load", async () => {
    const loads = [deferred<Response>(), deferred<Response>()];
    let peopleRequests = 0;
    stubApi(() => loads[peopleRequests++].promise);
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    await act(async () =>
      loads[0].resolve(new Response("Bad Gateway", { status: 502 })),
    );
    expect(screen.getByText("Loading people...")).toBeInTheDocument();

    await act(async () => loads[1].resolve(apiResponse(peoplePage([]))));
    expect(
      screen.getByText("No people have been added yet."),
    ).toBeInTheDocument();
  });

  it("marks diagnostics mode in the top bar", async () => {
    Object.defineProperty(window, "__MINNUMST_ENV__", {
      configurable: true,
      value: { DEBUG: "true" },
    });
    vi.resetModules();
    const { default: DebugApp } = await import("./App");
    stubApi(() => apiResponse(peoplePage([])));
    render(<DebugApp />);

    expect(screen.getByText("DEBUG")).toBeInTheDocument();
    await screen.findByText("No people have been added yet.");
  });

  it("renames an existing person without creating a story revision", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(({ method }) =>
      apiResponse(
        method === "PATCH"
          ? apiPerson({ ...ada, name: "Ada Byron" })
          : peoplePage([ada, bjork]),
      ),
    );
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    );
    const nameInput = screen.getByLabelText(/Person name/);
    const updateName = screen.getByRole("button", { name: "Update name" });
    await user.clear(nameInput);
    expect(updateName).toBeDisabled();
    await user.type(nameInput, "  Ada   Lovelace ");
    expect(updateName).toBeDisabled();

    await user.clear(nameInput);
    await user.type(nameInput, "  Ada   Byron ");
    expect(updateName).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save revision" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Update the person name before saving a story revision.",
    );
    expect(callsTo(fetchMock, "PUT")).toHaveLength(0);

    await user.click(updateName);

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
    expect(callsTo(fetchMock, "PUT")).toHaveLength(0);
    expect(nameInput).toHaveValue("Ada Byron");
    expect(
      screen.getByRole("button", { name: /Ada Byron/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Björk/ })).toBeInTheDocument();
  });

  it("shows the API's reason when a person can't be renamed", async () => {
    const user = userEvent.setup();
    const renameResponses = [
      apiResponse(
        { detail: "A person with this normalized name already exists" },
        { status: 409 },
      ),
      apiResponse(
        {
          detail: [
            {
              loc: ["body", "name"],
              msg: "String should have at most 200 characters",
              type: "string_too_long",
            },
          ],
        },
        { status: 422 },
      ),
    ];
    const fetchMock = stubApi(({ method }) =>
      method === "PATCH"
        ? renameResponses.shift()!
        : apiResponse(peoplePage([ada])),
    );
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

    await user.click(screen.getByRole("button", { name: "Update name" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "String should have at most 200 characters",
    );
    expect(callsTo(fetchMock, "PUT")).toHaveLength(0);
  });

  it("creates one person and appends each edit to API revision history", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiResponse(peoplePage([])))
      .mockResolvedValueOnce(apiResponse(ada))
      .mockResolvedValueOnce(
        apiResponse(
          blogResponse(
            "person-1",
            apiRevision(1, {
              title: "A life in letters",
              content: "First version",
            }),
          ),
        ),
      )
      .mockResolvedValueOnce(
        apiResponse(
          blogResponse(
            "person-1",
            apiRevision(2, {
              title: "A life in mathematics",
              content: "Second version",
            }),
          ),
        ),
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
    expect(callsTo(fetchMock, "POST")).toHaveLength(1);
    expect(callsTo(fetchMock, "PUT")).toHaveLength(2);
  });

  it("appends a revision to a page that already has a story", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(({ method, path }) => {
      if (method === "PUT")
        return apiResponse(
          blogResponse(
            "person-1",
            apiRevision(3, {
              title: "A life in mathematics",
              excerpt: "Numbers and engines",
              content: "Third version",
            }),
          ),
        );
      return path === "/api/people/person-1/blog/revisions"
        ? apiResponse(adaRevisions)
        : apiResponse(peoplePage([adaWithStory, bjork]));
    });
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    );
    const story = await screen.findByDisplayValue("Second version");
    await user.clear(story);
    await user.type(story, "Third version");
    await user.click(screen.getByRole("button", { name: "Save revision" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved to the shared archive as revision 3.",
    );
    expect(callsTo(fetchMock, "POST")).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people/person-1/blog",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          title: "A life in mathematics",
          excerpt: "Numbers and engines",
          content: "Third version",
        }),
      }),
    );
    await user.click(screen.getByRole("tab", { name: /History\s*3/ }));
    const revisions = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(
      revisions.map((item) => item.querySelector("p")?.textContent),
    ).toEqual(["Numbers and engines", "Numbers and engines", "First version"]);
    expect(
      screen.getAllByRole("button", { name: /Ada Lovelace/ }),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Björk/ })).toBeInTheDocument();
  });

  it("keeps a new page when the people list arrives after it was created", async () => {
    const user = userEvent.setup();
    const people = deferred<Response>();
    const saved = deferred<Response>();
    const fetchMock = stubApi(({ method }) => {
      if (method === "POST") return apiResponse(ada);
      if (method === "PUT") return saved.promise;
      return people.promise;
    });
    render(<App />);

    await user.type(screen.getByLabelText(/Person name/), "Ada Lovelace");
    await user.type(screen.getByLabelText(/Page title/), "A life in letters");
    await user.type(screen.getByLabelText(/Story/), "First version");
    await user.click(screen.getByRole("button", { name: "Save revision" }));
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    await vi.waitFor(() => expect(callsTo(fetchMock, "PUT")).toHaveLength(1));

    // The list loaded before Ada was created replaces the one that had her.
    await act(async () => people.resolve(apiResponse(peoplePage([bjork]))));
    expect(
      screen.queryByRole("button", { name: /Ada Lovelace/ }),
    ).not.toBeInTheDocument();

    await act(async () =>
      saved.resolve(
        apiResponse(
          blogResponse(
            "person-1",
            apiRevision(1, {
              title: "A life in letters",
              content: "First version",
            }),
          ),
        ),
      ),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Saved to the shared archive as revision 1.",
    );
    expect(
      screen.getByRole("button", { name: /Ada Lovelace\s*A life in letters/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("2 PAGES")).toBeInTheDocument();
  });

  it("explains why a new page could not be created", async () => {
    const user = userEvent.setup();
    const createResponses = [
      apiResponse(
        { detail: "A person with this normalized name already exists" },
        { status: 409 },
      ),
      apiResponse(
        {
          detail: [
            {
              loc: ["body", "name"],
              msg: "String should have at least 1 character",
              type: "string_too_short",
            },
          ],
        },
        { status: 422 },
      ),
    ];
    const fetchMock = stubApi(({ method }) =>
      method === "POST"
        ? createResponses.shift()!
        : apiResponse(peoplePage([])),
    );
    render(<App />);

    await screen.findByText("No people have been added yet.");
    await user.type(screen.getByLabelText(/Person name/), "Ada Lovelace");
    await user.type(screen.getByLabelText(/Page title/), "A life in letters");
    await user.type(screen.getByLabelText(/Story/), "First version");
    await user.click(screen.getByRole("button", { name: "Save revision" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A person with this name already exists. Select them from the pages list and save the story there.",
    );

    await user.click(screen.getByRole("button", { name: "Save revision" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "String should have at least 1 character",
    );
    expect(callsTo(fetchMock, "PUT")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Save revision" })).toBeEnabled();
  });

  it("requires a name, title, and story before creating a person", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(() => apiResponse(peoplePage([])));
    render(<App />);

    const save = await screen.findByRole("button", { name: "Save revision" });
    await user.click(save);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add a person name, page title, and story before saving.",
    );

    await user.type(screen.getByLabelText(/Person name/), "Ada Lovelace");
    await user.click(save);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add a person name, page title, and story before saving.",
    );

    await user.type(screen.getByLabelText(/Page title/), "A life in letters");
    await user.type(screen.getByLabelText(/Story/), "   ");
    await user.click(save);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add a person name, page title, and story before saving.",
    );
    expect(callsTo(fetchMock, "POST")).toHaveLength(0);
    expect(callsTo(fetchMock, "PUT")).toHaveLength(0);
  });
});
