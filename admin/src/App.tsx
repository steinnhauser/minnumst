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
  loadPeople,
  loadPersonRevisions,
  loadSuggestions,
  savePersonRevision,
  setPersonHidden,
  updatePerson,
  type PersonPost,
  type PostInput,
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
const emptyDraft: PostInput = { title: "", excerpt: "", content: "" };

function viewFromAddress() {
  return window.location.hash === "#suggestions" ? "suggestions" : "pages";
}

function App() {
  const [posts, setPosts] = useState<PersonPost[]>([]);
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
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  // The story as last loaded or saved; the editor has unsaved changes when
  // its fields differ from it.
  const [savedDraft, setSavedDraft] = useState<PostInput>(emptyDraft);
  const selectionRequest = useRef(0);
  const hasUnsavedChanges =
    title !== savedDraft.title ||
    excerpt !== savedDraft.excerpt ||
    content !== savedDraft.content;

  const selectedPost = posts.find((post) => post.id === selectedId) ?? null;
  const personIsUnchanged =
    selectedPost !== null &&
    personName.trim().replace(/\s+/g, " ") === selectedPost.personName &&
    birthDate.trim() === selectedPost.birthDate &&
    deathDate.trim() === selectedPost.deathDate;
  const activeRevision = selectedPost ? currentRevision(selectedPost) : null;
  const revisionCount =
    selectedPost?.blog?.revisionCount ?? selectedPost?.revisions.length ?? 0;
  const lastSavedAt = activeRevision?.savedAt ?? selectedPost?.blog?.savedAt;
  const visiblePosts = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return posts.filter((post) =>
      post.personName.toLocaleLowerCase().includes(query),
    );
  }, [filter, posts]);

  useEffect(() => {
    let active = true;
    void loadPeople()
      .then((people) => {
        if (active) setPosts(people);
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

  const handlePersonRestored = useCallback((person: PersonPost) => {
    setPosts((current) =>
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
      window.confirm("Discard the unsaved changes to this story?")
    );
  }

  function loadDraft(draft: PostInput) {
    setTitle(draft.title);
    setExcerpt(draft.excerpt);
    setContent(draft.content);
    setSavedDraft(draft);
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

  async function selectPost(post: PersonPost) {
    if (!confirmDiscard()) return;
    const requestId = ++selectionRequest.current;
    const revision = currentRevision(post);
    setSelectedId(post.id);
    setPersonName(post.personName);
    setBirthDate(post.birthDate);
    setDeathDate(post.deathDate);
    loadDraft({
      title: revision?.title ?? post.blog?.title ?? "",
      excerpt: revision?.excerpt ?? post.blog?.excerpt ?? "",
      content: revision?.content ?? "",
    });
    setTab("write");
    setMessage("");

    if (post.blog && post.revisions.length === 0) {
      setMessage("Loading saved revisions...");
      try {
        const revisions = await loadPersonRevisions(post.id);
        if (selectionRequest.current !== requestId) return;
        setPosts((current) =>
          current.map((item) =>
            item.id === post.id ? { ...item, revisions } : item,
          ),
        );
        const latest = revisions.at(-1);
        loadDraft({
          title: latest?.title ?? post.blog.title,
          excerpt: latest?.excerpt ?? post.blog.excerpt,
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
    if (
      selectedPost &&
      personName.trim().replace(/\s+/g, " ") !== selectedPost.personName
    ) {
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
    setIsSaving(true);
    try {
      let person = selectedPost;
      if (!person) {
        person = await createPerson(personName, birthDate, deathDate);
        setPosts((current) => [person!, ...current]);
        setSelectedId(person.id);
        setPersonName(person.personName);
      }

      const saved = await savePersonRevision(person.id, draft);
      const savedPost: PersonPost = {
        ...person,
        blog: {
          title: saved.revision.title,
          excerpt: saved.revision.excerpt,
          savedAt: saved.revision.savedAt,
          revisionCount: saved.revisionCount,
        },
        revisions: [...person.revisions, saved.revision],
      };
      setPosts((current) =>
        current.some((item) => item.id === savedPost.id)
          ? current.map((item) => (item.id === savedPost.id ? savedPost : item))
          : [savedPost, ...current],
      );
      setSelectedId(savedPost.id);
      setPersonName(savedPost.personName);
      // Edits made while the save was in flight stay unsaved.
      setSavedDraft(draft);
      setMessage(
        `Saved to the shared archive as revision ${saved.revision.revisionNumber}.`,
      );
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
  async function handleRenamePerson(post: PersonPost) {
    setIsSaving(true);
    try {
      const updated = await updatePerson(
        post.id,
        personName,
        birthDate,
        deathDate,
      );
      const renamedPost = {
        ...post,
        personName: updated.personName,
        slug: updated.slug,
        birthDate: updated.birthDate,
        deathDate: updated.deathDate,
      };
      setPosts((current) =>
        current.map((post) =>
          post.id === renamedPost.id ? renamedPost : post,
        ),
      );
      setPersonName(renamedPost.personName);
      setMessage("Person updated in the shared archive.");
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

  // An accepted edit is a new revision, so the desk's copy of that story is stale:
  // drop the loaded history, and reload it if the person is open in the editor.
  function handleSuggestionAccepted(suggestion: Suggestion) {
    const post = posts.find((item) => item.id === suggestion.person_id);
    const revision = suggestion.current_revision;
    if (!post || !revision) return;
    const updated: PersonPost = {
      ...post,
      blog: {
        title: revision.title,
        excerpt: revision.excerpt,
        savedAt: revision.saved_at,
        revisionCount: revision.revision_number,
      },
      revisions: [],
    };
    setPosts((current) =>
      current.map((item) => (item.id === post.id ? updated : item)),
    );
    if (post.id === selectedId) void selectPost(updated);
  }

  // A removal request is met by hiding the page: everything stays on record.
  async function handleHidePerson(post: PersonPost) {
    if (!confirmDiscard()) return;
    setIsSaving(true);
    try {
      await setPersonHidden(post.id, true);
      setPosts((current) => current.filter((item) => item.id !== post.id));
      selectionRequest.current += 1;
      setSelectedId(null);
      setPersonName("");
      setBirthDate("");
      setDeathDate("");
      loadDraft(emptyDraft);
      setMessage(`${post.personName} is now hidden from the public.`);
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
            <span>Blog pages</span>
            <span className="nav-count">{posts.length}</span>
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
              <p className="eyebrow">STORY COLLECTION</p>
              <h1 id="page-title">Blog pages</h1>
              <p className="heading-copy">
                A page for every person, with each edit kept in its history.
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
              <strong>Shared archive.</strong> People and story revisions are
              loaded from and saved through the central API.
            </p>
          </div>

          <section className="workbench" aria-label="Blog page editor">
            <PageIndex
              posts={posts}
              visiblePosts={visiblePosts}
              selectedId={selectedId}
              filter={filter}
              emptyMessage={
                isLoading
                  ? "Loading people..."
                  : loadError ||
                    (posts.length === 0
                      ? "No people have been added yet."
                      : "No matching names.")
              }
              onFilterChange={setFilter}
              onNewPage={startNewPage}
              onSelect={(post) => void selectPost(post)}
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
                    {selectedPost && <span>{revisionCount}</span>}
                  </button>
                </div>
              </div>

              {tab === "write" && (
                <form className="editor-form" onSubmit={handleSave}>
                  <div className="form-heading">
                    <div>
                      <h2>{selectedPost ? "Edit page" : "Create a page"}</h2>
                      <p>Start with the person this story belongs to.</p>
                    </div>
                    <span className="draft-tag">API VERSION</span>
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
                  {selectedPost && (
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
                        onClick={() => void handleRenamePerson(selectedPost)}
                      >
                        Update person
                      </button>
                      <button
                        className="name-update-button"
                        type="button"
                        disabled={isSaving}
                        onClick={() => void handleHidePerson(selectedPost)}
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
                      <span>{isSaving ? "Saving..." : "Save revision"}</span>
                    </button>
                  </div>
                </form>
              )}

              {tab === "preview" && (
                <PagePreview
                  post={selectedPost}
                  title={title}
                  excerpt={excerpt}
                  content={content}
                />
              )}

              {tab === "history" && (
                <RevisionHistory post={selectedPost} count={revisionCount} />
              )}
            </div>

            <PageDetails
              post={selectedPost}
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
              {posts.length} {posts.length === 1 ? "PAGE" : "PAGES"}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
