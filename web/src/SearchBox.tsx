import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { searchPeople, type Person } from "./api";
import { personDetail } from "./dates";
import { LanguageContext, useTranslations } from "./i18n";
import { isLongEnough, profilePath, searchPath, useNavigate } from "./routes";

const SUGGESTIONS = 8;

// The search field with its suggestions. Submitting goes to the results page.
function SearchBox({ initialQuery = "" }: { initialQuery?: string }) {
  const t = useTranslations();
  const language = useContext(LanguageContext);
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  // Suggestions are for what the reader types, not a search already on the page.
  const [isEdited, setIsEdited] = useState(false);
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<readonly Person[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const suggestionRequest = useRef(0);

  useEffect(() => {
    const query = searchTerm.trim();
    const requestId = ++suggestionRequest.current;

    if (!isEdited || !isLongEnough(query)) return;
    const timeoutId = window.setTimeout(() => {
      if (requestId !== suggestionRequest.current) return;
      setIsLoading(true);
      void searchPeople(query, SUGGESTIONS)
        .then((page) => {
          if (requestId === suggestionRequest.current) {
            setSuggestions(page.items);
          }
        })
        .catch(() => {
          if (requestId === suggestionRequest.current) setSuggestions([]);
        })
        .finally(() => {
          if (requestId === suggestionRequest.current) setIsLoading(false);
        });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [isEdited, searchTerm]);

  const dismissSuggestions = useCallback(() => {
    suggestionRequest.current += 1;
    setSuggestions([]);
    setActiveIndex(-1);
    setIsLoading(false);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dismissSuggestions();
    const query = searchTerm.trim();
    if (!query) {
      setMessage(t.enterName);
    } else if (!isLongEnough(query)) {
      setMessage(t.tooShort);
    } else {
      navigate(searchPath(language, query));
    }
  }

  function openPerson(person: Person) {
    dismissSuggestions();
    navigate(profilePath(language, person.slug));
  }

  return (
    <form className="search-form" onSubmit={handleSubmit} role="search">
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
              activeIndex >= 0
                ? `person-suggestion-${suggestions[activeIndex]?.id}`
                : undefined
            }
            aria-busy={isLoading}
            placeholder={t.searchPlaceholder}
            value={searchTerm}
            onChange={(event) => {
              dismissSuggestions();
              setIsEdited(true);
              setSearchTerm(event.target.value);
              setMessage("");
            }}
            onKeyDown={(event) => {
              if (!suggestions.length) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) =>
                  current < 0
                    ? 0
                    : Math.min(current + 1, suggestions.length - 1),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) =>
                  current <= 0 ? suggestions.length - 1 : current - 1,
                );
              } else if (event.key === "Enter" && activeIndex >= 0) {
                event.preventDefault();
                openPerson(suggestions[activeIndex]);
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
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => openPerson(person)}
            >
              <span>
                <strong>{person.name}</strong>
                <span>{personDetail(person, t)}</span>
              </span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      <button className="search-button" type="submit">
        <span>{t.searchButton}</span>
        <ArrowUpRight size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      <p className="search-message" role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}

export default SearchBox;
