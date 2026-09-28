import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPerson,
  loadPeople,
  loadPersonRevisions,
  savePersonRevision,
} from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("admin API client", () => {
  it("loads people using the shared paginated people endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        items: [
          {
            id: "person-1",
            name: "Ásta Jónsdóttir",
            slug: "asta-jonsdottir",
            blog: null,
          },
        ],
        total: 1,
        offset: 0,
        limit: 100,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadPeople()).resolves.toMatchObject([
      {
        id: "person-1",
        personName: "Ásta Jónsdóttir",
        slug: "asta-jonsdottir",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people?offset=0&limit=100",
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("creates a person through the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: "person-1",
        name: "Ada Lovelace",
        slug: "ada-lovelace",
        blog: null,
      }),
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

  it("loads revisions in chronological order for the editor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json([
        {
          id: "revision-2",
          revision_number: 2,
          saved_at: "2026-09-28T11:00:00Z",
          title: "Second",
          excerpt: "",
          content: "Second version",
        },
        {
          id: "revision-1",
          revision_number: 1,
          saved_at: "2026-09-28T10:00:00Z",
          title: "First",
          excerpt: "",
          content: "First version",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadPersonRevisions("person-1")).resolves.toMatchObject([
      { revisionNumber: 1, content: "First version" },
      { revisionNumber: 2, content: "Second version" },
    ]);
  });

  it("saves a revision using the API's append-only blog endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        revision_count: 2,
        current_revision: {
          id: "revision-2",
          revision_number: 2,
          saved_at: "2026-09-28T11:00:00Z",
          title: "Updated story",
          excerpt: "An excerpt",
          content: "Updated content",
        },
      }),
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
