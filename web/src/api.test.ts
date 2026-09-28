import { afterEach, describe, expect, it, vi } from "vitest";
import { getPersonBySlug, searchPeople } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("public API client", () => {
  it("searches people using the API paging contract", async () => {
    const response = { items: [], total: 0, offset: 0, limit: 50 };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchPeople("asta jonsdottir")).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people?query=asta+jonsdottir&offset=0&limit=50",
    );
  });

  it("loads a public person and current blog by slug", async () => {
    const person = { id: "1", name: "Ásta", slug: "asta", current_blog: null };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(person));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPersonBySlug("asta/jonsdottir")).resolves.toEqual(person);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people/by-slug/asta%2Fjonsdottir",
    );
  });

  it("surfaces an API validation message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: "Person not found" }, { status: 404 }),
        ),
    );

    await expect(getPersonBySlug("missing")).rejects.toThrow(
      "Person not found",
    );
  });
});
