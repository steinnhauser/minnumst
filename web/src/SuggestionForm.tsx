import { useState, type FormEvent } from "react";
import { submitSuggestion, type PersonDetail } from "./api";

type Kind = "edit" | "request";

// Anyone can propose a change without a login: an editor reads it first, and
// the form asks for nothing about the visitor.
function SuggestionForm({
  person,
  contact,
}: {
  person: PersonDetail;
  contact: string;
}) {
  const story = person.current_blog;
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("edit");
  const [title, setTitle] = useState(story?.title ?? "");
  const [excerpt, setExcerpt] = useState(story?.excerpt ?? "");
  const [content, setContent] = useState(story?.content ?? "");
  const [note, setNote] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSending(true);
    setError("");
    try {
      await submitSuggestion(person.id, {
        kind,
        base_revision_number: story?.revision_number ?? null,
        ...(kind === "edit" ? { title, excerpt, content } : {}),
        note,
        source_url: sourceUrl,
      });
      setIsSent(true);
    } catch (reason) {
      // The API client only throws Errors carrying a reader-facing message.
      setError((reason as Error).message);
    } finally {
      setIsSending(false);
    }
  }

  if (isSent) {
    return (
      <p className="suggestion-sent" role="status">
        Thank you. An editor will read your suggestion before anything changes
        on this page.
      </p>
    );
  }

  if (!isOpen) {
    return (
      <button
        className="show-more-button"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        Suggest an edit
      </button>
    );
  }

  return (
    <form
      className="suggestion-form"
      aria-label="Suggest an edit"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <p>
        Please write in your own words, and leave out living people and private
        matters such as health, crime, adoption or paternity. We don&apos;t ask
        who you are and don&apos;t keep your address. If you would like a reply,
        write to <a href={`mailto:${contact}`}>{contact}</a>.
      </p>
      <fieldset>
        <legend>What would you like to do?</legend>
        <label>
          <input
            type="radio"
            name="suggestion-kind"
            checked={kind === "edit"}
            onChange={() => setKind("edit")}
          />
          Edit the story
        </label>
        <label>
          <input
            type="radio"
            name="suggestion-kind"
            checked={kind === "request"}
            onChange={() => setKind("request")}
          />
          Report a mistake or ask for a removal
        </label>
      </fieldset>
      {kind === "edit" && (
        <>
          <label htmlFor="suggestion-title">Title</label>
          <input
            id="suggestion-title"
            required
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label htmlFor="suggestion-excerpt">Introduction (optional)</label>
          <textarea
            id="suggestion-excerpt"
            rows={2}
            maxLength={10000}
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
          />
          <label htmlFor="suggestion-content">Story</label>
          <textarea
            id="suggestion-content"
            required
            rows={10}
            maxLength={50000}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </>
      )}
      <label htmlFor="suggestion-note">
        {kind === "edit"
          ? "Anything the editor should know (optional)"
          : "What is wrong, or what should be removed?"}
      </label>
      <textarea
        id="suggestion-note"
        required={kind === "request"}
        rows={3}
        maxLength={2000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <label htmlFor="suggestion-source">Link to a source (optional)</label>
      <input
        id="suggestion-source"
        type="url"
        maxLength={2048}
        value={sourceUrl}
        onChange={(event) => setSourceUrl(event.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <button className="show-more-button" type="submit" disabled={isSending}>
        Send for review
      </button>
    </form>
  );
}

export default SuggestionForm;
