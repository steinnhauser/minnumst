import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  BookOpenText,
  Clock3,
  FilePlus2,
  History,
  Info,
  Search,
  Save,
} from "lucide-react";
import {
  createPerson,
  currentRevision,
  loadPeople,
  loadPersonRevisions,
  savePersonRevision,
  updatePersonName,
  type PersonPost,
} from "./api";
import { appConfig } from "./config";
import "./App.css";

type EditorTab = "write" | "preview" | "history";

function App() {
  const [posts, setPosts] = useState<PersonPost[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<EditorTab>("write");
  const [filter, setFilter] = useState("");
  const [personName, setPersonName] = useState("");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const selectionRequest = useRef(0);

  const selectedPost = posts.find((post) => post.id === selectedId) ?? null;
  const activeRevision = selectedPost ? currentRevision(selectedPost) : null;
  const revisionCount =
    selectedPost?.blog?.revisionCount ?? selectedPost?.revisions.length ?? 0;
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
          setLoadError(
            error instanceof Error ? error.message : "Could not load people.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function startNewPage() {
    selectionRequest.current += 1;
    setSelectedId(null);
    setPersonName("");
    setTitle("");
    setExcerpt("");
    setContent("");
    setTab("write");
    setMessage("");
  }

  async function selectPost(post: PersonPost) {
    const requestId = ++selectionRequest.current;
    const revision = currentRevision(post);
    setSelectedId(post.id);
    setPersonName(post.personName);
    setTitle(revision?.title ?? post.blog?.title ?? "");
    setExcerpt(revision?.excerpt ?? post.blog?.excerpt ?? "");
    setContent(revision?.content ?? "");
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
        setTitle(latest?.title ?? post.blog?.title ?? "");
        setExcerpt(latest?.excerpt ?? post.blog.excerpt);
        setContent(latest?.content ?? "");
        setMessage("");
      } catch (error) {
        if (selectionRequest.current === requestId) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load this page's history.",
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

    setIsSaving(true);
    try {
      let person = selectedPost;
      if (!person) {
        person = await createPerson(personName);
        setPosts((current) => [person!, ...current]);
        setSelectedId(person.id);
        setPersonName(person.personName);
      }

      const saved = await savePersonRevision(person.id, {
        title,
        excerpt,
        content,
      });
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
      setMessage(
        `Saved to the shared archive as revision ${saved.revision.revisionNumber}.`,
      );
      setMessageIsError(false);
    } catch (error) {
      const apiMessage =
        error instanceof Error ? error.message : "The page could not be saved.";
      setMessage(
        apiMessage === "A person with this normalized name already exists"
          ? "A person with this name already exists. Select them from the pages list and save the story there."
          : apiMessage,
      );
      setMessageIsError(true);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRenamePerson() {
    if (!selectedPost) return;
    const cleanedName = personName.trim().replace(/\s+/g, " ");
    if (!cleanedName) {
      setMessage("Add a person name before updating it.");
      setMessageIsError(true);
      return;
    }
    if (cleanedName === selectedPost.personName) return;

    setIsSaving(true);
    try {
      const updated = await updatePersonName(selectedPost.id, cleanedName);
      const renamedPost = {
        ...selectedPost,
        personName: updated.personName,
        slug: updated.slug,
      };
      setPosts((current) =>
        current.map((post) =>
          post.id === renamedPost.id ? renamedPost : post,
        ),
      );
      setPersonName(renamedPost.personName);
      setMessage("Person name updated in the shared archive.");
      setMessageIsError(false);
    } catch (error) {
      const apiMessage =
        error instanceof Error
          ? error.message
          : "The name could not be updated.";
      setMessage(
        apiMessage === "A person with this normalized name already exists"
          ? "Another person already uses this normalized name."
          : apiMessage,
      );
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
          aria-label="Eftirmal story desk"
        >
          EFTIRMAL<span>.</span>
        </a>
        <p className="sidebar-caption">EDITORIAL DESK</p>
        <nav className="studio-nav">
          <a
            className="nav-item nav-item-active"
            href="#pages"
            aria-current="page"
          >
            <BookOpenText size={17} aria-hidden="true" />
            <span>Blog pages</span>
            <span className="nav-count">{posts.length}</span>
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
            EFTIRMAL ADMIN
            {appConfig.debug && <span className="debug-indicator">DEBUG</span>}
          </span>
        </header>

        <div className="main-inner">
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
              loaded from the central API and saved to MariaDB.
            </p>
          </div>

          <section className="workbench" aria-label="Blog page editor">
            <aside className="page-index" aria-label="Saved pages">
              <div className="index-heading">
                <div>
                  <h2>Pages</h2>
                  <span>{posts.length} total</span>
                </div>
                <button
                  className="index-add-button"
                  type="button"
                  onClick={startNewPage}
                  aria-label="Create a new page"
                  title="Create a new page"
                >
                  <FilePlus2 size={17} aria-hidden="true" />
                </button>
              </div>
              <label className="filter-control">
                <Search size={15} aria-hidden="true" />
                <span className="visually-hidden">Filter by person name</span>
                <input
                  type="search"
                  placeholder="Find a person"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </label>
              <div className="page-list">
                {visiblePosts.map((post) => {
                  const revision = currentRevision(post);
                  return (
                    <button
                      className={`page-list-item${selectedId === post.id ? " selected" : ""}`}
                      type="button"
                      key={post.id}
                      onClick={() => selectPost(post)}
                      aria-current={selectedId === post.id ? "page" : undefined}
                    >
                      <span className="page-initial" aria-hidden="true">
                        {post.personName.charAt(0).toLocaleUpperCase()}
                      </span>
                      <span className="page-list-copy">
                        <strong>{post.personName}</strong>
                        <span>
                          {revision?.title ||
                            post.blog?.title ||
                            "Untitled page"}
                        </span>
                      </span>
                      <span
                        className="draft-indicator"
                        aria-label="Saved in shared archive"
                      />
                    </button>
                  );
                })}
                {visiblePosts.length === 0 && (
                  <p className="index-empty">
                    {isLoading
                      ? "Loading people..."
                      : loadError ||
                        (posts.length === 0
                          ? "No people have been added yet."
                          : "No matching names.")}
                  </p>
                )}
              </div>
              <div className="index-footer">
                <span className="draft-indicator" aria-hidden="true" />
                <span>Shared archive</span>
              </div>
            </aside>

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
                  {selectedPost && (
                    <div className="person-name-actions">
                      <p className="person-name-note">
                        Updates the shared public profile name without changing
                        story history.
                      </p>
                      <button
                        className="name-update-button"
                        type="button"
                        disabled={
                          isSaving ||
                          !personName.trim() ||
                          personName.trim().replace(/\s+/g, " ") ===
                            selectedPost.personName
                        }
                        onClick={() => void handleRenamePerson()}
                      >
                        Update name
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
                <article className="article-preview" aria-label="Page preview">
                  {selectedPost && (
                    <p className="preview-person">
                      A STORY ABOUT{" "}
                      {selectedPost.personName.toLocaleUpperCase()}
                    </p>
                  )}
                  <h2>{title || "Your page title"}</h2>
                  {excerpt && <p className="preview-excerpt">{excerpt}</p>}
                  <div className="preview-rule" />
                  <p className="preview-body">
                    {content || "Your story will appear here as you write."}
                  </p>
                  {selectedPost && (
                    <span className="preview-route">
                      Public story · {selectedPost.slug}
                    </span>
                  )}
                </article>
              )}

              {tab === "history" && (
                <section className="history-view" aria-label="Revision history">
                  <div className="form-heading">
                    <div>
                      <h2>Revision history</h2>
                      <p>Earlier versions are retained when you save edits.</p>
                    </div>
                    <span className="draft-tag">{revisionCount} VERSIONS</span>
                  </div>
                  {(!selectedPost || !selectedPost.blog) && (
                    <div className="history-empty">
                      <History size={23} aria-hidden="true" />
                      <p>Save this page to start its history.</p>
                    </div>
                  )}
                  {selectedPost?.blog && (
                    <ol className="revision-list">
                      {[...selectedPost.revisions]
                        .reverse()
                        .map((revision, index) => (
                          <li className="revision-item" key={revision.id}>
                            <span
                              className="revision-marker"
                              aria-hidden="true"
                            />
                            <div className="revision-copy">
                              <div className="revision-meta">
                                <strong>
                                  {index === 0
                                    ? "Current version"
                                    : "Saved version"}
                                </strong>
                                <span>
                                  <Clock3 size={13} aria-hidden="true" />
                                  {new Intl.DateTimeFormat("en", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  }).format(new Date(revision.savedAt))}
                                </span>
                              </div>
                              <h3>{revision.title}</h3>
                              <p>{revision.excerpt || revision.content}</p>
                            </div>
                          </li>
                        ))}
                    </ol>
                  )}
                </section>
              )}
            </div>

            <aside className="details-panel" aria-label="Page details">
              <div className="details-heading">
                <h2>Page details</h2>
                <span className="detail-status">
                  <span /> API
                </span>
              </div>
              <div className="detail-block">
                <span className="detail-label">PERSON</span>
                <strong>{personName.trim() || "Not assigned"}</strong>
              </div>
              <div className="detail-block">
                <span className="detail-label">PAGE ADDRESS</span>
                <code>
                  /people/
                  {selectedPost?.slug || (personName ? "..." : "person-name")}
                </code>
                <span className="detail-note">
                  Preview route · not published
                </span>
              </div>
              <div className="detail-block">
                <span className="detail-label">API BASE URL</span>
                <strong>{appConfig.apiUrl || "Not configured"}</strong>
                <span className="detail-note">Shared API origin</span>
              </div>
              <div className="detail-block">
                <span className="detail-label">HISTORY</span>
                <strong>
                  {revisionCount} saved
                  {revisionCount === 1 ? " version" : " versions"}
                </strong>
                <span className="detail-note">
                  {activeRevision || selectedPost?.blog?.savedAt
                    ? `Last saved ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(activeRevision?.savedAt ?? selectedPost?.blog?.savedAt ?? ""))}`
                    : "No versions saved"}
                </span>
              </div>
              <div className="details-warning">
                <AlertTriangle size={15} aria-hidden="true" />
                <p>
                  Each save creates a new revision; previous versions remain
                  available in history.
                </p>
              </div>
              <p className="main-site-link">
                Public profiles read from this archive.
              </p>
            </aside>
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
