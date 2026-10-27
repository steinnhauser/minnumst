import {
  createRequest,
  type ApiError,
  type components,
} from "@minnumst/api-client";
import { appConfig } from "./config";

export type PostRevision = {
  id: string;
  revisionNumber: number;
  savedAt: string;
  title: string;
  excerpt: string;
  content: string;
};

export type PersonPost = {
  id: string;
  personName: string;
  slug: string;
  blog: {
    title: string;
    excerpt: string;
    savedAt: string;
    revisionCount: number;
  } | null;
  revisions: PostRevision[];
};

export type PostInput = {
  title: string;
  excerpt: string;
  content: string;
};

// Generated from api/openapi.json (`make openapi`); never edit these by hand.
type Schemas = components["schemas"];
type ApiPerson = Schemas["PersonResponse"];
type ApiRevision = Schemas["BlogRevisionResponse"];
type ApiPersonPage = Schemas["PersonPage"];
type ApiBlogResponse = Schemas["BlogResponse"];

// The admin and the API are on different hostnames; "include" sends the
// Authentik session cookie that authorises writes.
const request = createRequest({
  baseUrl: appConfig.apiUrl,
  credentials: "include",
});

function mapPerson(person: ApiPerson): PersonPost {
  return {
    id: person.id,
    personName: person.name,
    slug: person.slug,
    blog: person.blog
      ? {
          title: person.blog.title,
          excerpt: person.blog.excerpt,
          savedAt: person.blog.saved_at,
          revisionCount: person.blog.revision_count,
        }
      : null,
    revisions: [],
  };
}

function mapRevision(revision: ApiRevision): PostRevision {
  return {
    id: revision.id,
    revisionNumber: revision.revision_number,
    savedAt: revision.saved_at,
    title: revision.title,
    excerpt: revision.excerpt,
    content: revision.content,
  };
}

// The API's reason for a failure, with the request ID it logged, so an editor
// can report an error that matches a log line. Errors that aren't from the API
// client carry no request ID, and anything that isn't an Error gets `fallback`.
export function errorMessage(
  error: unknown,
  fallback: string,
  rewrite: (message: string) => string = (message) => message,
): string {
  if (!(error instanceof Error)) return fallback;
  const message = rewrite(error.message);
  const { requestId } = error as Partial<ApiError>;
  return requestId ? `${message} (request ID: ${requestId})` : message;
}

export function currentRevision(post: PersonPost) {
  return post.revisions.at(-1);
}

export async function loadPeople(): Promise<PersonPost[]> {
  const people: PersonPost[] = [];
  const limit = 100;
  let offset = 0;

  for (;;) {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });
    const page = await request<ApiPersonPage>(
      `/api/people?${params.toString()}`,
    );
    people.push(...page.items.map(mapPerson));
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) return people;
  }
}

export async function createPerson(name: string): Promise<PersonPost> {
  const person = await request<ApiPerson>("/api/people", {
    method: "POST",
    body: JSON.stringify({ name: name.trim().replace(/\s+/g, " ") }),
  });
  return mapPerson(person);
}

export async function updatePersonName(
  personId: string,
  name: string,
): Promise<PersonPost> {
  const person = await request<ApiPerson>(
    `/api/people/${encodeURIComponent(personId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim().replace(/\s+/g, " ") }),
    },
  );
  return mapPerson(person);
}

export async function loadPersonRevisions(
  personId: string,
): Promise<PostRevision[]> {
  const revisions = await request<ApiRevision[]>(
    `/api/people/${encodeURIComponent(personId)}/blog/revisions`,
  );
  return revisions
    .map(mapRevision)
    .sort((a, b) => a.revisionNumber - b.revisionNumber);
}

export async function savePersonRevision(
  personId: string,
  input: PostInput,
): Promise<{ revision: PostRevision; revisionCount: number }> {
  const blog = await request<ApiBlogResponse>(
    `/api/people/${encodeURIComponent(personId)}/blog`,
    {
      method: "PUT",
      body: JSON.stringify({
        title: input.title.trim(),
        excerpt: input.excerpt.trim(),
        content: input.content.trim(),
      }),
    },
  );
  return {
    revision: mapRevision(blog.current_revision),
    revisionCount: blog.revision_count,
  };
}
