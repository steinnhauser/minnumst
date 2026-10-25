import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import {
  getPersonBySlug,
  searchPeople,
  type Person,
  type PersonDetail,
} from "./api";
import "./App.css";

function App() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [suggestions, setSuggestions] = useState<readonly Person[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [people, setPeople] = useState<readonly Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonDetail | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingPerson, setIsLoadingPerson] = useState(false);
  const suggestionRequest = useRef(0);

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

  function dismissSuggestions() {
    suggestionRequest.current += 1;
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    setIsLoadingSuggestions(false);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dismissSuggestions();

    if (!searchTerm.trim()) {
      setPeople([]);
      setSelectedPerson(null);
      setSearchMessage("Enter a name to search the directory.");
      return;
    }

    setIsSearching(true);
    setPeople([]);
    setSelectedPerson(null);
    setSearchMessage("Searching the directory...");
    try {
      const page = await searchPeople(searchTerm.trim());
      setPeople(page.items);
      setSearchMessage(
        page.total === 0
          ? "No people found. Try another name."
          : `Showing ${page.items.length} of ${page.total} people.`,
      );
    } catch (error) {
      setSearchMessage(
        error instanceof Error ? error.message : "The directory search failed.",
      );
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSelectPerson(person: Person) {
    dismissSuggestions();
    setIsLoadingPerson(true);
    setSelectedPerson(null);
    try {
      setSelectedPerson(await getPersonBySlug(person.slug));
    } catch (error) {
      setSearchMessage(
        error instanceof Error ? error.message : "Could not load this person.",
      );
    } finally {
      setIsLoadingPerson(false);
    }
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
                    setSearchTerm(event.target.value);
                    setSearchMessage("");
                    setPeople([]);
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
              aria-busy={isSearching || isLoadingPerson}
            >
              {searchMessage}
            </p>
          </form>

          {people.length > 0 && (
            <div className="people-results" aria-label="Search results">
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

          {selectedPerson && (
            {/* Focusable, so keyboard users can scroll a long story. */}
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
