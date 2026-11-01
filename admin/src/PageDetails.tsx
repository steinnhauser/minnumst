import { AlertTriangle } from "lucide-react";
import type { PersonPost } from "./api";
import { appConfig } from "./config";

function PageDetails({
  post,
  personName,
  revisionCount,
  lastSavedAt,
}: {
  post: PersonPost | null;
  personName: string;
  revisionCount: number;
  lastSavedAt: string | undefined;
}) {
  return (
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
          {post?.slug || (personName ? "..." : "person-name")}
        </code>
        <span className="detail-note">Preview route · not published</span>
      </div>
      <div className="detail-block">
        <span className="detail-label">API BASE URL</span>
        <strong>{appConfig.apiUrl}</strong>
        <span className="detail-note">Shared API origin</span>
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
          Each save creates a new revision; previous versions remain available
          in history.
        </p>
      </div>
      <p className="main-site-link">Public profiles read from this archive.</p>
    </aside>
  );
}

export default PageDetails;
