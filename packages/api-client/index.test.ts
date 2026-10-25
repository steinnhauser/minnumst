import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequest, type ApiError } from "./index";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockImplementation(async () => response.clone());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createRequest", () => {
  it("sends a request ID, and JSON headers only with a body", async () => {
    const fetchMock = stubFetch(Response.json({ ok: true }));
    const request = createRequest({ baseUrl: "https://api.example.org/" });

    await request("/api/people");
    await request("/api/people", { method: "POST", body: "{}" });

    const [readUrl, read] = fetchMock.mock.calls[0];
    const [, write] = fetchMock.mock.calls[1];
    expect(readUrl).toBe("https://api.example.org/api/people");
    expect(read.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
    expect(read.headers.has("Content-Type")).toBe(false);
    expect(write.headers.get("Content-Type")).toBe("application/json");
    expect(read.credentials).toBe("same-origin");
  });

  it("includes credentials when asked, for the cross-origin admin API", async () => {
    const fetchMock = stubFetch(Response.json({}));
    await createRequest({ baseUrl: "https://api", credentials: "include" })(
      "/x",
    );
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("surfaces the API's message, status and request ID", async () => {
    stubFetch(
      Response.json(
        { detail: "Person not found" },
        { status: 404, headers: { "X-Request-ID": "req-123" } },
      ),
    );
    const error = (await createRequest({ baseUrl: "https://api" })(
      "/api/people/1",
    ).catch((caught) => caught)) as ApiError;

    expect(error.message).toBe("Person not found");
    expect(error.status).toBe(404);
    expect(error.requestId).toBe("req-123");
  });

  it("shows the first validation problem instead of a bare 422", async () => {
    stubFetch(
      Response.json(
        { detail: [{ msg: "String should have at most 255 characters" }] },
        { status: 422 },
      ),
    );
    await expect(
      createRequest({ baseUrl: "https://api" })("/api/people?query=x"),
    ).rejects.toThrow("String should have at most 255 characters");
  });

  it("returns nothing for 204 responses", async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(
      createRequest({ baseUrl: "https://api" })("/x", { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });
});
