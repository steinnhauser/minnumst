import { useMemo, useState, type FormEvent } from "react";
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
  currentRevision,
  loadPosts,
  personKey,
  persistPosts,
  savePersonPost,
  type PersonPost,
} from "./posts";
import { appConfig } from "./config";
import "./App.css";

type EditorTab = "write" | "preview" | "history";

function App() {
  const [posts, setPosts] = useState<PersonPost[]>(loadPosts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<EditorTab>("write");
  const [filter, setFilter] = useState("");
  const [personName, setPersonName] = useState("");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  const selectedPost = posts.find((post) => post.id === selectedId) ?? null;
  const activeRevision = selectedPost ? currentRevision(selectedPost) : null;
  const visiblePosts = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return posts.filter((post) =>
      post.personName.toLocaleLowerCase().includes(query),
    );
  }, [filter, posts]);

  function startNewPage() {
    setSelectedId(null);
    setPersonName("");
    setTitle("");
    setExcerpt("");
    setContent("");
    setTab("write");
    setMessage("");
  }

  function selectPost(post: PersonPost) {
    const revision = currentRevision(post);
    setSelectedId(post.id);
    setPersonName(post.personName);
    setTitle(revision?.title ?? "");
    setExcerpt(revision?.excerpt ?? "");
    setContent(revision?.content ?? "");
    setTab("write");
    setMessage("");
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!personName.trim() || !title.trim() || !content.trim()) {
      setMessage("Add a person name, page title, and story before saving.");
      setMessageIsError(true);
      return;
    }

    try {
      const updatedPosts = savePersonPost(
        posts,
        { personName, title, excerpt, content },
        new Date().toISOString(),
      );
      persistPosts(updatedPosts);
      const savedPost =
        updatedPosts.find((post) => post.personKey === personKey(personName)) ??
        updatedPosts[0];
      setPosts(updatedPosts);
      setSelectedId(savedPost.id);
      setPersonName(savedPost.personName);
      setMessage("Draft saved in this browser.");
      setMessageIsError(false);
    } catch {
      setMessage(
        "This browser could not store the draft. Check storage settings and try again.",
      );
      setMessageIsError(true);
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
            Local workspace
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
              <strong>Local drafts only.</strong> Pages are saved in this
              browser and are not visible on the public site yet.
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
                        <span>{revision?.title || "Untitled page"}</span>
                      </span>
                      <span
                        className="draft-indicator"
                        aria-label="Local draft"
                      />
                    </button>
                  );
                })}
                {visiblePosts.length === 0 && (
                  <p className="index-empty">
                    {posts.length === 0
                      ? "Your pages will appear here."
                      : "No matching names."}
                  </p>
                )}
              </div>
              <div className="index-footer">
                <span className="draft-indicator" aria-hidden="true" />
                <span>Saved on this device</span>
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
                    {selectedPost && (
                      <span>{selectedPost.revisions.length}</span>
                    )}
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
                    <span className="draft-tag">DRAFT</span>
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
                    disabled={Boolean(selectedPost)}
                    onChange={(event) => setPersonName(event.target.value)}
                  />

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
                    <button className="save-button" type="submit">
                      <Save size={16} aria-hidden="true" />
                      <span>Save draft</span>
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
                      /people/{selectedPost.slug}
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
                    <span className="draft-tag">
                      {selectedPost?.revisions.length ?? 0} VERSIONS
                    </span>
                  </div>
                  {!selectedPost && (
                    <div className="history-empty">
                      <History size={23} aria-hidden="true" />
                      <p>Save this page to start its history.</p>
                    </div>
                  )}
                  {selectedPost && (
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
                  <span /> LOCAL
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
                <span className="detail-note">
                  {appConfig.apiUrl
                    ? "Configured · CRUD integration pending"
                    : "Set VITE_API_URL when the API is available"}
                </span>
              </div>
              <div className="detail-block">
                <span className="detail-label">HISTORY</span>
                <strong>
                  {selectedPost?.revisions.length ?? 0} saved
                  {(selectedPost?.revisions.length ?? 0) === 1
                    ? " version"
                    : " versions"}
                </strong>
                <span className="detail-note">
                  {activeRevision
                    ? `Last saved ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(activeRevision.savedAt))}`
                    : "No versions saved"}
                </span>
              </div>
              <div className="details-warning">
                <AlertTriangle size={15} aria-hidden="true" />
                <p>
                  Local browser storage is temporary and is not shared with the
                  archive.
                </p>
              </div>
              <p className="main-site-link">
                Public site connection unavailable
              </p>
            </aside>
          </section>

          <footer className="main-footer">
            <span>
              STORY DESK <span aria-hidden="true">·</span> LOCAL MODE
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
