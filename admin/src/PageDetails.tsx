import { AlertTriangle } from "lucide-react";
import type { PersonPage } from "./api";

function PageDetails({
  page,
  personName,
  revisionCount,
  lastSavedAt,
}: {
  page: PersonPage | null;
  personName: string;
  revisionCount: number;
  lastSavedAt: string | undefined;
}) {
  return (
    <aside className="details-panel" aria-label="Page details">
      <div className="details-heading">
        <h2>Page details</h2>
      </div>
      <div className="detail-block">
        <span className="detail-label">PERSON</span>
        <strong>{personName.trim() || "Not assigned"}</strong>
      </div>
      <div className="detail-block">
        <span className="detail-label">PAGE ADDRESS</span>
        <code>
          /people/
          {page?.slug || (personName ? "..." : "person-name")}
        </code>
        <span className="detail-note">
          {page ? "The public address" : "Set when the page is saved"}
        </span>
      </div>

      <div className="detail-block">
        <span className="detail-label">HISTORY</span>
        <strong>
          {revisionCount} saved
          {revisionCount === 1 ? " version" : " versions"}
        </strong>
        <span className="detail-note">
          {lastSavedAt
            ? `Last saved ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(lastSavedAt))}`
            : "No versions saved"}
        </span>
      </div>
      <div className="details-warning">
        <AlertTriangle size={15} aria-hidden="true" />
        <p>
          Each save publishes a new version straight away. Earlier versions stay
          in the history.
        </p>
      </div>
    </aside>
  );
}

export default PageDetails;
