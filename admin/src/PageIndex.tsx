import { FilePlus2, Search } from "lucide-react";
import { currentRevision, type PersonPage } from "./api";

function PageIndex({
  pages,
  visiblePages,
  selectedId,
  filter,
  emptyMessage,
  onFilterChange,
  onNewPage,
  onSelect,
}: {
  pages: readonly PersonPage[];
  visiblePages: readonly PersonPage[];
  selectedId: string | null;
  filter: string;
  emptyMessage: string;
  onFilterChange: (filter: string) => void;
  onNewPage: () => void;
  onSelect: (page: PersonPage) => void;
}) {
  return (
    <aside className="page-index" aria-label="Saved pages">
      <div className="index-heading">
        <div>
          <h2>Pages</h2>
          <span>{pages.length} total</span>
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
        {visiblePages.map((page) => {
          const revision = currentRevision(page);
          return (
            <button
              className={`page-list-item${selectedId === page.id ? " selected" : ""}`}
              type="button"
              key={page.id}
              onClick={() => onSelect(page)}
              aria-current={selectedId === page.id ? "page" : undefined}
            >
              <span className="page-initial" aria-hidden="true">
                {page.personName.charAt(0).toLocaleUpperCase()}
              </span>
              <span className="page-list-copy">
                <strong>{page.personName}</strong>
                <span>
                  {revision?.title || page.story?.title || "No story yet"}
                </span>
              </span>
              <span
                className="draft-indicator"
                aria-label="Saved in shared archive"
              />
            </button>
          );
        })}
        {visiblePages.length === 0 && (
          <p className="index-empty">{emptyMessage}</p>
        )}
      </div>
    </aside>
  );
}

export default PageIndex;
