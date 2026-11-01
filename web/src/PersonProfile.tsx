import type { Person, PersonDetail } from "./api";
import SuggestionForm from "./SuggestionForm";

function lifespan(person: Person): string {
  const born = person.birth_date ? `Born ${person.birth_date}` : "";
  const died = person.death_date ? `Died ${person.death_date}` : "";
  return [born, died].filter(Boolean).join(" · ");
}

function PersonProfile({
  person,
  contact,
}: {
  person: PersonDetail;
  contact: string;
}) {
  return (
    <article className="person-detail" aria-label="Person details" tabIndex={0}>
      <div className="person-detail-heading">
        <p className="eyebrow">PERSON PROFILE</p>
        <h2>{person.name}</h2>
        <p className="person-dates">{lifespan(person)}</p>
      </div>
      {person.current_blog ? (
        <div className="person-story">
          <h3>{person.current_blog.title}</h3>
          {person.current_blog.excerpt && (
            <p className="story-excerpt">{person.current_blog.excerpt}</p>
          )}
          <p className="story-content">{person.current_blog.content}</p>
        </div>
      ) : (
        <p className="no-story">
          This is a short page: there is no published story yet. If you know
          this person&apos;s story, you can suggest one.
        </p>
      )}
      {person.sources.length > 0 && (
        <ul className="person-sources" aria-label="Sources">
          {person.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} rel="noreferrer">
                {source.title}
              </a>
            </li>
          ))}
        </ul>
      )}
      <SuggestionForm key={person.id} person={person} contact={contact} />
    </article>
  );
}

export default PersonProfile;
