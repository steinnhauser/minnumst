import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import type { ApiError } from "@minnumst/api-client";
import { submitSuggestion, type PersonDetail } from "./api";
import { LanguageContext, useTranslations } from "./i18n";

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
  const t = useTranslations();
  const language = useContext(LanguageContext);
  const story = person.current_story;
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
  const form = useRef<HTMLFormElement>(null);

  // The button that opened the form is gone, so keyboard users move with it.
  useEffect(() => {
    if (isOpen) form.current?.focus();
  }, [isOpen]);

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
      // The edge's own limits answer without a message for the reader, and the
      // API's own are in English.
      const { status, message } = reason as ApiError;
      setError(
        status === 429
          ? t.tooMany
          : status === 413
            ? t.tooLong
            : language === "en" && message
              ? message
              : t.failed,
      );
    } finally {
      setIsSending(false);
    }
  }

  if (isSent) {
    return (
      <p className="suggestion-sent" role="status">
        {t.sent(person.name)}
      </p>
    );
  }

  if (!isOpen) {
    return (
      <button
        className="quiet-button"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        {t.suggestEdit}
      </button>
    );
  }

  return (
    <form
      className="suggestion-form"
      aria-label={t.suggestEdit}
      ref={form}
      tabIndex={-1}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <p>
        {t.formIntro} <a href={`mailto:${contact}`}>{contact}</a>.
      </p>
      <fieldset>
        <legend>{t.formQuestion}</legend>
        <label>
          <input
            type="radio"
            name="suggestion-kind"
            checked={kind === "edit"}
            onChange={() => setKind("edit")}
          />
          {t.kindEdit}
        </label>
        <label>
          <input
            type="radio"
            name="suggestion-kind"
            checked={kind === "request"}
            onChange={() => setKind("request")}
          />
          {t.kindRequest}
        </label>
      </fieldset>
      {kind === "edit" && (
        <>
          <label htmlFor="suggestion-title">{t.storyTitle}</label>
          <input
            id="suggestion-title"
            required
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label htmlFor="suggestion-excerpt">{t.storyExcerpt}</label>
          <textarea
            id="suggestion-excerpt"
            rows={2}
            maxLength={10000}
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
          />
          <label htmlFor="suggestion-content">{t.storyContent}</label>
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
        {kind === "edit" ? t.noteForEditor : t.noteRequest}
      </label>
      <textarea
        id="suggestion-note"
        required={kind === "request"}
        rows={3}
        maxLength={2000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <label htmlFor="suggestion-source">{t.sourceLink}</label>
      <input
        id="suggestion-source"
        type="url"
        maxLength={2048}
        value={sourceUrl}
        onChange={(event) => setSourceUrl(event.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <button className="quiet-button" type="submit" disabled={isSending}>
        {t.send}
      </button>
    </form>
  );
}

export default SuggestionForm;
