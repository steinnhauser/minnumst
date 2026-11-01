const REPOSITORY = "https://github.com/steinnhauser/minnumst";

function SiteFooter({ contact }: { contact: string }) {
  return (
    <footer className="site-footer">
      <div>
        <p className="eyebrow">MINNUMST</p>
        <p>© 2026 Steinn Hauser Magnússon</p>
        <p>Stories remain with their authors and sources.</p>
        <a href={`mailto:${contact}`}>{contact}</a>
      </div>
      <nav aria-label="Project">
        <p className="eyebrow">OPEN SOURCE</p>
        <a href={REPOSITORY} rel="noreferrer">
          Source code on GitHub
        </a>
        <a href={`${REPOSITORY}/blob/main/LICENSE`} rel="noreferrer">
          Code licensed under Apache-2.0
        </a>
        <a href={`${REPOSITORY}/security/policy`} rel="noreferrer">
          Report a security issue
        </a>
      </nav>
      <div>
        <p className="eyebrow">PEOPLE AND DATA</p>
        <p>
          This archive only holds people who died more than five years ago, and
          it uses no tracking or analytics.
        </p>
        <a href={`${REPOSITORY}#data-protection-and-sources`} rel="noreferrer">
          Data protection and sources
        </a>
        <a
          href="https://images.unsplash.com/photo-1551632811-561732d1e306"
          rel="noreferrer"
        >
          Landing photograph from Unsplash
        </a>
      </div>
    </footer>
  );
}

export default SiteFooter;
