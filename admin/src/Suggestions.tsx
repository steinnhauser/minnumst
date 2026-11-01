import { useEffect, useState } from "react";
import {
  acceptSuggestion,
  errorMessage,
  loadHiddenPeople,
  loadSuggestions,
  rejectSuggestion,
  setPersonHidden,
  type PersonPage,
  type Suggestion,
} from "./api";

function SuggestionCard({
  suggestion,
  onDecided,
}: {
  suggestion: Suggestion;
  onDecided: (decided: Suggestion) => void;
}) {
  const current = suggestion.current_revision;
  const [title, setTitle] = useState(suggestion.title ?? "");
  const [excerpt, setExcerpt] = useState(suggestion.excerpt ?? "");
  const [content, setContent] = useState(suggestion.content ?? "");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const isEdit = suggestion.kind === "edit";
  const hasMovedOn =
    isEdit &&
    (current?.revision_number ?? null) !== suggestion.base_revision_number;

  async function decide(action: () => Promise<Suggestion>) {
    setIsBusy(true);
    setError("");
    try {
      onDecided(await action());
    } catch (reason) {
      setError(errorMessage(reason, "The decision could not be saved."));
      setIsBusy(false);
    }
  }

  return (
    <li className="suggestion-card">
      <h3>{suggestion.person_name}</h3>
      <p className="detail-note">
        {isEdit ? "Proposed edit" : "Correction or removal request"} ·{" "}
        {new Intl.DateTimeFormat("en", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(suggestion.created_at))}{" "}
        · <code>/people/{suggestion.person_slug}</code>
      </p>
      {suggestion.note && <p className="suggestion-note">{suggestion.note}</p>}
      {suggestion.source_url && (
        <p>
          Source given (check before following):{" "}
          <code>{suggestion.source_url}</code>
        </p>
      )}
      {hasMovedOn && (
        <p className="suggestion-warning" role="note">
          The story has changed since this was written, so accepting it would
          replace those changes.
        </p>
      )}
      {isEdit && (
        <div className="suggestion-compare">
          <section aria-label="Current story">
            <h4>Current story</h4>
            {current ? (
              <>
                <strong>{current.title}</strong>
                <p>{current.excerpt}</p>
                <p className="suggestion-text">{current.content}</p>
              </>
            ) : (
              <p>No story yet.</p>
            )}
          </section>
          <section aria-label="Proposed story">
            <h4>Proposed story (you can edit it)</h4>
            <label className="field-label" htmlFor={`title-${suggestion.id}`}>
              Title
            </label>
            <input
              className="text-field"
              id={`title-${suggestion.id}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label className="field-label" htmlFor={`excerpt-${suggestion.id}`}>
              Introduction
            </label>
            <textarea
              className="text-field"
              id={`excerpt-${suggestion.id}`}
              rows={2}
              value={excerpt}
              onChange={(event) => setExcerpt(event.target.value)}
            />
            <label className="field-label" htmlFor={`content-${suggestion.id}`}>
              Story
            </label>
            <textarea
              className="text-field"
              id={`content-${suggestion.id}`}
              rows={8}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </section>
        </div>
      )}
      {error && (
        <p className="save-message error" role="alert">
          {error}
        </p>
      )}
      <div className="suggestion-actions">
        <button
          className="name-update-button"
          type="button"
          disabled={isBusy}
          onClick={() => void decide(() => rejectSuggestion(suggestion.id))}
        >
          Decline and delete
        </button>
        <button
          className="save-button"
          type="button"
          disabled={isBusy || (isEdit && !(title.trim() && content.trim()))}
          onClick={() =>
            void decide(() =>
              acceptSuggestion(
                suggestion.id,
                isEdit
                  ? {
                      title,
                      excerpt,
                      content,
                      base_revision_number: current?.revision_number ?? 0,
                    }
                  : undefined,
              ),
            )
          }
        >
          {isEdit ? "Accept and publish" : "Mark as handled"}
        </button>
      </div>
    </li>
  );
}

// The review queue, and the people hidden from the public.
function Suggestions({
  onPendingChange,
  onEditAccepted,
  onPersonRestored,
}: {
  onPendingChange: (pending: number) => void;
  onEditAccepted: (suggestion: Suggestion) => void;
  onPersonRestored: (person: PersonPage) => void;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [hidden, setHidden] = useState<PersonPage[]>([]);
  const [message, setMessage] = useState("Loading suggestions...");
  // Bumped to fetch the next page once the loaded one has been worked through.
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([loadSuggestions(), loadHiddenPeople()])
      .then(([page, people]) => {
        if (!active) return;
        setItems([...page.items]);
        setTotal(page.total);
        setHidden(people);
        onPendingChange(page.total);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(errorMessage(error, "Could not load the suggestions."));
        }
      });
    return () => {
      active = false;
    };
  }, [loadCount, onPendingChange]);

  function handleDecided(decided: Suggestion) {
    const remaining = items.filter((item) => item.id !== decided.id);
    setItems(remaining);
    setTotal(total - 1);
    onPendingChange(total - 1);
    if (remaining.length === 0 && total > 1) setLoadCount(loadCount + 1);
    if (decided.status === "accepted" && decided.kind === "edit") {
      onEditAccepted(decided);
    }
  }

  async function restore(person: PersonPage) {
    try {
      const restored = await setPersonHidden(person.id, false);
      setHidden((current) => current.filter((item) => item.id !== person.id));
      onPersonRestored(restored);
    } catch (error) {
      setMessage(errorMessage(error, "The person could not be restored."));
    }
  }

  return (
    <div className="main-inner">
      <section className="page-heading" aria-labelledby="suggestions-title">
        <div>
          <p className="eyebrow">REVIEW</p>
          <h1 id="suggestions-title">Suggestions</h1>
          <p className="heading-copy">
            Changes proposed by visitors, often about their own family. Nothing
            is public until you accept it. Please read each one with care, and
            check that it names no living people and holds nothing private, such
            as health, crime, adoption or paternity.
          </p>
        </div>
      </section>
      <p className="detail-note" role="status">
        {message || `${total} waiting for review.`}
      </p>
      <ol className="suggestion-list">
        {items.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            onDecided={handleDecided}
          />
        ))}
      </ol>
      <section aria-labelledby="hidden-title">
        <h2 id="hidden-title">Hidden people</h2>
        {hidden.length === 0 && (
          <p className="detail-note">Nobody is hidden.</p>
        )}
        <ul className="suggestion-list">
          {hidden.map((person) => (
            <li className="suggestion-hidden" key={person.id}>
              <strong>{person.personName}</strong>
              <button
                className="name-update-button"
                type="button"
                onClick={() => void restore(person)}
              >
                Show {person.personName} again
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default Suggestions;
