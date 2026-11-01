import type { PersonPage } from "./api";

function PagePreview({
  page,
  title,
  excerpt,
  content,
}: {
  page: PersonPage | null;
  title: string;
  excerpt: string;
  content: string;
}) {
  return (
    <article className="article-preview" aria-label="Page preview">
      {page && (
        <p className="preview-person">
          A STORY ABOUT {page.personName.toLocaleUpperCase()}
        </p>
      )}
      <h2>{title || "Your page title"}</h2>
      {excerpt && <p className="preview-excerpt">{excerpt}</p>}
      <div className="preview-rule" />
      <p className="preview-body">
        {content || "Your story will appear here as you write."}
      </p>
      {page && (
        <span className="preview-route">Public story · {page.slug}</span>
      )}
    </article>
  );
}

export default PagePreview;
