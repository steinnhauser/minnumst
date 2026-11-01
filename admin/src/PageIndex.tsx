import { FilePlus2, Search } from "lucide-react";
import { currentRevision, type PersonPost } from "./api";

function PageIndex({
  posts,
  visiblePosts,
  selectedId,
  filter,
  emptyMessage,
  onFilterChange,
  onNewPage,
  onSelect,
}: {
  posts: readonly PersonPost[];
  visiblePosts: readonly PersonPost[];
  selectedId: string | null;
  filter: string;
  emptyMessage: string;
  onFilterChange: (filter: string) => void;
  onNewPage: () => void;
  onSelect: (post: PersonPost) => void;
}) {
  return (
    <aside className="page-index" aria-label="Saved pages">
      <div className="index-heading">
        <div>
          <h2>Pages</h2>
          <span>{posts.length} total</span>
        </div>
        <button
          className="index-add-button"
          type="button"
          onClick={onNewPage}
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
          onChange={(event) => onFilterChange(event.target.value)}
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
              onClick={() => onSelect(post)}
              aria-current={selectedId === post.id ? "page" : undefined}
            >
              <span className="page-initial" aria-hidden="true">
                {post.personName.charAt(0).toLocaleUpperCase()}
              </span>
              <span className="page-list-copy">
                <strong>{post.personName}</strong>
                <span>
                  {revision?.title || post.blog?.title || "Untitled page"}
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
          <p className="index-empty">{emptyMessage}</p>
        )}
      </div>
      <div className="index-footer">
        <span className="draft-indicator" aria-hidden="true" />
        <span>Shared archive</span>
      </div>
    </aside>
  );
}

export default PageIndex;
