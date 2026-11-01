import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  BookOpenText,
  FilePlus2,
  History,
  Inbox,
  Info,
  Save,
} from "lucide-react";
import {
  createPerson,
  currentRevision,
  errorMessage,
  foldName,
  loadPeople,
  loadPersonRevisions,
  loadSuggestions,
  restoreRevision,
  savePersonRevision,
  setPersonHidden,
  updatePerson,
  type PersonPage,
  type Revision,
  type StoryInput,
  type Suggestion,
} from "./api";
import { appConfig } from "./config";
import PageDetails from "./PageDetails";
import PageIndex from "./PageIndex";
import PagePreview from "./PagePreview";
import RevisionHistory from "./RevisionHistory";
import Suggestions from "./Suggestions";
import "./App.css";

type EditorTab = "write" | "preview" | "history";

const nameConflict = "A person with this name and these dates already exists";
const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");
const emptyDraft: StoryInput = { title: "", excerpt: "", content: "" };

function viewFromAddress() {
  return window.location.hash === "#suggestions" ? "suggestions" : "pages";
}

function App() {
  const [pages, setPages] = useState<PersonPage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<EditorTab>("write");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState(viewFromAddress);
  const [pendingCount, setPendingCount] = useState(0);
  const [personName, setPersonName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [deathDate, setDeathDate] = useState("");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  // The story as last loaded or saved; the editor has unsaved changes when
  // its fields differ from it.
  const [savedDraft, setSavedDraft] = useState<StoryInput>(emptyDraft);
  const selectionRequest = useRef(0);
  const selectedPage = pages.find((page) => page.id === selectedId) ?? null;
  const personIsUnchanged =
    cleanName(personName) === (selectedPage?.personName ?? "") &&
    birthDate.trim() === (selectedPage?.birthDate ?? "") &&
    deathDate.trim() === (selectedPage?.deathDate ?? "");
  const hasUnsavedChanges =
    !personIsUnchanged ||
    title !== savedDraft.title ||
    excerpt !== savedDraft.excerpt ||
    content !== savedDraft.content;
  const activeRevision = selectedPage ? currentRevision(selectedPage) : null;
  const revisionCount =
    selectedPage?.story?.revisionCount ?? selectedPage?.revisions.length ?? 0;
  const lastSavedAt = activeRevision?.savedAt ?? selectedPage?.story?.savedAt;
  const visiblePages = useMemo(() => {
    const query = foldName(filter.trim());
    return pages.filter((page) => foldName(page.personName).includes(query));
  }, [filter, pages]);

  useEffect(() => {
    let active = true;
    void loadPeople()
      .then((people) => {
        if (active) setPages(people);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(errorMessage(error, "Could not load people."));
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const followAddress = () => setView(viewFromAddress());
    window.addEventListener("hashchange", followAddress);
    return () => window.removeEventListener("hashchange", followAddress);
  }, []);

  // The count on the navigation; a failure here shows in the queue itself.
  useEffect(() => {
    void loadSuggestions()
      .then((page) => setPendingCount(page.total))
      .catch(() => undefined);
  }, []);

  const handlePersonRestored = useCallback((person: PersonPage) => {
    setPages((current) =>
      [...current, person].sort((a, b) =>
        a.personName.localeCompare(b.personName),
      ),
    );
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  function confirmDiscard() {
    return (
      !hasUnsavedChanges ||
      window.confirm("Discard the unsaved changes to this page?")
    );
  }

  function loadDraft(draft: StoryInput) {
    setTitle(draft.title);
    setExcerpt(draft.excerpt);
    setContent(draft.content);
    setSavedDraft(draft);
    setChangeNote("");
  }

  function startNewPage() {
    if (!confirmDiscard()) return;
    selectionRequest.current += 1;
    setSelectedId(null);
    setPersonName("");
    setBirthDate("");
    setDeathDate("");
    loadDraft(emptyDraft);
    setTab("write");
    setMessage("");
  }

  async function selectPost(page: PersonPage) {
    if (!confirmDiscard()) return;
    const requestId = ++selectionRequest.current;
    const revision = currentRevision(page);
    setSelectedId(page.id);
    setPersonName(page.personName);
    setBirthDate(page.birthDate);
    setDeathDate(page.deathDate);
    loadDraft({
      title: revision?.title ?? page.story?.title ?? "",
      excerpt: revision?.excerpt ?? page.story?.excerpt ?? "",
      content: revision?.content ?? "",
    });
    setTab("write");
    setMessage("");

    if (page.story && page.revisions.length === 0) {
      setMessage("Loading saved revisions...");
      try {
        const revisions = await loadPersonRevisions(page.id);
        if (selectionRequest.current !== requestId) return;
        setPages((current) =>
          current.map((item) =>
            item.id === page.id ? { ...item, revisions } : item,
          ),
        );
        const latest = revisions.at(-1);
        loadDraft({
          title: latest?.title ?? page.story.title,
          excerpt: latest?.excerpt ?? page.story.excerpt,
          content: latest?.content ?? "",
        });
        setMessage("");
      } catch (error) {
        if (selectionRequest.current === requestId) {
          setMessage(
            errorMessage(error, "Could not load this page's history."),
          );
          setMessageIsError(true);
        }
      }
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedPage && cleanName(personName) !== selectedPage.personName) {
      setMessage("Update the person name before saving a story revision.");
      setMessageIsError(true);
      return;
    }
    if (!personName.trim() || !title.trim() || !content.trim()) {
      setMessage("Add a person name, page title, and story before saving.");
      setMessageIsError(true);
      return;
    }

    const draft = { title, excerpt, content };
    const baseRevision =
      activeRevision?.revisionNumber ?? selectedPage?.story?.revisionCount ?? 0;
    setIsSaving(true);
    try {
      let person = selectedPage;
      if (!person) {
        person = await createPerson(personName, birthDate, deathDate);
        setPages((current) => [person!, ...current]);
        setSelectedId(person.id);
        setPersonName(person.personName);
        setBirthDate(person.birthDate);
        setDeathDate(person.deathDate);
      }

      const saved = await savePersonRevision(
        person.id,
        draft,
        baseRevision,
        changeNote,
      );
      const savedPage: PersonPage = {
        ...person,
        story: {
          title: saved.revision.title,
          excerpt: saved.revision.excerpt,
          savedAt: saved.revision.savedAt,
          revisionCount: saved.revisionCount,
        },
        revisions: [...person.revisions, saved.revision],
      };
      setPages((current) =>
        current.some((item) => item.id === savedPage.id)
          ? current.map((item) => (item.id === savedPage.id ? savedPage : item))
          : [savedPage, ...current],
      );
      setSelectedId(savedPage.id);
      setPersonName(savedPage.personName);
      // Edits made while the save was in flight stay unsaved.
      setSavedDraft(draft);
      setChangeNote("");
      setMessage(`Saved as version ${saved.revision.revisionNumber}.`);
      setMessageIsError(false);
    } catch (error) {
      setMessage(
        errorMessage(error, "The page could not be saved.", (reason) =>
          reason === nameConflict
            ? "A person with this name and these dates already exists. Select them from the pages list and save the story there."
            : reason,
        ),
      );
      setMessageIsError(true);
    } finally {
      setIsSaving(false);
    }
  }

  // Only the "Update name" button calls this, and it is disabled unless the
  // selected person's name has changed to a non-empty one.
  async function handleRenamePerson(page: PersonPage) {
    setIsSaving(true);
    try {
      const updated = await updatePerson(
        page.id,
        personName,
        birthDate,
        deathDate,
      );
      const renamedPage = {
        ...page,
        personName: updated.personName,
        slug: updated.slug,
        birthDate: updated.birthDate,
        deathDate: updated.deathDate,
      };
      setPages((current) =>
        current.map((page) =>
          page.id === renamedPage.id ? renamedPage : page,
        ),
      );
      setPersonName(renamedPage.personName);
      setBirthDate(renamedPage.birthDate);
      setDeathDate(renamedPage.deathDate);
      setMessage("Person updated.");
      setMessageIsError(false);
    } catch (error) {
      setMessage(
        errorMessage(error, "The person could not be updated.", (reason) =>
          reason === nameConflict
            ? "Another person already has this name and these dates."
            : reason,
        ),
      );
      setMessageIsError(true);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRestore(revision: Revision) {
    if (!confirmDiscard()) return;
    if (
      !window.confirm(
        `Publish version ${revision.revisionNumber} again? It becomes the text readers see. If later versions removed something at a family's request or for privacy, this brings it back.`,
      )
    ) {
      return;
    }
    // The history only offers this for a page whose versions have loaded.
    const page = selectedPage!;
    setIsSaving(true);
    try {
      const restored = await restoreRevision(
        page.id,
        revision.revisionNumber,
        activeRevision!.revisionNumber,
      );
      const refreshed: PersonPage = {
        ...page,
        story: {
          title: restored.title,
          excerpt: restored.excerpt,
          savedAt: restored.savedAt,
          revisionCount: restored.revisionNumber,
        },
        revisions: [...page.revisions, restored],
      };
      setPages((current) =>
        current.map((item) => (item.id === page.id ? refreshed : item)),
      );
      loadDraft({
        title: restored.title,
        excerpt: restored.excerpt,
        content: restored.content,
      });
      setMessage(
        `Version ${revision.revisionNumber} is published again as version ${restored.revisionNumber}.`,
      );
      setMessageIsError(false);
    } catch (error) {
      setMessage(errorMessage(error, "The version could not be restored."));
      setMessageIsError(true);
    } finally {
      setIsSaving(false);
    }
  }

  // An accepted edit is a new revision, so the desk's copy of that story is stale:
  // drop the loaded history, and reload it if the person is open in the editor.
  function handleSuggestionAccepted(suggestion: Suggestion) {
    const page = pages.find((item) => item.id === suggestion.person_id);
    const revision = suggestion.current_revision;
    if (!page || !revision) return;
    const updated: PersonPage = {
      ...page,
      story: {
        title: revision.title,
        excerpt: revision.excerpt,
        savedAt: revision.saved_at,
        revisionCount: revision.revision_number,
      },
      revisions: [],
    };
    setPages((current) =>
      current.map((item) => (item.id === page.id ? updated : item)),
    );
    if (page.id === selectedId) void selectPost(updated);
  }

  // A removal request is met by hiding the page: everything stays on record.
  async function handleHidePerson(page: PersonPage) {
    if (!confirmDiscard()) return;
    setIsSaving(true);
    try {
      await setPersonHidden(page.id, true);
      setPages((current) => current.filter((item) => item.id !== page.id));
      selectionRequest.current += 1;
      setSelectedId(null);
      setPersonName("");
      setBirthDate("");
      setDeathDate("");
      loadDraft(emptyDraft);
      setMessage(`${page.personName} is now hidden from the public.`);
      setMessageIsError(false);
    } catch (error) {
      setMessage(errorMessage(error, "The person could not be hidden."));
      setMessageIsError(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="studio-shell">
      <aside className="studio-sidebar" aria-label="Admin navigation">
        <a
          className="studio-brand"
          href="#pages"
          aria-label="Minnumst story desk"
        >
          MINNUMST<span>.</span>
        </a>
        <p className="sidebar-caption">EDITORIAL DESK</p>
        <nav className="studio-nav">
          <a
            className={`nav-item${view === "pages" ? " nav-item-active" : ""}`}
            href="#pages"
            aria-current={view === "pages" ? "page" : undefined}
          >
            <BookOpenText size={17} aria-hidden="true" />
            <span>People</span>
            <span className="nav-count">{pages.length}</span>
          </a>
          <a
            className={`nav-item${view === "suggestions" ? " nav-item-active" : ""}`}
            href="#suggestions"
            aria-current={view === "suggestions" ? "page" : undefined}
          >
            <Inbox size={17} aria-hidden="true" />
            <span>Suggestions</span>
            <span className="nav-count">{pendingCount}</span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-rule" />
          <p>PEOPLE · STORIES · MEMORY</p>
          <span className="workspace-label">
            <span className="workspace-dot" />
            Shared archive
          </span>
        </div>
      </aside>

      <main className="studio-main" id="pages">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>CONTENT</span>
            <span className="breadcrumb-slash">/</span>
            <strong>PEOPLE</strong>
          </div>
          <span className="topbar-mark">
            MINNUMST ADMIN
            {appConfig.debug && <span className="debug-indicator">DEBUG</span>}
          </span>
        </header>

        {view === "suggestions" && (
          <Suggestions
            onPendingChange={setPendingCount}
            onEditAccepted={handleSuggestionAccepted}
            onPersonRestored={handlePersonRestored}
          />
        )}

        <div className="main-inner" hidden={view !== "pages"}>
          <section className="page-heading" aria-labelledby="page-title">
            <div>
              <p className="eyebrow">PEOPLE AND STORIES</p>
              <h1 id="page-title">People and stories</h1>
              <p className="heading-copy">
                A page for every person, with every version of their story kept.
              </p>
            </div>
            <button
              className="new-page-button"
              type="button"
              onClick={startNewPage}
            >
              <FilePlus2 size={17} aria-hidden="true" />
              <span>New page</span>
            </button>
          </section>

          <div className="local-notice" role="note">
            <Info size={17} aria-hidden="true" />
            <p>
              <strong>Please write with care.</strong> These are real people,
              and someone&apos;s family will read this. Cite your sources, and
              leave out living people and private matters.
            </p>
          </div>

          <section className="workbench" aria-label="Page editor">
            <PageIndex
              pages={pages}
              visiblePages={visiblePages}
              selectedId={selectedId}
              filter={filter}
              emptyMessage={
                isLoading
                  ? "Loading people..."
                  : loadError ||
                    (pages.length === 0
                      ? "No people have been added yet."
                      : "No matching names.")
              }
              onFilterChange={setFilter}
              onNewPage={startNewPage}
              onSelect={(page) => void selectPost(page)}
            />

            <div className="editor-column">
              <div className="editor-toolbar">
                <div className="editor-context">
                  <span className="context-icon">
                    <BookOpenText size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <span className="context-overline">PERSON PAGE</span>
                    <strong>{personName.trim() || "New story"}</strong>
                  </div>
                </div>
                <div
                  className="editor-tabs"
                  role="tablist"
                  aria-label="Editor view"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "write"}
                    className={tab === "write" ? "active" : ""}
                    onClick={() => setTab("write")}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "preview"}
                    className={tab === "preview" ? "active" : ""}
                    onClick={() => setTab("preview")}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "history"}
                    className={tab === "history" ? "active" : ""}
                    onClick={() => setTab("history")}
                  >
                    <History size={14} aria-hidden="true" />
                    History
                    {selectedPage && <span>{revisionCount}</span>}
                  </button>
                </div>
              </div>

              {tab === "write" && (
                <form className="editor-form" onSubmit={handleSave}>
                  <div className="form-heading">
                    <div>
                      <h2>{selectedPage ? "Edit page" : "Create a page"}</h2>
                      <p>Start with the person this story belongs to.</p>
                    </div>
                  </div>

                  <label className="field-label" htmlFor="person-name">
                    Person name <span>Required</span>
                  </label>
                  <input
                    className="text-field person-field"
                    id="person-name"
                    autoComplete="off"
                    placeholder="e.g. Sigríður Jónsdóttir"
                    value={personName}
                    onChange={(event) => setPersonName(event.target.value)}
                  />

                  <div className="person-dates">
                    <div>
                      <label className="field-label" htmlFor="person-born">
                        Born <span>Year or YYYY-MM-DD</span>
                      </label>
                      <input
                        className="text-field"
                        id="person-born"
                        autoComplete="off"
                        placeholder="e.g. 1850"
                        value={birthDate}
                        onChange={(event) => setBirthDate(event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="person-died">
                        Died <span>Year or YYYY-MM-DD</span>
                      </label>
                      <input
                        className="text-field"
                        id="person-died"
                        autoComplete="off"
                        placeholder="e.g. 1921-03-14"
                        value={deathDate}
                        onChange={(event) => setDeathDate(event.target.value)}
                      />
                    </div>
                  </div>
                  <p className="person-name-note">
                    Only people who died more than five years and two months ago
                    or, with no known death, were born at least 128 years ago.
                  </p>
                  {selectedPage && (
                    <div className="person-name-actions">
                      <p className="person-name-note">
                        Updates the shared public profile without changing story
                        history.
                      </p>
                      <button
                        className="name-update-button"
                        type="button"
                        disabled={
                          isSaving || !personName.trim() || personIsUnchanged
                        }
                        onClick={() => void handleRenamePerson(selectedPage)}
                      >
                        Update person
                      </button>
                      <button
                        className="name-update-button"
                        type="button"
                        disabled={isSaving}
                        onClick={() => void handleHidePerson(selectedPage)}
                      >
                        Hide from public
                      </button>
                    </div>
                  )}

                  <label className="field-label" htmlFor="page-title-input">
                    Page title <span>Required</span>
                  </label>
                  <input
                    className="text-field title-field"
                    id="page-title-input"
                    placeholder="Give this story a title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />

                  <label className="field-label" htmlFor="page-excerpt">
                    Introduction <span>Optional</span>
                  </label>
                  <textarea
                    className="text-field excerpt-field"
                    id="page-excerpt"
                    placeholder="A short introduction to the story"
                    rows={2}
                    value={excerpt}
                    onChange={(event) => setExcerpt(event.target.value)}
                  />

                  <label className="field-label" htmlFor="page-content">
                    Story <span>Required</span>
                  </label>
                  <textarea
                    className="text-field story-field"
                    id="page-content"
                    placeholder="Write the story here..."
                    rows={10}
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                  />

                  <label className="field-label" htmlFor="change-note">
                    What changed? <span>Optional, for the history</span>
                  </label>
                  <input
                    className="text-field"
                    id="change-note"
                    maxLength={500}
                    autoComplete="off"
                    placeholder="e.g. Added the year of the move to Akureyri"
                    value={changeNote}
                    onChange={(event) => setChangeNote(event.target.value)}
                  />

                  <div className="form-bottom">
                    <p
                      className={`save-message${messageIsError ? " error" : ""}`}
                      role={messageIsError ? "alert" : "status"}
                      aria-live="polite"
                    >
                      {message}
                    </p>
                    <button
                      className="save-button"
                      type="submit"
                      disabled={isSaving}
                    >
                      <Save size={16} aria-hidden="true" />
                      <span>{isSaving ? "Saving..." : "Save new version"}</span>
                    </button>
                  </div>
                </form>
              )}

              {tab === "preview" && (
                <PagePreview
                  page={selectedPage}
                  title={title}
                  excerpt={excerpt}
                  content={content}
                />
              )}

              {tab === "history" && (
                <RevisionHistory
                  page={selectedPage}
                  count={revisionCount}
                  isBusy={isSaving}
                  message={message}
                  messageIsError={messageIsError}
                  onRestore={(revision) => void handleRestore(revision)}
                />
              )}
            </div>

            <PageDetails
              page={selectedPage}
              personName={personName}
              revisionCount={revisionCount}
              lastSavedAt={lastSavedAt}
            />
          </section>

          <footer className="main-footer">
            <span>
              STORY DESK <span aria-hidden="true">·</span> SHARED ARCHIVE
            </span>
            <span>
              {pages.length} {pages.length === 1 ? "PAGE" : "PAGES"}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
