#!/usr/bin/env python3
"""Create or refresh deterministic sample people and append-only blog revisions."""

from __future__ import annotations

import argparse
import os

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from minnumst_api.config import settings
from minnumst_api.database import make_engine
from minnumst_api.migrate import downgrade, upgrade
from minnumst_api.models import BlogPost, BlogRevision, Person
from minnumst_api.names import normalized_person_name, unique_person_slug

SAMPLE_RECORDS = (
    {
        "name": "Sample Person - Alex Morgan",
        "title": "A life shaped by the coast",
        "excerpt": "A sample archive entry for local development.",
        "content": (
            "## Early years\n\n"
            "This fictional sample entry is here to exercise the public profile "
            "and editorial workflows. Replace or remove it when testing with "
            "real archive content.\n\n"
            "## Community\n\n"
            "This paragraph demonstrates longer-form story rendering without "
            "making claims about a real person."
        ),
    },
    {
        "name": "Sample Person - Casey River",
        "title": "Notes from a working life",
        "excerpt": "Another fictional entry for search and revision testing.",
        "content": (
            "## A beginning\n\n"
            "Use this fictional profile to test search, public details, and "
            "revision history. The seeded content is intentionally generic.\n\n"
            "## Archive note\n\n"
            "Updating the template appends a new revision; it never replaces "
            "the saved sample history."
        ),
    },
    {
        # A non-ASCII name for the accent-insensitive search (`make contract`).
        "name": "Sólveig Þorgrímsdóttir",
        "title": "A farm under the glacier",
        "excerpt": "A fictional entry with an Icelandic name.",
        "content": (
            "## The farm\n\n"
            "This fictional profile exercises names with accents and Icelandic "
            "letters. Searching for Sólveig, solveig or thorgrimsdottir finds it."
        ),
    },
)


def require_local_database() -> None:
    url = make_url(settings.database_url)
    if (
        os.environ.get("MINNUMST_ALLOW_LOCAL_RESET") != "1"
        or url.get_backend_name() != "postgresql"
        or url.host != "postgres"
        or url.database != "minnumst_local"
    ):
        raise SystemExit(
            "Refusing destructive operation: expected the local Compose "
            "minnumst_local database on the postgres service."
        )


def populate(session: Session) -> tuple[int, int, int]:
    people_created = 0
    blogs_created = 0
    revisions_added = 0

    for record in SAMPLE_RECORDS:
        normalized_name = normalized_person_name(record["name"])
        person = session.scalar(
            select(Person).where(Person.normalized_name == normalized_name)
        )
        if person is None:
            person = Person(
                name=record["name"],
                normalized_name=normalized_name,
                slug=unique_person_slug(session, record["name"]),
            )
            session.add(person)
            session.flush()
            people_created += 1

        blog = session.scalar(select(BlogPost).where(BlogPost.person_id == person.id))
        if blog is None:
            blog = BlogPost(person_id=person.id)
            session.add(blog)
            session.flush()
            blogs_created += 1

        latest = session.scalar(
            select(BlogRevision)
            .where(BlogRevision.blog_id == blog.id)
            .order_by(BlogRevision.revision_number.desc())
            .limit(1)
        )
        if latest is not None and all(
            getattr(latest, field) == record[field]
            for field in ("title", "excerpt", "content")
        ):
            continue

        session.add(
            BlogRevision(
                blog_id=blog.id,
                revision_number=(latest.revision_number if latest else 0) + 1,
                title=record["title"],
                excerpt=record["excerpt"],
                content=record["content"],
            )
        )
        revisions_added += 1

    session.commit()
    return people_created, blogs_created, revisions_added


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("seed", "update", "clear", "reset"))
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    engine = make_engine()
    if args.action in {"clear", "reset"}:
        require_local_database()
        if not args.yes:
            raise SystemExit(
                "Pass --yes after confirming this is disposable local data."
            )
        downgrade(engine)
        upgrade(engine)
        print("Cleared and re-migrated the local PostgreSQL schema.")
        if args.action == "clear":
            return

    with Session(engine) as session:
        people_created, blogs_created, revisions_added = populate(session)

    print(
        "Sample data ready: "
        f"{people_created} people created, "
        f"{blogs_created} blogs created, "
        f"{revisions_added} revisions appended."
    )


if __name__ == "__main__":
    main()
