import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageContext } from "./i18n";
import SuggestionForm from "./SuggestionForm";
import { ada, adaProfile, type PersonDetail } from "./test/fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(response: Response) {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  return { url, body: JSON.parse(init.body as string) as object };
}

const receipt = () => Response.json({ id: "s1", status: "pending" });

async function open(person: PersonDetail = adaProfile) {
  const user = userEvent.setup();
  render(
    <LanguageContext.Provider value="en">
      <SuggestionForm person={person} contact="contact@example.org" />
    </LanguageContext.Provider>,
  );
  await user.click(screen.getByRole("button", { name: "Suggest an edit" }));
  return user;
}

describe("suggesting an edit", () => {
  it("starts from the current story and sends the visitor's changes", async () => {
    const fetchMock = stubFetch(receipt());
    const user = await open();

    const story = screen.getByRole("textbox", { name: "Story" });
    expect(story).toHaveValue("A story about Ada.");
    await user.type(story, " With more.");
    await user.click(screen.getByRole("button", { name: "Send for review" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Thank you for helping to remember Ada Lovelace",
    );
    const { url, body } = sentBody(fetchMock);
    expect(url).toMatch(/\/api\/people\/person-1\/suggestions$/);
    expect(body).toEqual({
      kind: "edit",
      base_revision_number: 1,
      title: "A life in letters",
      excerpt: "",
      content: "A story about Ada. With more.",
      note: "",
      source_url: "",
    });
  });

  it("lets a visitor write the first story for a short page", async () => {
    const fetchMock = stubFetch(receipt());
    const user = await open({ ...ada, current_story: null, sources: [] });

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Her life");
    await user.type(screen.getByRole("textbox", { name: "Story" }), "Text");
    await user.click(screen.getByRole("button", { name: "Send for review" }));

    await screen.findByRole("status");
    expect(sentBody(fetchMock).body).toMatchObject({
      base_revision_number: null,
      title: "Her life",
      content: "Text",
    });
  });

  it("sends a correction or removal request without any story text", async () => {
    const fetchMock = stubFetch(receipt());
    const user = await open();

    await user.click(screen.getByRole("radio", { name: /Report a mistake/ }));
    expect(screen.queryByRole("textbox", { name: "Story" })).toBeNull();
    await user.type(
      screen.getByRole("textbox", { name: /What is wrong/ }),
      "Wrong year",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Link to a source/ }),
      "https://example.org/a",
    );
    await user.click(screen.getByRole("button", { name: "Send for review" }));

    await screen.findByRole("status");
    expect(sentBody(fetchMock).body).toEqual({
      kind: "request",
      base_revision_number: 1,
      note: "Wrong year",
      source_url: "https://example.org/a",
    });
  });

  it("can switch back to editing", async () => {
    stubFetch(receipt());
    const user = await open();

    await user.click(screen.getByRole("radio", { name: /Report a mistake/ }));
    await user.click(
      screen.getByRole("radio", { name: "Write or improve the story" }),
    );

    expect(screen.getByRole("textbox", { name: "Story" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "!");
    await user.type(
      screen.getByRole("textbox", { name: "Introduction (optional)" }),
      "Intro",
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "A life in letters!",
    );
  });

  it("keeps the text and shows the reason when sending fails", async () => {
    stubFetch(Response.json({ detail: "Too many" }, { status: 400 }));
    const user = await open();

    await user.click(screen.getByRole("button", { name: "Send for review" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many");
    expect(screen.getByRole("textbox", { name: "Story" })).toHaveValue(
      "A story about Ada.",
    );
    expect(
      screen.getByRole("button", { name: "Send for review" }),
    ).toBeEnabled();
  });

  it.each([
    [429, "Please wait a few minutes"],
    [413, "Please shorten it"],
  ])("explains the edge's %i in plain words", async (status, text) => {
    stubFetch(new Response("Too much", { status }));
    const user = await open();

    await user.click(screen.getByRole("button", { name: "Send for review" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("explains a refused suggestion in Icelandic instead of the API's English", async () => {
    stubFetch(Response.json({ detail: "Too many" }, { status: 400 }));
    const user = userEvent.setup();
    render(
      <LanguageContext.Provider value="is">
        <SuggestionForm person={adaProfile} contact="contact@example.org" />
      </LanguageContext.Provider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Leggja til breytingu" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Senda til yfirlestrar" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Eitthvað fór úrskeiðis",
    );
  });

  it("thanks in Icelandic without declining the person's name", async () => {
    stubFetch(receipt());
    const user = userEvent.setup();
    render(
      <LanguageContext.Provider value="is">
        <SuggestionForm person={adaProfile} contact="contact@example.org" />
      </LanguageContext.Provider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Leggja til breytingu" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Senda til yfirlestrar" }),
    );

    const thanks = await screen.findByRole("status");
    expect(thanks).toHaveTextContent("varðveita þessa minningu");
    expect(thanks).not.toHaveTextContent("Ada");
  });

  it("can be closed again, keeping what was written", async () => {
    stubFetch(receipt());
    const user = await open();

    await user.type(screen.getByRole("textbox", { name: "Title" }), "!");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("form", { name: "Suggest an edit" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Suggest an edit" }));

    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "A life in letters!",
    );
  });

  it("moves keyboard focus to the form it opens", async () => {
    stubFetch(receipt());
    await open();

    expect(screen.getByRole("form", { name: "Suggest an edit" })).toHaveFocus();
  });

  it("asks for nothing about the visitor", async () => {
    stubFetch(receipt());
    await open();

    expect(screen.queryByRole("textbox", { name: /name|mail/i })).toBeNull();
    expect(
      screen.getByRole("link", { name: "contact@example.org" }),
    ).toBeTruthy();
  });
});
