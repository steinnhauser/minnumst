import type { PersonPost } from "./api";

function PagePreview({
  post,
  title,
  excerpt,
  content,
}: {
  post: PersonPost | null;
  title: string;
  excerpt: string;
  content: string;
}) {
  return (
    <article className="article-preview" aria-label="Page preview">
      {post && (
        <p className="preview-person">
          A STORY ABOUT {post.personName.toLocaleUpperCase()}
        </p>
      )}
      <h2>{title || "Your page title"}</h2>
      {excerpt && <p className="preview-excerpt">{excerpt}</p>}
      <div className="preview-rule" />
      <p className="preview-body">
        {content || "Your story will appear here as you write."}
      </p>
      {post && (
        <span className="preview-route">Public story · {post.slug}</span>
      )}
    </article>
  );
}

export default PagePreview;
