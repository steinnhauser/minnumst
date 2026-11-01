import { useContext, useEffect, useRef, useState } from "react";
import { searchPeople, type PersonPage } from "./api";
import AppLink from "./AppLink";
import { personDetail } from "./dates";
import { failureMessage, LanguageContext, useTranslations } from "./i18n";
import { isLongEnough, pageNumbers, profilePath, searchPath } from "./routes";
import SearchBox from "./SearchBox";

const PAGE_SIZE = 25;

// One page of results for the search in the address. The app mounts a new one for
// each search and page, so a late answer has nowhere to land.
function SearchResults({ query, page }: { query: string; page: number }) {
  const t = useTranslations();
  const language = useContext(LanguageContext);
  const canSearch = isLongEnough(query);
  const [results, setResults] = useState<PersonPage | null>(null);
  const [failure, setFailure] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = `${t.searchTitle} | Minnumst`;
    // The page changed under a keyboard or screen reader user, so they move with it.
    heading.current?.focus();
  }, [t.searchTitle]);

  useEffect(() => {
    if (!canSearch) return;
    let active = true;
    searchPeople(query, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .then((found) => {
        if (active) setResults(found);
      })
      .catch((error: unknown) => {
        if (active) setFailure(failureMessage(error, language));
      });
    return () => {
      active = false;
    };
  }, [canSearch, language, page, query]);

  const total = results?.total ?? 0;
  const items = results?.items ?? [];
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = (page - 1) * PAGE_SIZE + 1;
  const here = searchPath(language, query, page);

  function status() {
    if (!query) return t.enterName;
    if (!canSearch) return t.tooShort;
    if (failure) return failure;
    if (!results) return t.searching;
    if (total === 0) return t.noResults;
    if (items.length === 0) return t.noSuchPage;
    return t.showing(first, first + items.length - 1, total);
  }

  return (
    <div className="page-content">
      <SearchBox key={query} initialQuery={query} />
      <h1 className="page-heading" ref={heading} tabIndex={-1}>
        {canSearch ? t.resultsFor(query) : t.searchTitle}
      </h1>
      <p
        className="results-status"
        role="status"
        aria-live="polite"
        aria-busy={canSearch && !results && !failure}
      >
        {status()}
      </p>
      {items.length > 0 && (
        <ol className="result-list" aria-label={t.resultsLabel}>
          {items.map((person) => (
            <li key={person.id}>
              <AppLink
                className="person-result"
                to={profilePath(language, person.slug)}
                resultsPath={here}
              >
                <strong>{person.name}</strong>
                <span>{personDetail(person, t)}</span>
              </AppLink>
            </li>
          ))}
        </ol>
      )}
      {total > 0 && items.length === 0 && (
        <p>
          <AppLink to={searchPath(language, query, lastPage)}>
            {t.lastPage}
          </AppLink>
        </p>
      )}
      {items.length > 0 && lastPage > 1 && (
        <nav className="pagination" aria-label={t.paginationLabel}>
          {pageNumbers(page, lastPage).map((number, index) =>
            number === null ? (
              <span className="pagination-gap" key={`gap-${index}`}>
                …
              </span>
            ) : number === page ? (
              <span
                className="pagination-page"
                aria-current="page"
                key={number}
              >
                <span className="visually-hidden">{t.pageLabel(number)}</span>
                <span aria-hidden="true">{number}</span>
              </span>
            ) : (
              <AppLink
                className="pagination-page"
                key={number}
                label={t.pageLabel(number)}
                to={searchPath(language, query, number)}
              >
                {number}
              </AppLink>
            ),
          )}
        </nav>
      )}
    </div>
  );
}

export default SearchResults;
