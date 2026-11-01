import {
  createRequest,
  type ApiError,
  type components,
} from "@minnumst/api-client";
import { appConfig } from "./config";

export type Revision = {
  id: string;
  revisionNumber: number;
  savedAt: string;
  title: string;
  excerpt: string;
  content: string;
  createdBy: string;
  changeNote: string | null;
  restoredFrom: number | null;
};

export type PersonPage = {
  id: string;
  personName: string;
  slug: string;
  birthDate: string;
  deathDate: string;
  story: {
    title: string;
    excerpt: string;
    savedAt: string;
    revisionCount: number;
  } | null;
  revisions: Revision[];
};

export type StoryInput = {
  title: string;
  excerpt: string;
  content: string;
};

// Generated from api/openapi.json (`make openapi`); never edit these by hand.
type Schemas = components["schemas"];
type ApiPerson = Schemas["PersonResponse"];
type ApiRevision = Schemas["StoryRevisionDetail"];
type ApiPersonPage = Schemas["PersonPage"];
type ApiEditedStory = Schemas["EditedStoryResponse"];
type ApiSuggestionPage = Schemas["SuggestionPage"];
export type Suggestion = Schemas["SuggestionResponse"];

// The admin and the API are on different hostnames; "include" sends the
// Authentik session cookie that authorises writes.
const request = createRequest({
  baseUrl: appConfig.apiUrl,
  credentials: "include",
  // An expired login looks like this too: the browser blocks the redirect to it.
  unreachableMessage:
    "Could not reach the archive. If you have been away for a while, reload the page to sign in again.",
});

function mapPerson(person: ApiPerson): PersonPage {
  return {
    id: person.id,
    personName: person.name,
    slug: person.slug,
    birthDate: person.birth_date ?? "",
    deathDate: person.death_date ?? "",
    story: person.story
      ? {
          title: person.story.title,
          excerpt: person.story.excerpt,
          savedAt: person.story.saved_at,
          revisionCount: person.story.revision_count,
        }
      : null,
    revisions: [],
  };
}

function mapRevision(revision: ApiRevision): Revision {
  return {
    id: revision.id,
    revisionNumber: revision.revision_number,
    savedAt: revision.saved_at,
    title: revision.title,
    excerpt: revision.excerpt,
    content: revision.content,
    createdBy: revision.created_by,
    changeNote: revision.change_note,
    restoredFrom: revision.restored_from,
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

// Letters folded as the API folds names, so the desk's filter finds Sólveig
// from "solveig" and Þóra from "thora".
export function foldName(name: string): string {
  return name
    .toLocaleLowerCase("is")
    .replaceAll("þ", "th")
    .replaceAll("ð", "d")
    .replaceAll("æ", "ae")
    .replaceAll("ø", "o")
    .replaceAll("ß", "ss")
    .normalize("NFKD")
    .replace(/\p{Mn}/gu, "");
}

export function currentRevision(page: PersonPage) {
  return page.revisions.at(-1);
}

export async function loadPeople(): Promise<PersonPage[]> {
  const people: PersonPage[] = [];
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

function personBody(name: string, birthDate: string, deathDate: string) {
  return JSON.stringify({
    name: name.trim().replace(/\s+/g, " "),
    birth_date: birthDate.trim() || null,
    death_date: deathDate.trim() || null,
  });
}

export async function createPerson(
  name: string,
  birthDate: string,
  deathDate = "",
): Promise<PersonPage> {
  const person = await request<ApiPerson>("/api/people", {
    method: "POST",
    body: personBody(name, birthDate, deathDate),
  });
  return mapPerson(person);
}

export async function updatePerson(
  personId: string,
  name: string,
  birthDate: string,
  deathDate = "",
): Promise<PersonPage> {
  const person = await request<ApiPerson>(
    `/api/people/${encodeURIComponent(personId)}`,
    { method: "PATCH", body: personBody(name, birthDate, deathDate) },
  );
  return mapPerson(person);
}

export async function loadPersonRevisions(
  personId: string,
): Promise<Revision[]> {
  const revisions = await request<ApiRevision[]>(
    `/api/admin/people/${encodeURIComponent(personId)}/story/revisions`,
  );
  return revisions
    .map(mapRevision)
    .sort((a, b) => a.revisionNumber - b.revisionNumber);
}

// `baseRevision` is the version the edit started from (0 for no story yet): if
// the story has moved on since, the API refuses the save with 409.
export async function savePersonRevision(
  personId: string,
  input: StoryInput,
  baseRevision: number,
  changeNote = "",
): Promise<{ revision: Revision; revisionCount: number }> {
  const story = await request<ApiEditedStory>(
    `/api/people/${encodeURIComponent(personId)}/story`,
    {
      method: "PUT",
      body: JSON.stringify({
        title: input.title.trim(),
        excerpt: input.excerpt.trim(),
        content: input.content.trim(),
        change_note: changeNote.trim() || null,
        base_revision_number: baseRevision,
      }),
    },
  );
  return {
    revision: mapRevision(story.current_revision),
    revisionCount: story.revision_count,
  };
}

// Publishes an earlier version's text as a new version.
export async function restoreRevision(
  personId: string,
  revisionNumber: number,
  baseRevision: number,
): Promise<Revision> {
  const story = await request<ApiEditedStory>(
    `/api/admin/people/${encodeURIComponent(personId)}/story/revisions/${revisionNumber}/restore`,
    {
      method: "POST",
      body: JSON.stringify({ base_revision_number: baseRevision }),
    },
  );
  return mapRevision(story.current_revision);
}

// Oldest first, up to a page's worth; `total` counts everything waiting.
export function loadSuggestions(): Promise<ApiSuggestionPage> {
  return request<ApiSuggestionPage>("/api/admin/suggestions?limit=100");
}

// An edit carries the text to publish and the version the editor compared it with.
export function acceptSuggestion(
  suggestionId: string,
  story?: StoryInput & { base_revision_number: number },
): Promise<Suggestion> {
  return request<Suggestion>(
    `/api/admin/suggestions/${encodeURIComponent(suggestionId)}/accept`,
    { method: "POST", body: JSON.stringify(story ? { story } : {}) },
  );
}

export function rejectSuggestion(suggestionId: string): Promise<Suggestion> {
  return request<Suggestion>(
    `/api/admin/suggestions/${encodeURIComponent(suggestionId)}/reject`,
    { method: "POST" },
  );
}

export async function loadHiddenPeople(): Promise<PersonPage[]> {
  const people = await request<ApiPerson[]>("/api/admin/people/hidden");
  return people.map(mapPerson);
}

export async function setPersonHidden(
  personId: string,
  hidden: boolean,
): Promise<PersonPage> {
  const person = await request<ApiPerson>(
    `/api/admin/people/${encodeURIComponent(personId)}/visibility`,
    { method: "PUT", body: JSON.stringify({ hidden }) },
  );
  return mapPerson(person);
}
