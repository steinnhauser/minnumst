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

type ApiPerson = {
  id: string;
  name: string;
  slug: string;
  blog: {
    title: string;
    excerpt: string;
    saved_at: string;
    revision_count: number;
  } | null;
};

type ApiRevision = {
  id: string;
  revision_number: number;
  saved_at: string;
  title: string;
  excerpt: string;
  content: string;
};

type ApiPersonPage = {
  items: ApiPerson[];
  total: number;
  offset: number;
  limit: number;
};

type ApiBlogResponse = {
  revision_count: number;
  current_revision: ApiRevision;
};

const apiBaseUrl = (appConfig.apiUrl || "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": crypto.randomUUID(),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      "Could not reach the Minnumst API. Check that it is running.",
    );
  }

  if (!response.ok) {
    let message = `The Minnumst API returned ${response.status}.`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // Keep the status-based message when the API response is not JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

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
