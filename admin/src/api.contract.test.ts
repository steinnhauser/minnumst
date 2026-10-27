import type { ApiError } from "@minnumst/api-client";
import { beforeAll, describe, expect, it } from "vitest";
import type * as Api from "./api";

// Contract tests: the desk's real client in src/api.ts against a running API
// (`make contract`, part of `make stack-test`). Skipped unless MINNUMST_API_URL
// is set, so `make test` never needs a server. The stack is shared with the
// other stack tests, so every person created here has a name starting with
// "Contract test " plus a per-run ID; a person with a story can't be deleted
// through the API, so `make contract` removes them afterwards
// (tools/scripts/e2e_api.py cleanup-contract).
const apiUrl = process.env.MINNUMST_API_URL?.trim();
const run = `Contract test ${crypto.randomUUID().slice(0, 8)}`;
const unknownId = "00000000-0000-0000-0000-000000000000";
const requestId = /^[0-9a-f-]{36}$/;
const conflict = "A person with this normalized name already exists";

// One entry per required field of each client type; `satisfies` fails
// type-checking when a type gains or loses a required field. The client maps
// the generated API schemas onto these types, so a missing or mistyped API
// field shows up here as a wrong runtime type.
type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];
type FieldTypes<T> = Record<RequiredKeys<T>, "string" | "number" | "object">;

const personFields = {
  id: "string",
  personName: "string",
  slug: "string",
  blog: "object",
  revisions: "object",
} satisfies FieldTypes<Api.PersonPost>;
const blogSummaryFields = {
  title: "string",
  excerpt: "string",
  savedAt: "string",
  revisionCount: "number",
} satisfies FieldTypes<NonNullable<Api.PersonPost["blog"]>>;
const revisionFields = {
  id: "string",
  revisionNumber: "number",
  savedAt: "string",
  title: "string",
  excerpt: "string",
  content: "string",
} satisfies FieldTypes<Api.PostRevision>;

function expectFields(value: unknown, fields: Record<string, string>) {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  for (const [key, type] of Object.entries(fields)) {
    expect(value, key).toHaveProperty(key);
    expect(typeof (value as Record<string, unknown>)[key], key).toBe(type);
  }
}

function expectPerson(person: Api.PersonPost) {
  expectFields(person, personFields);
  if (person.blog !== null) expectFields(person.blog, blogSummaryFields);
}

// PostgreSQL returns saved timestamps in UTC with a zone; SQLite (a local
// `make dev-api`) drops the zone once a row is read back, so a revision read
// from the history can lack the "Z" its save response had. Compare instants.
function instant(timestamp: string) {
  const zoned = /(Z|[+-]\d\d:\d\d)$/.test(timestamp);
  return Date.parse(zoned ? timestamp : `${timestamp}Z`);
}

function expectRevision(revision: Api.PostRevision) {
  expectFields(revision, revisionFields);
  expect(Number.isNaN(instant(revision.savedAt))).toBe(false);
}

function expectSameRevision(
  actual: Api.PostRevision | undefined,
  expected: Api.PostRevision,
) {
  const { savedAt, ...rest } = expected;
  expect(actual).toMatchObject(rest);
  expect(instant(actual!.savedAt)).toBe(instant(savedAt));
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  return promise.then(
    () => expect.fail("expected the API to reject the request"),
    (error: ApiError) => error,
  );
}

async function expectError(
  promise: Promise<unknown>,
  status: number,
  message: string,
) {
  const error = await failure(promise);
  expect(error.status).toBe(status);
  expect(error.message).toBe(message);
  expect(error.requestId).toMatch(requestId);
}

const story = (n: number): Api.PostInput => ({
  title: `Revision ${n}`,
  excerpt: `Excerpt ${n}`,
  content: `## Part ${n}\n\nStory body ${n}.`,
});

