import { Clock3, History } from "lucide-react";
import type { PersonPost } from "./api";

function RevisionHistory({
  post,
  count,
}: {
  post: PersonPost | null;
  count: number;
}) {
  return (
    <section className="history-view" aria-label="Revision history">
      <div className="form-heading">
        <div>
          <h2>Revision history</h2>
          <p>Earlier versions are retained when you save edits.</p>
        </div>
        <span className="draft-tag">{count} VERSIONS</span>
      </div>
      {(!post || !post.blog) && (
        <div className="history-empty">
          <History size={23} aria-hidden="true" />
          <p>Save this page to start its history.</p>
        </div>
      )}
      {post?.blog && (
        <ol className="revision-list">
          {[...post.revisions].reverse().map((revision, index) => (
            <li className="revision-item" key={revision.id}>
              <span className="revision-marker" aria-hidden="true" />
              <div className="revision-copy">
                <div className="revision-meta">
                  <strong>
                    {index === 0 ? "Current version" : "Saved version"}
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
  );
}

export default RevisionHistory;
