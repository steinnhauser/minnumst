import { useContext, useEffect, useState } from "react";
import { getPersonBySlug, type PersonDetail } from "./api";
import AppLink from "./AppLink";
import { failureMessage, LanguageContext, useTranslations } from "./i18n";
import PersonProfile from "./PersonProfile";
import SearchBox from "./SearchBox";

const CONTACT = "contact@minnumst.org";

// A person's own page. The app mounts a new one for each person, so a late answer
// has nowhere to land.
function ProfilePage({
  slug,
  resultsPath,
}: {
  slug: string;
  resultsPath?: string;
}) {
  const t = useTranslations();
  const language = useContext(LanguageContext);
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    let active = true;
    document.title = t.title;
    getPersonBySlug(slug)
      .then((found) => {
        if (!active) return;
        setPerson(found);
        document.title = `${found.name} | Minnumst`;
      })
      .catch((error: unknown) => {
        if (active) setFailure(failureMessage(error, language));
      });
    return () => {
      active = false;
    };
  }, [language, slug, t.title]);

  return (
    <div className="page-content">
      <SearchBox />
      {resultsPath && (
        <p className="back-link">
          <AppLink to={resultsPath}>{t.backToResults}</AppLink>
        </p>
      )}
      <p
        className="results-status"
        role="status"
        aria-live="polite"
        aria-busy={!person && !failure}
      >
        {failure}
      </p>
      {person && <PersonProfile person={person} contact={CONTACT} />}
    </div>
  );
}

export default ProfilePage;
