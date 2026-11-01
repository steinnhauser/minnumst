import { useContext, useEffect } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  browserReadsIcelandic,
  LanguageContext,
  useTranslations,
} from "./i18n";
import ChurchPhotos from "./ChurchPhotos";
import SearchBox from "./SearchBox";

function HomePage({ englishPath }: { englishPath: string }) {
  const t = useTranslations();
  const language = useContext(LanguageContext);

  useEffect(() => {
    document.title = t.title;
  }, [t.title]);

  return (
    <>
      <div className="hero">
        <section className="search-content" aria-labelledby="page-title">
          {language === "is" && !browserReadsIcelandic() && (
            <p className="language-notice" lang="en">
              <a href={englishPath} hrefLang="en">
                {t.languageNotice}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </p>
          )}
          <h1 id="page-title">{t.heading}</h1>
          <p className="intro-copy">{t.intro}</p>
          <SearchBox />
        </section>
        <ChurchPhotos />
      </div>
      <section className="about-strip" id="about" aria-label={t.about}>
        <p className="eyebrow">{t.aboutEyebrow}</p>
        <p>{t.aboutText}</p>
      </section>
    </>
  );
}

export default HomePage;
