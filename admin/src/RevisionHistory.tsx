import { useState } from "react";
import { Clock3, History } from "lucide-react";
import type { PersonPage, Revision } from "./api";
import { diffLines } from "./diff";

function versionText(revision: Revision): string {
  return [revision.title, revision.excerpt, revision.content]
    .filter(Boolean)
    .join("\n\n");
}

const DIFF_PREFIX = { same: "", added: "Added: ", removed: "Removed: " };

function VersionChanges({
  before,
  after,
}: {
  before: Revision;
  after: Revision;
}) {
  return (
    <ul
      className="version-diff"
      aria-label={`Changes from version ${before.revisionNumber} to ${after.revisionNumber}`}
    >
      {diffLines(versionText(before), versionText(after)).map((line, index) => (
        <li className={`diff-${line.kind}`} key={index}>
          <span className="visually-hidden">{DIFF_PREFIX[line.kind]}</span>
          {line.text || "\u00a0"}
        </li>
      ))}
    </ul>
  );
}

function RevisionHistory({
  page,
  count,
  isBusy,
  message,
  messageIsError,
  onRestore,
}: {
  page: PersonPage | null;
  count: number;
  isBusy: boolean;
  message: string;
  messageIsError: boolean;
  onRestore: (revision: Revision) => void;
}) {
  const [comparing, setComparing] = useState<number | null>(null);
  const versions = page?.revisions ?? [];

  return (
    <section className="history-view" aria-label="Version history">
      <div className="form-heading">
        <div>
          <h2>Version history</h2>
          <p>
            Every version is kept. Readers only see the current one, and going
            back publishes an earlier text as a new version.
          </p>
        </div>
        <span className="draft-tag">{count} VERSIONS</span>
      </div>
      <p
        className={`save-message${messageIsError ? " error" : ""}`}
        role={messageIsError ? "alert" : "status"}
        aria-live="polite"
      >
        {message}
      </p>
      {!page?.story && (
        <div className="history-empty">
          <History size={23} aria-hidden="true" />
          <p>Save this page to start its history.</p>
        </div>
      )}
      {page?.story && (
        <ol className="revision-list">
          {[...versions].reverse().map((revision, index) => {
            const previous = versions.find(
              (item) => item.revisionNumber === revision.revisionNumber - 1,
            );
            const isComparing = comparing === revision.revisionNumber;
            return (
              <li className="revision-item" key={revision.id}>
                <span className="revision-marker" aria-hidden="true" />
                <div className="revision-copy">
                  <div className="revision-meta">
                    <strong>
                      Version {revision.revisionNumber}
                      {index === 0 && " (current)"}
                    </strong>
                    <span>
                      <Clock3 size={13} aria-hidden="true" />
                      {new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(revision.savedAt))}
                    </span>
                  </div>
                  <p className="revision-author">
                    Saved by {revision.createdBy}
                    {revision.restoredFrom !== null &&
                      ` · restored from version ${revision.restoredFrom}`}
                  </p>
                  {revision.changeNote && (
                    <p className="revision-note">{revision.changeNote}</p>
                  )}
                  <h3>{revision.title}</h3>
                  <p>{revision.excerpt || revision.content}</p>
                  <div className="revision-actions">
                    {previous && (
                      <button
                        className="name-update-button"
                        type="button"
                        aria-expanded={isComparing}
                        onClick={() =>
                          setComparing(
                            isComparing ? null : revision.revisionNumber,
                          )
                        }
                      >
                        {isComparing
                          ? "Hide changes"
                          : `Show changes from version ${previous.revisionNumber}`}
                      </button>
                    )}
                    {index > 0 && (
                      <button
                        className="name-update-button"
                        type="button"
                        disabled={isBusy}
                        onClick={() => onRestore(revision)}
                      >
                        Publish version {revision.revisionNumber} again
                      </button>
                    )}
                  </div>
                  {isComparing && previous && (
                    <VersionChanges before={previous} after={revision} />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default RevisionHistory;
