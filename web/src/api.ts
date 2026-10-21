export type BlogSummary = {
  title: string;
  excerpt: string;
  saved_at: string;
  revision_count: number;
};

export type BlogRevision = {
  id: string;
  revision_number: number;
  saved_at: string;
  title: string;
  excerpt: string;
  content: string;
};

export type Person = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  blog: BlogSummary | null;
};

export type PersonDetail = Person & {
  current_blog: BlogRevision | null;
};

type PersonPage = {
  items: Person[];
  total: number;
  offset: number;
  limit: number;
};

const apiBaseUrl = (
  window.__EFTIRMAL_ENV__?.VITE_API_URL?.trim() ||
  import.meta.env.VITE_API_URL?.trim() ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { "X-Request-ID": crypto.randomUUID() },
    });
  } catch {
    throw new Error(
      "Could not reach the Eftirmal API. Check that it is running.",
    );
  }

  if (!response.ok) {
    let message = `The Eftirmal API returned ${response.status}.`;
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

export function searchPeople(query: string, limit = 50): Promise<PersonPage> {
  const params = new URLSearchParams({
    query,
    offset: "0",
    limit: String(limit),
  });
  return request<PersonPage>(`/api/people?${params.toString()}`);
}

export function getPersonBySlug(slug: string): Promise<PersonDetail> {
  return request<PersonDetail>(
    `/api/people/by-slug/${encodeURIComponent(slug)}`,
  );
}
