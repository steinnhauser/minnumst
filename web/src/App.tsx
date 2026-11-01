import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowUpRight, Globe, Search } from "lucide-react";
import type { ApiError } from "@minnumst/api-client";
import {
  getPersonBySlug,
  searchPeople,
  type Person,
  type PersonDetail,
} from "./api";
import { lifespan } from "./dates";
import {
  inLanguage,
  LanguageContext,
  languageFromPath,
  translations,
  withoutLanguage,
  type Language,
  type Translations,
} from "./i18n";
import PersonProfile from "./PersonProfile";
import SiteFooter from "./SiteFooter";
import "./App.css";

const CONTACT = "contact@minnumst.org";

const PROFILE_PATH = /^\/people\/([^/]+)\/?$/;
const RESULTS_PAGE_SIZE = 50;

// Profiles live at /people/<slug>. Slugs are permanent: a rename keeps the
// slug, so links and bookmarks keep working.
function profileSlug(pathname: string): string | null {
  const match = PROFILE_PATH.exec(withoutLanguage(pathname));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    // A malformed address names nobody; the API answers it like any unknown one.
    return match[1];
  }
}

// What a search result says under a name.
function resultDetail(person: Person, t: Translations): string {
  return person.story?.title ?? (lifespan(person, t) || t.shortPage);
}

// An API failure in the reader's words. The API's own messages are in English.
function failureMessage(error: unknown, language: Language): string {
  const t = translations[language];
  const { status, message } = error as ApiError;
  if (status === 404) return t.notFound;
  if (status === undefined) return t.unreachable;
  return language === "en" ? message : t.failed;
}

