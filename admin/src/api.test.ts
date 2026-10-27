import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPerson,
  loadPeople,
  loadPersonRevisions,
  savePersonRevision,
  updatePersonName,
} from "./api";
import {
  apiPerson,
  apiResponse,
  apiRevision,
  blogResponse,
  blogSummary,
  peoplePage,
} from "./test/fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("admin API client", () => {
  it("loads people using the shared paginated people endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      apiResponse(
        peoplePage([
          apiPerson({
            id: "person-1",
            name: "Ásta Jónsdóttir",
            slug: "asta-jonsdottir",
          }),
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadPeople()).resolves.toEqual([
      {
        id: "person-1",
        personName: "Ásta Jónsdóttir",
        slug: "asta-jonsdottir",
        blog: null,
        revisions: [],
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people?offset=0&limit=100",
      // Reads send the Authentik session cookie and need no CORS preflight.
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("maps each person's story summary", async () => {
    const revision = apiRevision(3, {
      title: "A life in letters",
      excerpt: "Letters home",
      saved_at: "2026-09-28T13:00:00Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        apiResponse(
          peoplePage([
            apiPerson({
              id: "person-1",
              name: "Ada Lovelace",
              slug: "ada-lovelace",
              blog: blogSummary(revision),
            }),
          ]),
        ),
      ),
    );

    await expect(loadPeople()).resolves.toMatchObject([
      {
        blog: {
          title: "A life in letters",
          excerpt: "Letters home",
          savedAt: "2026-09-28T13:00:00Z",
          revisionCount: 3,
        },
        revisions: [],
      },
    ]);
  });

  it("follows the pages until every person is loaded", async () => {
    const first = apiPerson({ id: "person-1", name: "Ada", slug: "ada" });
    const second = apiPerson({ id: "person-2", name: "Björk", slug: "bjork" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiResponse(peoplePage([first], { total: 2 })))
      .mockResolvedValueOnce(
        apiResponse(peoplePage([second], { total: 2, offset: 1 })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const people = await loadPeople();

    expect(people.map((person) => person.id)).toEqual(["person-1", "person-2"]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:8000/api/people?offset=0&limit=100",
      "http://127.0.0.1:8000/api/people?offset=1&limit=100",
    ]);
  });

  it("stops paging when a page comes back empty", async () => {
    // People deleted between requests can leave the total higher than the
    // rows that remain.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        apiResponse(
          peoplePage(
            [apiPerson({ id: "person-1", name: "Ada", slug: "ada" })],
            {
              total: 5,
            },
          ),
        ),
      )
      .mockResolvedValueOnce(
        apiResponse(peoplePage([], { total: 5, offset: 1 })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadPeople()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates a person through the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      apiResponse(
        apiPerson({
          id: "person-1",
          name: "Ada Lovelace",
          slug: "ada-lovelace",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPerson("  Ada   Lovelace ")).resolves.toMatchObject({
      id: "person-1",
      personName: "Ada Lovelace",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Ada Lovelace" }),
      }),
    );
  });

  it("updates a person's name through the existing API endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        apiResponse(
          apiPerson({ id: "person-1", name: "Ada Byron", slug: "ada-byron" }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updatePersonName("person-1", "  Ada   Byron "),
    ).resolves.toMatchObject({
      id: "person-1",
      personName: "Ada Byron",
      slug: "ada-byron",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people/person-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Ada Byron" }),
      }),
    );
  });

  it("loads revisions in chronological order for the editor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      apiResponse([
        apiRevision(2, {
          saved_at: "2026-09-28T11:00:00Z",
          title: "Second",
          content: "Second version",
        }),
        apiRevision(1, {
          saved_at: "2026-09-28T10:00:00Z",
          title: "First",
          excerpt: "An excerpt",
          content: "First version",
        }),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadPersonRevisions("person-1")).resolves.toEqual([
      {
        id: "revision-1",
        revisionNumber: 1,
        savedAt: "2026-09-28T10:00:00Z",
        title: "First",
        excerpt: "An excerpt",
        content: "First version",
      },
      {
        id: "revision-2",
        revisionNumber: 2,
        savedAt: "2026-09-28T11:00:00Z",
        title: "Second",
        excerpt: "",
        content: "Second version",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people/person-1/blog/revisions",
      expect.anything(),
    );
  });

  it("saves a revision using the API's append-only blog endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      apiResponse(
        blogResponse(
          "person-1",
          apiRevision(2, {
            saved_at: "2026-09-28T11:00:00Z",
            title: "Updated story",
            excerpt: "An excerpt",
            content: "Updated content",
          }),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      savePersonRevision("person-1", {
        title: " Updated story ",
        excerpt: " An excerpt ",
        content: " Updated content ",
      }),
    ).resolves.toMatchObject({
      revisionCount: 2,
      revision: { revisionNumber: 2, content: "Updated content" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people/person-1/blog",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          title: "Updated story",
          excerpt: "An excerpt",
          content: "Updated content",
        }),
      }),
    );
  });
});
