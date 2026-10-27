import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowUpRight, Search } from "lucide-react";
import {
  getPersonBySlug,
  searchPeople,
  type Person,
  type PersonDetail,
} from "./api";
import "./App.css";

const DEFAULT_TITLE = document.title;
const PROFILE_PATH = /^\/people\/([^/]+)\/?$/;
const RESULTS_PAGE_SIZE = 50;

// Profiles live at /people/<slug>. Slugs are permanent: a rename keeps the
// slug, so links and bookmarks keep working.
function profileSlug(pathname: string): string | null {
  const match = PROFILE_PATH.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function App() {
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
  // Bumped by every new search and edit, so a page that arrives late is dropped.
  const searchRequest = useRef(0);
  const resultsList = useRef<HTMLDivElement>(null);
  const focusResultIndex = useRef(-1);

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

  const showProfile = useCallback(
    async (slug: string) => {
      dismissSuggestions();
      setIsLoadingPerson(true);
      setSelectedPerson(null);
      try {
        const person = await getPersonBySlug(slug);
        setSelectedPerson(person);
        document.title = `${person.name} | Minnumst`;
      } catch (error) {
        // The API client only throws Errors carrying a reader-facing message.
        setSearchMessage((error as Error).message);
      } finally {
        setIsLoadingPerson(false);
      }
    },
    [dismissSuggestions],
  );

  // Follow the address bar: on first load and on the back and forward buttons.
  useEffect(() => {
    function followLocation() {
      const slug = profileSlug(window.location.pathname);
      if (slug) {
        void showProfile(slug);
      } else {
        setSelectedPerson(null);
        document.title = DEFAULT_TITLE;
      }
    }
    followLocation();
    window.addEventListener("popstate", followLocation);
    return () => window.removeEventListener("popstate", followLocation);
  }, [showProfile]);

  function resetResults() {
    searchRequest.current += 1;
    setPeople([]);
    setIsSearching(false);
    setIsLoadingMore(false);
  }

  function showingMessage(shown: number, total: number) {
    return `Showing ${shown} of ${total} people.`;
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dismissSuggestions();
    resetResults();

    const query = searchTerm.trim();
    if (!query) {
      setSelectedPerson(null);
      setSearchMessage("Enter a name to search the directory.");
      return;
    }

    const requestId = searchRequest.current;
    setIsSearching(true);
    setSelectedPerson(null);
    if (window.location.pathname !== "/") {
      window.history.pushState(null, "", "/");
      document.title = DEFAULT_TITLE;
    }
    setSearchMessage("Searching the directory...");
    try {
      const page = await searchPeople(query, RESULTS_PAGE_SIZE);
      if (requestId !== searchRequest.current) return;
      setPeople(page.items);
      setResults({ query, total: page.total, next: page.items.length });
      setSearchMessage(
        page.total === 0
          ? "No people found. Try another name."
          : showingMessage(page.items.length, page.total),
      );
    } catch (error) {
      if (requestId !== searchRequest.current) return;
      // The API client only throws Errors carrying a reader-facing message.
      setSearchMessage((error as Error).message);
    } finally {
      if (requestId === searchRequest.current) setIsSearching(false);
    }
  }

  async function handleShowMore() {
    const requestId = searchRequest.current;
    setIsLoadingMore(true);
    setSearchMessage("Loading more people...");
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
      setSearchMessage(
        showingMessage(people.length + added.length, page.total),
      );
    } catch (error) {
      if (requestId !== searchRequest.current) return;
      // The API client only throws Errors carrying a reader-facing message.
      setSearchMessage((error as Error).message);
    } finally {
      if (requestId === searchRequest.current) setIsLoadingMore(false);
    }
  }

  async function handleSelectPerson(person: Person) {
    window.history.pushState(
      null,
      "",
      `/people/${encodeURIComponent(person.slug)}`,
    );
    await showProfile(person.slug);
  }

  return (
    <main className="page-shell">
      <section
        className="search-panel"
        id="search"
        aria-labelledby="page-title"
      >
        <header className="site-header">
          <a className="wordmark" href="#search" aria-label="Minnumst home">
            MINNUMST<span>.</span>
          </a>
          <p className="header-note">A PUBLIC PEOPLE ARCHIVE</p>
        </header>

        <div className="search-content">
          <p className="eyebrow">
            <span className="eyebrow-mark" aria-hidden="true" />
            STORIES, PHOTOGRAPHS, LIVES
          </p>
          <h1 id="page-title">Find a person.</h1>
          <p className="intro-copy">
            Explore articles, photographs, and details from Icelandic lives.
          </p>

          <form className="search-form" onSubmit={handleSearch} role="search">
            <label htmlFor="person-search">Search by name</label>
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
                  placeholder="Search for a persons details..."
                  value={searchTerm}
                  onChange={(event) => {
                    dismissSuggestions();
                    resetResults();
                    setSearchTerm(event.target.value);
                    setSearchMessage("");
                    setSelectedPerson(null);
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
                aria-label="Search suggestions"
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
                      <span>{person.blog?.title ?? "Person profile"}</span>
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
              <span>Search</span>
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
              aria-label="Search results"
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
                    <span>{person.blog?.title ?? "Person profile"}</span>
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
              Show more people
            </button>
          )}

          {selectedPerson && (
            <article
              className="person-detail"
              aria-label="Person details"
              tabIndex={0}
            >
              <div className="person-detail-heading">
                <p className="eyebrow">PERSON PROFILE</p>
                <h2>{selectedPerson.name}</h2>
              </div>
              {selectedPerson.current_blog ? (
                <div className="person-story">
                  <h3>{selectedPerson.current_blog.title}</h3>
                  {selectedPerson.current_blog.excerpt && (
                    <p className="story-excerpt">
                      {selectedPerson.current_blog.excerpt}
                    </p>
                  )}
                  <p className="story-content">
                    {selectedPerson.current_blog.content}
                  </p>
                </div>
              ) : (
                <p className="no-story">There is no published story yet.</p>
              )}
            </article>
          )}

          <p className="public-note">
            <span aria-hidden="true" />
            Public access · No sign-in required
          </p>
        </div>

        <footer className="panel-footer">
          <a href="#about">
            About the archive <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <span>ICELAND · PEOPLE · MEMORY</span>
        </footer>
      </section>

      <figure className="photo-panel">
        <img
          src="/people-on-the-trail.jpg"
          alt="A group of hikers crossing a green mountain trail"
        />
        <figcaption className="photo-caption">
          <span>THE STORIES THAT MAKE A PLACE</span>
          <p>
            Remembered
            <br />
            together.
          </p>
        </figcaption>
        <span className="photo-index">01 / PEOPLE &amp; PLACE</span>
      </figure>

      <section
        className="about-strip"
        id="about"
        aria-label="About the archive"
      >
        <p className="eyebrow">A SHARED RECORD</p>
        <p>
          A growing collection of stories, photographs, and details about people
          and the lives they have shaped.
        </p>
      </section>
    </main>
  );
}

export default App;
