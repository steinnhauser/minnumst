import { createRequest, type components } from "@minnumst/api-client";

// Generated from api/openapi.json (`make openapi`); never edit these by hand.
type Schemas = components["schemas"];
export type BlogSummary = Schemas["BlogSummary"];
export type BlogRevision = Schemas["BlogRevisionResponse"];
export type Person = Schemas["PersonResponse"];
export type PersonDetail = Schemas["PersonDetail"];
type PersonPage = Schemas["PersonPage"];

const apiBaseUrl =
  window.__MINNUMST_ENV__?.VITE_API_URL?.trim() ||
  import.meta.env.VITE_API_URL?.trim() ||
  "http://127.0.0.1:8000";

const request = createRequest({ baseUrl: apiBaseUrl });

// The API accepts `limit` from 1 to 100 and any `offset` from 0; `total`
// counts every match, so a caller can page through all of them.
export function searchPeople(
  query: string,
  limit = 50,
  offset = 0,
): Promise<PersonPage> {
  const params = new URLSearchParams({
    query,
    offset: String(offset),
    limit: String(limit),
  });
  return request<PersonPage>(`/api/people?${params.toString()}`);
}

export function getPersonBySlug(slug: string): Promise<PersonDetail> {
  return request<PersonDetail>(
    `/api/people/by-slug/${encodeURIComponent(slug)}`,
  );
}
