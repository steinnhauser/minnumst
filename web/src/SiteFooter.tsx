import { useTranslations } from "./i18n";

const REPOSITORY = "https://github.com/steinnhauser/minnumst";

function SiteFooter({ contact }: { contact: string }) {
  const t = useTranslations();
  return (
    <footer className="site-footer">
      <div>
        <p className="eyebrow">MINNUMST</p>
        <p>{t.copyright}</p>
        <p>{t.storiesRemain}</p>
        <a href={`mailto:${contact}`}>{contact}</a>
      </div>
      <nav aria-label={t.projectLabel}>
        <p className="eyebrow">{t.openSource}</p>
        <a href={REPOSITORY} rel="noreferrer">
          {t.sourceCode}
        </a>
        <a href={`${REPOSITORY}/blob/main/LICENSE`} rel="noreferrer">
          {t.licence}
        </a>
        <a href={`${REPOSITORY}/security/policy`} rel="noreferrer">
          {t.security}
        </a>
      </nav>
      <div>
        <p className="eyebrow">{t.peopleAndData}</p>
        <p>{t.dataPromise}</p>
        <a href={`${REPOSITORY}#data-protection-and-sources`} rel="noreferrer">
          {t.dataLink}
        </a>
        <a
          href="https://images.unsplash.com/photo-1551632811-561732d1e306"
          rel="noreferrer"
        >
          {t.photoCredit}
        </a>
      </div>
    </footer>
  );
}

export default SiteFooter;
