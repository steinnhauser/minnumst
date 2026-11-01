import type { PersonDetail } from "./api";
import { lifespan } from "./dates";
import { useTranslations } from "./i18n";
import SuggestionForm from "./SuggestionForm";

function PersonProfile({
  person,
  contact,
}: {
  person: PersonDetail;
  contact: string;
}) {
  const t = useTranslations();
  return (
    <article className="person-detail" aria-label={t.personLabel} tabIndex={0}>
      <div className="person-detail-heading">
        <p className="eyebrow">{t.inMemoryOf}</p>
        <h1>{person.name}</h1>
        <p className="person-dates">{lifespan(person, t)}</p>
      </div>
      {person.current_story ? (
        <div className="person-story">
          <h2>{person.current_story.title}</h2>
          {person.current_story.excerpt && (
            <p className="story-excerpt">{person.current_story.excerpt}</p>
          )}
          <p className="story-content">{person.current_story.content}</p>
        </div>
      ) : (
        <p className="no-story">{t.noStory(person.name)}</p>
      )}
      {person.sources.length > 0 && (
        <div className="person-sources-block">
          <p className="eyebrow">{t.sourcesHeading}</p>
          <ul className="person-sources" aria-label={t.sources}>
            {person.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="suggestion-area">
        <SuggestionForm key={person.id} person={person} contact={contact} />
      </div>
    </article>
  );
}

export default PersonProfile;
