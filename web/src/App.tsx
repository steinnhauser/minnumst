import { useCallback, useEffect, useState } from "react";
import { Globe } from "lucide-react";
import AppLink from "./AppLink";
import HomePage from "./HomePage";
import {
  inLanguage,
  LanguageContext,
  languageFromPath,
  translations,
  withoutLanguage,
} from "./i18n";
import ProfilePage from "./ProfilePage";
import {
  homePath,
  NavigationContext,
  parseRoute,
  type Navigate,
} from "./routes";
import SearchResults from "./SearchResults";
import SiteFooter from "./SiteFooter";
import "./App.css";

const CONTACT = "contact@minnumst.org";

function readLocation() {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    resultsPath: (window.history.state as { resultsPath?: string } | null)
      ?.resultsPath,
  };
}

function App() {
  // Changing language is a link to the other address, so this never changes
  // while the page is open.
  const [language] = useState(() => languageFromPath(window.location.pathname));
  const [location, setLocation] = useState(readLocation);
  const t = translations[language];
  const route = parseRoute(location.pathname, location.search);
  const otherLanguage = language === "en" ? "is" : "en";
  const otherLanguagePath =
    inLanguage(otherLanguage, withoutLanguage(location.pathname)) +
    location.search;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // The back and forward buttons.
  useEffect(() => {
    const follow = () => setLocation(readLocation());
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, []);

  const navigate: Navigate = useCallback((to, resultsPath) => {
    window.history.pushState(resultsPath ? { resultsPath } : null, "", to);
    setLocation(readLocation());
    window.scrollTo(0, 0);
  }, []);

  return (
    <LanguageContext.Provider value={language}>
      <NavigationContext.Provider value={navigate}>
        <main className="page-shell">
          <header className="site-header">
            <AppLink className="wordmark" to={homePath(language)}>
              <span className="visually-hidden">{t.home}</span>
              <span aria-hidden="true">
                Minnumst<span className="wordmark-dot">.</span>
              </span>
            </AppLink>
            <div className="header-actions">
              <p className="header-note">{t.tagline}</p>
              <a
                className="language-link"
                href={otherLanguagePath}
                hrefLang={otherLanguage}
                lang={otherLanguage}
              >
                <Globe size={14} aria-hidden="true" />
                {t.otherLanguageName}
              </a>
            </div>
          </header>

          {route.view === "home" && (
            <HomePage englishPath={otherLanguagePath} />
          )}
          {route.view === "search" && (
            <SearchResults
              key={`${route.query}|${route.page}`}
              query={route.query}
              page={route.page}
            />
          )}
          {route.view === "profile" && (
            <ProfilePage
              key={route.slug}
              slug={route.slug}
              resultsPath={location.resultsPath}
            />
          )}

          <SiteFooter contact={CONTACT} />
        </main>
      </NavigationContext.Provider>
    </LanguageContext.Provider>
  );
}

export default App;
