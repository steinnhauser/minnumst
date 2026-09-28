import { useState, type FormEvent } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import "./App.css";

function App() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMessage, setSearchMessage] = useState("");

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!searchTerm.trim()) {
      setSearchMessage("Enter a name to search the directory.");
      return;
    }

    setSearchMessage(
      `Your search for “${searchTerm.trim()}” is ready when the directory is connected.`,
    );
  }

  return (
    <main className="page-shell">
      <section
        className="search-panel"
        id="search"
        aria-labelledby="page-title"
      >
        <header className="site-header">
          <a className="wordmark" href="#search" aria-label="Eftirmal home">
            EFTIRMAL<span>.</span>
          </a>
          <p className="header-note">A PUBLIC PEOPLE ARCHIVE</p>
        </header>

        <div className="search-content">
          <p className="eyebrow">
            <span className="eyebrow-mark" aria-hidden="true" />
            STORIES, PHOTOGRAPHS, LIVES
          </p>
          <h1 id="page-title">Find a person.</h1>
          <p className="intro-copy">
            Explore articles, photographs, and details from Icelandic lives.
          </p>

          <form className="search-form" onSubmit={handleSearch} role="search">
            <label htmlFor="person-search">Search by name</label>
            <div className="search-control">
              <Search size={20} strokeWidth={1.8} aria-hidden="true" />
              <input
                id="person-search"
                type="search"
                placeholder="Search for a persons details..."
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setSearchMessage("");
                }}
                autoComplete="off"
              />
            </div>
            <button className="search-button" type="submit">
              <span>Search</span>
              <ArrowUpRight size={18} strokeWidth={2} aria-hidden="true" />
            </button>
            <p className="search-message" role="status" aria-live="polite">
              {searchMessage}
            </p>
          </form>

          <p className="public-note">
            <span aria-hidden="true" />
            Public access · No sign-in required
          </p>
        </div>

        <footer className="panel-footer">
          <a href="#about">
            About the archive <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <span>ICELAND · PEOPLE · MEMORY</span>
        </footer>
      </section>

      <figure className="photo-panel">
        <img
          src="/people-on-the-trail.jpg"
          alt="A group of hikers crossing a green mountain trail"
        />
        <figcaption className="photo-caption">
          <span>THE STORIES THAT MAKE A PLACE</span>
          <p>
            Remembered
            <br />
            together.
          </p>
        </figcaption>
        <span className="photo-index">01 / PEOPLE &amp; PLACE</span>
      </figure>

      <section
        className="about-strip"
        id="about"
        aria-label="About the archive"
      >
        <p className="eyebrow">A SHARED RECORD</p>
        <p>
          A growing collection of stories, photographs, and details about people
          and the lives they have shaped.
        </p>
      </section>
    </main>
  );
}

export default App;
