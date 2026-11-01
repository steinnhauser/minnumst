import { useContext, useEffect } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  browserReadsIcelandic,
  LanguageContext,
  useTranslations,
} from "./i18n";
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
          <p className="eyebrow">
            <span className="eyebrow-mark" aria-hidden="true" />
            {t.eyebrow}
          </p>
          <h1 id="page-title">{t.heading}</h1>
          <p className="intro-copy">{t.intro}</p>
          <SearchBox />
          <p className="public-note">
            <span aria-hidden="true" />
            {t.publicNote}
          </p>
        </section>
        <figure className="photo-panel">
          <img src="/grafarkirkja.jpg" alt={t.photoAlt} />
          <figcaption className="photo-caption">
            <span>{t.photoEyebrow}</span>
            <p>
              {t.photoCaption[0]}
              <br />
              {t.photoCaption[1]}
            </p>
          </figcaption>
        </figure>
      </div>
      <section className="about-strip" id="about" aria-label={t.about}>
        <p className="eyebrow">{t.aboutEyebrow}</p>
        <p>{t.aboutText}</p>
      </section>
    </>
  );
}

export default HomePage;
