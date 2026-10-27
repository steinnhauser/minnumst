import type { components } from "@minnumst/api-client";

// API responses for tests. Each one `satisfies` a schema generated from
// api/openapi.json, so a fixture can't describe a shape the API doesn't return.
type Schemas = components["schemas"];
export type PersonResponse = Schemas["PersonResponse"];
export type PersonDetail = Schemas["PersonDetail"];
export type PersonPage = Schemas["PersonPage"];
export type ErrorResponse = Schemas["ErrorResponse"];

export const ada = {
  id: "person-1",
  name: "Ada Lovelace",
  slug: "ada-lovelace",
  created_at: "2026-09-28T10:00:00Z",
  updated_at: "2026-09-28T10:00:00Z",
  blog: null,
} satisfies PersonResponse;

export const adaProfile = {
  ...ada,
  current_blog: {
    id: "revision-1",
    revision_number: 1,
    saved_at: "2026-09-28T10:00:00Z",
    title: "A life in letters",
    excerpt: "",
    content: "A story about Ada.",
  },
} satisfies PersonDetail;

export function pageOf(
  items: readonly PersonResponse[],
  limit = 50,
  offset = 0,
  total = items.length,
): PersonPage {
  return { items, total, offset, limit };
}

// `count` distinct people, for paging through more than one result page.
export function peopleNamed(count: number): PersonResponse[] {
  return Array.from({ length: count }, (_, index) => ({
    ...ada,
    id: `person-${index + 1}`,
    name: `Person ${index + 1}`,
    slug: `person-${index + 1}`,
  }));
}
