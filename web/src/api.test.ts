import { afterEach, describe, expect, it, vi } from "vitest";
import { getPersonBySlug, searchPeople } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  Reflect.deleteProperty(window, "__EFTIRMAL_ENV__");
});

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

  it("uses the API origin injected at container startup", async () => {
    Object.defineProperty(window, "__EFTIRMAL_ENV__", {
      configurable: true,
      value: { VITE_API_URL: "https://runtime.example.test" },
    });
    vi.resetModules();
    const { searchPeople: searchWithRuntimeConfig } = await import("./api");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ items: [], total: 0, offset: 0, limit: 50 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await searchWithRuntimeConfig("ada");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://runtime.example.test/api/people?query=ada&offset=0&limit=50",
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

  it("allows the autocomplete to request a bounded result page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ items: [], total: 0, offset: 0, limit: 8 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await searchPeople("ada", 8);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/people?query=ada&offset=0&limit=8",
    );
  });
});
