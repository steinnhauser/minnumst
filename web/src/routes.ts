import { createContext, useContext } from "react";
import { inLanguage, withoutLanguage, type Language } from "./i18n";

// The pages, read from the address: a shared link opens the same page, and the back
// and forward buttons work. Profiles live at /people/<slug>. Slugs are permanent: a
// rename keeps the slug, so links and bookmarks keep working.
export type Route =
  | { view: "home" }
  | { view: "search"; query: string; page: number }
  | { view: "profile"; slug: string };

const PROFILE_PATH = /^\/people\/([^/]+)\/?$/;
const SEARCH_PATH = /^\/search\/?$/;
const MAX_PAGE = 1_000_000;

// The API refuses shorter searches; asking here saves the trip and explains why.
export const MIN_SEARCH_LETTERS = 3;

export function isLongEnough(query: string): boolean {
  return (query.match(/[\p{L}\p{N}]/gu) ?? []).length >= MIN_SEARCH_LETTERS;
}

function pageNumber(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1;
}

export function parseRoute(pathname: string, search: string): Route {
  const path = withoutLanguage(pathname);
  if (SEARCH_PATH.test(path)) {
    const params = new URLSearchParams(search);
    return {
      view: "search",
      query: (params.get("q") ?? "").trim(),
      page: pageNumber(params.get("page")),
    };
  }
  const match = PROFILE_PATH.exec(path);
  if (!match) return { view: "home" };
  try {
    return { view: "profile", slug: decodeURIComponent(match[1]) };
  } catch {
    // A malformed address names nobody; the API answers it like any unknown one.
    return { view: "profile", slug: match[1] };
  }
}

export function homePath(language: Language): string {
  return inLanguage(language, "/");
}

export function searchPath(
  language: Language,
  query: string,
  page = 1,
): string {
  const params = new URLSearchParams({ q: query });
  if (page > 1) params.set("page", String(page));
  return `${inLanguage(language, "/search")}?${params.toString()}`;
}

export function profilePath(language: Language, slug: string): string {
  return inLanguage(language, `/people/${encodeURIComponent(slug)}`);
}

// Moves to another page without reloading. `resultsPath` is the search a reader came
// from, kept with the history entry so a profile can link back to it.
export type Navigate = (to: string, resultsPath?: string) => void;

export const NavigationContext = createContext<Navigate>(() => undefined);

export function useNavigate(): Navigate {
  return useContext(NavigationContext);
}
