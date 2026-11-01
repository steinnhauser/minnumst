import type { components } from "@minnumst/api-client";

// Mocked API responses, typed against the contract generated from
// api/openapi.json, so a fixture can't describe a shape the API doesn't return.
type Schemas = components["schemas"];
export type ApiPerson = Schemas["PersonResponse"];
export type ApiRevision = Schemas["BlogRevisionResponse"];
export type ErrorResponse = Schemas["ErrorResponse"];
export type ValidationErrorResponse = Schemas["HTTPValidationError"];

const timestamp = "2026-09-28T12:00:00Z";

export function apiPerson(
  fields: Pick<ApiPerson, "id" | "name" | "slug"> & Partial<ApiPerson>,
): ApiPerson {
  return {
    blog: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...fields,
  };
}

export function apiRevision(
  revisionNumber: number,
  fields: Partial<ApiRevision> = {},
): ApiRevision {
  return {
    id: `revision-${revisionNumber}`,
    revision_number: revisionNumber,
    saved_at: timestamp,
    title: `Revision ${revisionNumber}`,
    excerpt: "",
    content: `Version ${revisionNumber}`,
    ...fields,
  };
}

// The summary the people list carries for a person whose latest revision is
// `revision`.
export function blogSummary(revision: ApiRevision): Schemas["BlogSummary"] {
  return {
    title: revision.title,
    excerpt: revision.excerpt,
    saved_at: revision.saved_at,
    revision_count: revision.revision_number,
  };
}

export function peoplePage(
  items: readonly ApiPerson[],
  fields: Partial<Schemas["PersonPage"]> = {},
): Schemas["PersonPage"] {
  return { items, total: items.length, offset: 0, limit: 100, ...fields };
}

export function blogResponse(
  personId: string,
  revision: ApiRevision,
): Schemas["BlogResponse"] {
  return {
    id: `blog-${personId}`,
    person_id: personId,
    revision_count: revision.revision_number,
    current_revision: revision,
  };
}

export function apiSuggestion(
  fields: Partial<Schemas["SuggestionResponse"]> = {},
): Schemas["SuggestionResponse"] {
  return {
    id: "suggestion-1",
    person_id: "person-1",
    person_name: "Ada Lovelace",
    person_slug: "ada-lovelace",
    kind: "edit",
    status: "pending",
    base_revision_number: null,
    current_revision: null,
    title: "A proposed title",
    excerpt: "",
    content: "A proposed story.",
    note: null,
    source_url: null,
    created_at: timestamp,
    reviewed_at: null,
    reviewed_by: null,
    ...fields,
  };
}

export function suggestionPage(
  items: readonly Schemas["SuggestionResponse"][],
): Schemas["SuggestionPage"] {
  return { items, total: items.length, offset: 0, limit: 100 };
}

type ApiBody =
  | Schemas["PersonPage"]
  | ApiPerson
  | readonly ApiRevision[]
  | Schemas["BlogResponse"]
  | Schemas["SuggestionPage"]
  | Schemas["SuggestionResponse"]
  | readonly ApiPerson[]
  | ErrorResponse
  | ValidationErrorResponse;

export function apiResponse(body: ApiBody, init?: ResponseInit): Response {
  return Response.json(body, init);
}
