import { StrictMode } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Suggestions from "./Suggestions";
import {
  apiPerson,
  apiResponse,
  apiRevision,
  apiSuggestion,
  suggestionPage,
} from "./test/fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const hiddenPerson = apiPerson({
  id: "person-9",
  name: "Hidden",
  slug: "hidden",
});

function stubApi(
  items = [apiSuggestion()],
  decide: () => Response = () => apiResponse(apiSuggestion()),
  hidden = [hiddenPerson],
) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if ((init?.method ?? "GET") !== "GET") return Promise.resolve(decide());
    return Promise.resolve(
      path.endsWith("/hidden")
        ? apiResponse(hidden)
        : apiResponse(suggestionPage(items)),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function postsTo(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([input, init]) => ({
      path: new URL(String(input)).pathname,
      body: init?.body,
    }));
}

function renderQueue() {
  const onPendingChange = vi.fn();
  const onPersonRestored = vi.fn();
  render(
    <Suggestions
      onPendingChange={onPendingChange}
      onPersonRestored={onPersonRestored}
    />,
  );
  return { onPendingChange, onPersonRestored };
}

describe("the review queue", () => {
  it("compares the proposal with the current story and publishes the editor's version", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi([
      apiSuggestion({
        base_revision_number: 2,
        current_revision: apiRevision(2, {
          title: "The current title",
          content: "The current story.",
        }),
      }),
    ]);
    const { onPendingChange } = renderQueue();

    const current = await screen.findByRole("region", {
      name: "Current story",
    });
    expect(within(current).getByText("The current story.")).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
    expect(onPendingChange).toHaveBeenLastCalledWith(1);

    const story = screen.getByLabelText("Story");
    await user.type(story, " Tidied.");
    await user.type(screen.getByLabelText("Title"), "!");
    await user.type(screen.getByLabelText("Introduction"), "Intro");
    await user.click(
      screen.getByRole("button", { name: "Accept and publish" }),
    );

    expect(
      await screen.findByText("0 waiting for review."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Story")).toBeNull();
    expect(onPendingChange).toHaveBeenLastCalledWith(0);
    expect(postsTo(fetchMock)).toEqual([
      {
        path: "/api/admin/suggestions/suggestion-1/accept",
        body: JSON.stringify({
          story: {
            title: "A proposed title!",
            excerpt: "Intro",
            content: "A proposed story. Tidied.",
          },
        }),
      },
    ]);
  });

  it("warns when the story has moved on, and handles a first story", async () => {
    stubApi([
      apiSuggestion({
        id: "stale",
        base_revision_number: 1,
        current_revision: apiRevision(2),
      }),
      apiSuggestion({ id: "first" }),
    ]);
    renderQueue();

    expect(await screen.findByRole("note")).toHaveTextContent(
      "The story has changed since this was written",
    );
    expect(screen.getByText("No story yet.")).toBeInTheDocument();
  });

  it("won't accept an edit emptied by the editor", async () => {
    const user = userEvent.setup();
    stubApi();
    renderQueue();

    await user.clear(await screen.findByLabelText("Story"));

    expect(
      screen.getByRole("button", { name: "Accept and publish" }),
    ).toBeDisabled();
  });

  it("marks a request as handled, showing the note and source as plain text", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi([
      apiSuggestion({
        kind: "request",
        title: null,
        excerpt: null,
        content: null,
        note: "Please remove this.",
        source_url: "https://example.org/a",
      }),
    ]);
    renderQueue();

    expect(await screen.findByText("Please remove this.")).toBeInTheDocument();
    expect(screen.getByText("https://example.org/a")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByLabelText("Story")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Mark as handled" }));

    expect(
      await screen.findByText("0 waiting for review."),
    ).toBeInTheDocument();
    expect(postsTo(fetchMock)[0].body).toBe("{}");
  });

  it("rejects a suggestion", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi();
    renderQueue();

    await user.click(
      await screen.findByRole("button", { name: "Reject and delete" }),
    );

    expect(
      await screen.findByText("0 waiting for review."),
    ).toBeInTheDocument();
    expect(postsTo(fetchMock)[0].path).toBe(
      "/api/admin/suggestions/suggestion-1/reject",
    );
  });

  it("keeps a suggestion and explains when a decision fails", async () => {
    const user = userEvent.setup();
    stubApi(undefined, () =>
      apiResponse(
        { detail: "This suggestion has already been decided" },
        { status: 409 },
      ),
    );
    renderQueue();

    await user.click(
      await screen.findByRole("button", { name: "Reject and delete" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already been decided",
    );
    expect(
      screen.getByRole("button", { name: "Reject and delete" }),
    ).toBeEnabled();
  });

  it("explains when the queue can't load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(apiResponse({ detail: "No access" }, { status: 403 })),
      ),
    );
    renderQueue();

    expect(await screen.findByText(/No access/)).toBeInTheDocument();
  });

  it.each([
    ["an answer", apiResponse(suggestionPage([apiSuggestion()]))],
    ["an error", apiResponse({ detail: "Too late" }, { status: 500 })],
  ])("ignores %s from a cancelled load", async (_, late) => {
    let finish: (response: Response) => void = () => undefined;
    const cancelled = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).endsWith("/hidden")) {
          return Promise.resolve(apiResponse([]));
        }
        calls += 1;
        // StrictMode runs the effect twice, cancelling the first run's request.
        return calls === 1
          ? cancelled
          : Promise.resolve(apiResponse(suggestionPage([])));
      }),
    );
    const onPendingChange = vi.fn();
    render(
      <StrictMode>
        <Suggestions
          onPendingChange={onPendingChange}
          onPersonRestored={vi.fn()}
        />
      </StrictMode>,
    );
    await screen.findByText("0 waiting for review.");

    await act(async () => finish(late));

    expect(screen.queryByText(/Too late/)).toBeNull();
    expect(screen.getByText("0 waiting for review.")).toBeInTheDocument();
    expect(onPendingChange).toHaveBeenCalledTimes(1);
  });
});

describe("hidden people", () => {
  it("shows a hidden person again and tells the desk", async () => {
    const user = userEvent.setup();
    stubApi([], () => apiResponse(apiSuggestion()), [hiddenPerson]);
    vi.mocked(fetch).mockImplementationOnce(() =>
      Promise.resolve(apiResponse(suggestionPage([]))),
    );
    const { onPersonRestored } = renderQueue();

    await user.click(
      await screen.findByRole("button", { name: "Show Hidden again" }),
    );

    expect(await screen.findByText("Nobody is hidden.")).toBeInTheDocument();
    expect(onPersonRestored).toHaveBeenCalled();
  });

  it("explains when a person can't be shown again", async () => {
    const user = userEvent.setup();
    stubApi([], () =>
      apiResponse({ detail: "Could not change" }, { status: 500 }),
    );
    renderQueue();

    await user.click(
      await screen.findByRole("button", { name: "Show Hidden again" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Could not change",
    );
    expect(
      screen.getByRole("button", { name: "Show Hidden again" }),
    ).toBeInTheDocument();
  });
});
