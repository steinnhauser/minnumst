import type { ApiError } from "@minnumst/api-client";
import { beforeAll, describe, expect, it } from "vitest";
import type * as Api from "./api";

// Contract tests: the real client in src/api.ts against a running, seeded API
// (`make contract`, part of `make stack-test`). Skipped unless MINNUMST_API_URL
// is set, so `make test` never needs a server. Read-only: the stack is shared
// with the other stack tests, so these only search and read.
const apiUrl = process.env.MINNUMST_API_URL?.trim();

// People added by tools/scripts/seed_local_db.py.
const samplePeople = [
  "Sample Person - Alex Morgan",
  "Sample Person - Casey River",
];
const solveig = "Sólveig Þorgrímsdóttir";

// One entry per required field of each generated schema; `satisfies` fails
// type-checking when the spec gains or loses a required field.
type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];
type FieldTypes<T> = Record<RequiredKeys<T>, "string" | "number" | "object">;

const personFields = {
  id: "string",
  name: "string",
  slug: "string",
  created_at: "string",
  updated_at: "string",
} satisfies FieldTypes<Api.Person>;
const blogSummaryFields = {
  title: "string",
  excerpt: "string",
  saved_at: "string",
  revision_count: "number",
} satisfies FieldTypes<Api.BlogSummary>;
const revisionFields = {
  id: "string",
  revision_number: "number",
  saved_at: "string",
  title: "string",
  excerpt: "string",
  content: "string",
} satisfies FieldTypes<Api.BlogRevision>;
const pageFields = {
  items: "object",
  total: "number",
  offset: "number",
  limit: "number",
} satisfies FieldTypes<Awaited<ReturnType<typeof Api.searchPeople>>>;

function expectFields(value: unknown, fields: Record<string, string>) {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  for (const [key, type] of Object.entries(fields)) {
    expect(value, key).toHaveProperty(key);
    expect(typeof (value as Record<string, unknown>)[key], key).toBe(type);
  }
}

function expectBlog(blog: unknown, fields: Record<string, string>) {
  if (blog !== null && blog !== undefined) expectFields(blog, fields);
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  return promise.then(
    () => expect.fail("expected the API to reject the request"),
    (error: ApiError) => error,
  );
}

describe.skipIf(!apiUrl)("public API contract", () => {
  let api: typeof Api;

  beforeAll(async () => {
    // The same runtime configuration a container writes to runtime-config.js.
    Object.defineProperty(window, "__MINNUMST_ENV__", {
      configurable: true,
      value: { VITE_API_URL: apiUrl },
    });
    api = await import("./api");
  });

  it("returns people pages and profiles in the generated shapes", async () => {
    const page = await api.searchPeople("Sample Person");
    expectFields(page, pageFields);
    expect(page).toMatchObject({ offset: 0, limit: 50 });
    expect(page.items.map((person) => person.name)).toEqual(samplePeople);
    for (const person of page.items) {
      expectFields(person, personFields);
      expectBlog(person.blog, blogSummaryFields);
    }

    const profile = await api.getPersonBySlug(page.items[0].slug);
    expectFields(profile, personFields);
    expect(profile).toMatchObject({
      id: page.items[0].id,
      name: samplePeople[0],
    });
    expectBlog(profile.blog, blogSummaryFields);
    expectFields(profile.current_blog, revisionFields);
  });

  it("returns an empty page for a query that matches nobody", async () => {
    const page = await api.searchPeople("zzqx no such ancestor 7f3a");
    expect(page).toEqual({ items: [], total: 0, offset: 0, limit: 50 });
  });

  it("surfaces the API's 404 message for an unknown slug", async () => {
    const error = await failure(api.getPersonBySlug("no-such-person-7f3a"));
    expect(error.message).toBe("Person not found");
    expect(error.status).toBe(404);
    expect(error.requestId).toBeTruthy();
  });

  it("finds non-ASCII names whatever the accents and case", async () => {
    const ids = new Set<string>();
    for (const query of ["Sólveig", "solveig", "Þorgríms", "THORGRIMSDOTTIR"]) {
      const page = await api.searchPeople(query);
      const match = page.items.find((person) => person.name === solveig);
      expect(match, query).toBeDefined();
      ids.add(match!.id);
    }
    expect(ids.size).toBe(1);

    const [match] = (await api.searchPeople(solveig)).items;
    const profile = await api.getPersonBySlug(match.slug);
    expect(profile.name).toBe(solveig);
    expect(profile.slug).toMatch(/^solveig-thorgrimsdottir(-\d+)?$/);
  });

  it("pages with limit and offset while counting every match", async () => {
    const first = await api.searchPeople("Sample Person", 1);
    expect(first).toMatchObject({ total: 2, offset: 0, limit: 1 });
    expect(first.items.map((person) => person.name)).toEqual([samplePeople[0]]);

    const second = await api.searchPeople("Sample Person", 1, 1);
    expect(second).toMatchObject({ total: 2, offset: 1, limit: 1 });
    expect(second.items.map((person) => person.name)).toEqual([
      samplePeople[1],
    ]);

    const beyond = await api.searchPeople("Sample Person", 1, 2);
    expect(beyond).toMatchObject({ items: [], total: 2, offset: 2 });

    const largest = await api.searchPeople("Sample Person", 100);
    expect(largest).toMatchObject({ total: 2, limit: 100 });
  });

  it("rejects a limit outside 1 to 100 with the validation message", async () => {
    const tooMany = await failure(api.searchPeople("Sample Person", 101));
    expect(tooMany.status).toBe(422);
    expect(tooMany.message).toBe("Input should be less than or equal to 100");

    const none = await failure(api.searchPeople("Sample Person", 0));
    expect(none.status).toBe(422);
    expect(none.message).toBe("Input should be greater than or equal to 1");
  });
});