function App() {
  // Changing language is a link to the other address, so this never changes
  // while the page is open.
  const [language] = useState(() => languageFromPath(window.location.pathname));
  const t = translations[language];
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [suggestions, setSuggestions] = useState<readonly Person[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [people, setPeople] = useState<readonly Person[]>([]);
  // The submitted query, how many matches it has, and where its next page starts.
  const [results, setResults] = useState({ query: "", total: 0, next: 0 });
  const [selectedPerson, setSelectedPerson] = useState<PersonDetail | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingPerson, setIsLoadingPerson] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const suggestionRequest = useRef(0);
  // Bumped by every profile opened or closed, so a late answer is dropped.
  const profileRequest = useRef(0);
  // Bumped by every new search and edit, so a page that arrives late is dropped.
  const searchRequest = useRef(0);
  const resultsList = useRef<HTMLDivElement>(null);
  const focusResultIndex = useRef(-1);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // After "Show more", move focus to the first newly loaded person.
  useEffect(() => {
    if (focusResultIndex.current < 0) return;
    const result = resultsList.current!.children[focusResultIndex.current];
    focusResultIndex.current = -1;
    (result as HTMLElement).focus();
  }, [people]);

  useEffect(() => {
    const query = searchTerm.trim();
    const requestId = ++suggestionRequest.current;

    if (query.length < 2) return;
    const timeoutId = window.setTimeout(() => {
      if (requestId !== suggestionRequest.current) return;
      setIsLoadingSuggestions(true);
      void searchPeople(query, 8)
        .then((page) => {
          if (requestId === suggestionRequest.current) {
            setSuggestions(page.items);
          }
        })
        .catch(() => {
          if (requestId === suggestionRequest.current) setSuggestions([]);
        })
        .finally(() => {
          if (requestId === suggestionRequest.current) {
            setIsLoadingSuggestions(false);
          }
        });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  const dismissSuggestions = useCallback(() => {
    suggestionRequest.current += 1;
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    setIsLoadingSuggestions(false);
  }, []);

  const closeProfile = useCallback(() => {
    profileRequest.current += 1;
    setSelectedPerson(null);
    setIsLoadingPerson(false);
  }, []);

  const showProfile = useCallback(
    async (slug: string) => {
      dismissSuggestions();
      const requestId = ++profileRequest.current;
      setIsLoadingPerson(true);
      setSelectedPerson(null);
      setSearchMessage("");
      try {
        const person = await getPersonBySlug(slug);
        if (requestId !== profileRequest.current) return;
        setSelectedPerson(person);
        document.title = `${person.name} | Minnumst`;
      } catch (error) {
        if (requestId !== profileRequest.current) return;
        document.title = t.title;
        setSearchMessage(failureMessage(error, language));
      } finally {
        if (requestId === profileRequest.current) setIsLoadingPerson(false);
      }
    },
    [dismissSuggestions, language, t.title],
  );

  // Follow the address bar: on first load and on the back and forward buttons.
  useEffect(() => {
    function followLocation() {
      const slug = profileSlug(window.location.pathname);
      if (slug) {
        void showProfile(slug);
      } else {
        closeProfile();
        document.title = t.title;
      }
    }
    followLocation();
    window.addEventListener("popstate", followLocation);
    return () => window.removeEventListener("popstate", followLocation);
  }, [closeProfile, showProfile, t.title]);

  function resetResults() {
    searchRequest.current += 1;
    setPeople([]);
    setIsSearching(false);
    setIsLoadingMore(false);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dismissSuggestions();
    resetResults();

    const query = searchTerm.trim();
    if (!query) {
      closeProfile();
      setSearchMessage(t.enterName);
      return;
    }

    const requestId = searchRequest.current;
    setIsSearching(true);
    closeProfile();
    const home = inLanguage(language, "/");
    if (window.location.pathname !== home) {
      window.history.pushState(null, "", home);
      document.title = t.title;
    }
    setSearchMessage(t.searching);
    try {
      const page = await searchPeople(query, RESULTS_PAGE_SIZE);
      if (requestId !== searchRequest.current) return;
      setPeople(page.items);
      setResults({ query, total: page.total, next: page.items.length });
      setSearchMessage(
        page.total === 0
          ? t.noResults
          : t.showing(page.items.length, page.total),
      );
    } catch (error) {
      if (requestId !== searchRequest.current) return;
      setSearchMessage(failureMessage(error, language));
    } finally {
      if (requestId === searchRequest.current) setIsSearching(false);
    }
  }

  async function handleShowMore() {
    const requestId = searchRequest.current;
    setIsLoadingMore(true);
    setSearchMessage(t.loadingMore);
    try {
      const page = await searchPeople(
        results.query,
        RESULTS_PAGE_SIZE,
        results.next,
      );
      if (requestId !== searchRequest.current) return;
      // Skip anyone already listed, in case the archive changed between pages.
      const listed = new Set(people.map((person) => person.id));
      const added = page.items.filter((person) => !listed.has(person.id));
      focusResultIndex.current = added.length ? people.length : -1;
      setPeople([...people, ...added]);
      setResults({
        ...results,
        total: page.total,
        next: page.items.length ? results.next + page.items.length : page.total,
      });
      setSearchMessage(t.showing(people.length + added.length, page.total));
    } catch (error) {
      if (requestId !== searchRequest.current) return;
      setSearchMessage(failureMessage(error, language));
    } finally {
      if (requestId === searchRequest.current) setIsLoadingMore(false);
    }
  }

  async function handleSelectPerson(person: Person) {
    window.history.pushState(
      null,
      "",
      inLanguage(language, `/people/${encodeURIComponent(person.slug)}`),
    );
    await showProfile(person.slug);
  }

  return (
    <LanguageContext.Provider value={language}>
      <main className="page-shell">
        <section
          className="search-panel"
          id="search"
          aria-labelledby="page-title"
        >
          <header className="site-header">
            <a className="wordmark" href="#search" aria-label={t.home}>
              MINNUMST<span>.</span>
            </a>
            <div className="header-actions">
              <p className="header-note">{t.tagline}</p>
              <a
                className="language-link"
                href={inLanguage(
                  language === "en" ? "is" : "en",
                  withoutLanguage(window.location.pathname),
                )}
                hrefLang={language === "en" ? "is" : "en"}
                lang={language === "en" ? "is" : "en"}
              >
                <Globe size={14} aria-hidden="true" />
                {t.otherLanguageName}
              </a>
            </div>
          </header>

          <div className="search-content">
            <p className="eyebrow">
              <span className="eyebrow-mark" aria-hidden="true" />
              {t.eyebrow}
            </p>
            <h1 id="page-title">{t.heading}</h1>
            <p className="intro-copy">{t.intro}</p>

            <form className="search-form" onSubmit={handleSearch} role="search">
              <label htmlFor="person-search">{t.searchLabel}</label>
              <div className="search-autocomplete">
                <div className="search-control">
                  <Search size={20} strokeWidth={1.8} aria-hidden="true" />
                  <input
                    id="person-search"
                    type="search"
                    maxLength={255}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={suggestions.length > 0}
                    aria-controls="person-suggestions"
                    aria-activedescendant={
                      activeSuggestionIndex >= 0
                        ? `person-suggestion-${suggestions[activeSuggestionIndex]?.id}`
                        : undefined
                    }
                    aria-busy={isLoadingSuggestions}
                    placeholder={t.searchPlaceholder}
                    value={searchTerm}
                    onChange={(event) => {
                      dismissSuggestions();
                      resetResults();
                      setSearchTerm(event.target.value);
                      setSearchMessage("");
                      closeProfile();
                    }}
                    onKeyDown={(event) => {
                      if (!suggestions.length) return;
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setActiveSuggestionIndex((current) =>
                          current < 0
                            ? 0
                            : Math.min(current + 1, suggestions.length - 1),
                        );
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setActiveSuggestionIndex((current) =>
                          current <= 0 ? suggestions.length - 1 : current - 1,
                        );
                      } else if (
                        event.key === "Enter" &&
                        activeSuggestionIndex >= 0
                      ) {
                        event.preventDefault();
                        void handleSelectPerson(
                          suggestions[activeSuggestionIndex],
                        );
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        dismissSuggestions();
                      }
                    }}
                    autoComplete="off"
                  />
                </div>
                <div
                  className="people-suggestions"
                  id="person-suggestions"
                  role="listbox"
                  aria-label={t.suggestionsLabel}
                  hidden={!suggestions.length}
                >
                  {suggestions.map((person, index) => (
                    <button
                      className="person-result"
                      id={`person-suggestion-${person.id}`}
                      key={person.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeSuggestionIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void handleSelectPerson(person)}
                    >
                      <span>
                        <strong>{person.name}</strong>
                        <span>{resultDetail(person, t)}</span>
                      </span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="search-button"
                type="submit"
                disabled={isSearching}
              >
                <span>{t.searchButton}</span>
                <ArrowUpRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              <p
                className="search-message"
                role="status"
                aria-live="polite"
                aria-busy={isSearching || isLoadingPerson || isLoadingMore}
              >
                {searchMessage}
              </p>
            </form>

            {people.length > 0 && (
              <div
                className="people-results"
                aria-label={t.resultsLabel}
                ref={resultsList}
              >
                {people.map((person) => (
                  <button
                    className="person-result"
                    key={person.id}
                    type="button"
                    onClick={() => void handleSelectPerson(person)}
                  >
                    <span>
                      <strong>{person.name}</strong>
                      <span>{resultDetail(person, t)}</span>
                    </span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}

            {people.length > 0 && results.next < results.total && (
              <button
                className="show-more-button"
                type="button"
                disabled={isLoadingMore}
                onClick={() => void handleShowMore()}
              >
                {t.showMore}
              </button>
            )}

            {selectedPerson && (
              <PersonProfile person={selectedPerson} contact={CONTACT} />
            )}

            <p className="public-note">
              <span aria-hidden="true" />
              {t.publicNote}
            </p>
          </div>

          <footer className="panel-footer">
            <a href="#about">
              {t.about} <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <span>{t.panelFooter}</span>
          </footer>
        </section>

        <figure className="photo-panel">
          <img src="/people-on-the-trail.jpg" alt={t.photoAlt} />
          <figcaption className="photo-caption">
            <span>{t.photoEyebrow}</span>
            <p>
              {t.photoCaption[0]}
              <br />
              {t.photoCaption[1]}
            </p>
          </figcaption>
          <span className="photo-index">{t.photoIndex}</span>
        </figure>

        <section className="about-strip" id="about" aria-label={t.about}>
          <p className="eyebrow">{t.aboutEyebrow}</p>
          <p>
            A growing collection of the stories of those who came before us,
            kept with care by the people who remember them.
          </p>
        </section>

        <SiteFooter contact={CONTACT} />
      </main>
    </LanguageContext.Provider>
  );
}

export default App;
