import type { PersonDetail } from "./api";
import { lifespan } from "./dates";
import SuggestionForm from "./SuggestionForm";

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
        <p className="eyebrow">IN MEMORY OF</p>
        <h2>{person.name}</h2>
        <p className="person-dates">{lifespan(person)}</p>
      </div>
      {person.current_story ? (
        <div className="person-story">
          <h3>{person.current_story.title}</h3>
          {person.current_story.excerpt && (
            <p className="story-excerpt">{person.current_story.excerpt}</p>
          )}
          <p className="story-content">{person.current_story.content}</p>
        </div>
      ) : (
        <p className="no-story">
          No story has been written yet. If you know something of {person.name}
          &apos;s life, you are welcome to suggest one.
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