describe.skipIf(!apiUrl)("editorial API contract", () => {
  let api: typeof Api;

  beforeAll(async () => {
    // The same runtime configuration a container writes to runtime-config.js.
    Object.defineProperty(window, "__MINNUMST_ENV__", {
      configurable: true,
      value: { VITE_API_URL: apiUrl },
    });
    api = await import("./api");
  });

  it("creates and renames people, normalising names and keeping the slug", async () => {
    const created = await api.createPerson(`  ${run}   Ödön   Á  `);
    expectPerson(created);
    expect(created).toMatchObject({
      personName: `${run} Ödön Á`,
      blog: null,
      revisions: [],
    });
    expect(created.slug).toMatch(/^contract-test-[0-9a-f]{8}-odon-a(-\d+)?$/);

    const renamed = await api.updatePersonName(created.id, `${run} Ödön Bé`);
    expectPerson(renamed);
    expect(renamed).toMatchObject({
      id: created.id,
      personName: `${run} Ödön Bé`,
      slug: created.slug,
    });

    // Renaming to the same name with other accents and case is no conflict.
    const recased = await api.updatePersonName(
      created.id,
      `${run.toUpperCase()} ODON BE`,
    );
    expect(recased.personName).toBe(`${run.toUpperCase()} ODON BE`);

    const listed = (await api.loadPeople()).find(
      (person) => person.id === created.id,
    );
    expect(listed).toBeDefined();
    expectPerson(listed!);
    expect(listed!.personName).toBe(recased.personName);
  });

  it("rejects names that differ only in accents, case or spacing with 409", async () => {
    const first = await api.createPerson(`${run} Ödön X`);
    await expectError(
      api.createPerson(`${run.toLowerCase()}  odon x`),
      409,
      conflict,
    );

    const second = await api.createPerson(`${run} Ödön Y`);
    await expectError(
      api.updatePersonName(second.id, `${run.toLowerCase()} ODON X`),
      409,
      conflict,
    );

    const matches = (await api.loadPeople()).filter((person) =>
      [first.id, second.id].includes(person.id),
    );
    expect(matches.map((person) => person.personName).sort()).toEqual([
      `${run} Ödön X`,
      `${run} Ödön Y`,
    ]);
  });

  it("appends revisions and never changes earlier ones", async () => {
    const person = await api.createPerson(`${run} Story`);

    const first = await api.savePersonRevision(person.id, story(1));
    expectRevision(first.revision);
    expect(first).toMatchObject({
      revisionCount: 1,
      revision: { revisionNumber: 1, ...story(1) },
    });

    // The client trims what it sends; the stored revision has no padding.
    const second = await api.savePersonRevision(person.id, {
      title: `  ${story(2).title}  `,
      excerpt: story(2).excerpt,
      content: `\n${story(2).content}\n`,
    });
    expect(second).toMatchObject({
      revisionCount: 2,
      revision: { revisionNumber: 2, ...story(2) },
    });
    expect(second.revision.id).not.toBe(first.revision.id);

    const history = await api.loadPersonRevisions(person.id);
    history.forEach(expectRevision);
    expect(history.map((revision) => revision.revisionNumber)).toEqual([1, 2]);
    expectSameRevision(history[0], first.revision);
    expectSameRevision(history[1], second.revision);
    expectSameRevision(
      api.currentRevision({ ...person, revisions: history }),
      second.revision,
    );

    const listed = (await api.loadPeople()).find(
      (candidate) => candidate.id === person.id,
    );
    expect(listed!.blog).toMatchObject({
      title: story(2).title,
      excerpt: story(2).excerpt,
      revisionCount: 2,
    });
    expect(instant(listed!.blog!.savedAt)).toBe(
      instant(second.revision.savedAt),
    );
  });

  it("surfaces the validation message for blank names and titles", async () => {
    const blank = "String should have at least 1 character";
    await expectError(api.createPerson("   "), 422, blank);

    const person = await api.createPerson(`${run} Validation`);
    await expectError(api.updatePersonName(person.id, " \t "), 422, blank);
    await expectError(
      api.savePersonRevision(person.id, { ...story(1), title: "   " }),
      422,
      blank,
    );
    await expectError(
      api.loadPersonRevisions(person.id),
      404,
      "Blog not found",
    );
  });

  it("returns 404 with a request ID for unknown people", async () => {
    const notFound = "Person not found";
    await expectError(
      api.updatePersonName(unknownId, `${run} Nobody`),
      404,
      notFound,
    );
    await expectError(
      api.savePersonRevision(unknownId, story(1)),
      404,
      notFound,
    );
    await expectError(api.loadPersonRevisions(unknownId), 404, notFound);
  });

  it("shows the request ID in the editor's error message", async () => {
    const error = await failure(api.loadPersonRevisions(unknownId));
    expect(api.errorMessage(error, "fallback")).toBe(
      `Person not found (request ID: ${error.requestId})`,
    );
  });
});
