"""Import a batch of people from a reviewed file. Never part of a normal deploy.

    python -m minnumst_api.seed plan FILE    report what would happen, change nothing
    python -m minnumst_api.seed apply FILE   import the batch
    python -m minnumst_api.seed remove FILE  remove the batch's people without stories

A batch is JSON Lines, one person per line, with a list of `sources` whose first
entry identifies the person, so importing a batch twice changes nothing. Every
person passes the same checks as the API. The report only carries counts.
"""

import argparse
import json
from collections import Counter
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from minnumst_api.database import make_engine
from minnumst_api.models import Person, PersonSource
from minnumst_api.names import (
    normalized_person_name,
    person_identity,
    unique_person_slug,
)
from minnumst_api.schemas import PersonCreate


class SourceRecord(BaseModel):
    source: str = Field(min_length=1, max_length=50)
    external_id: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    url: str = Field(pattern=r"^https://", max_length=2048)


class SeedRecord(PersonCreate):
    sources: list[SourceRecord] = Field(min_length=1)


def read_batch(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as lines:
        return [json.loads(line) for line in lines if line.strip()]


def import_batch(engine: Engine, batch: list[dict], *, apply: bool) -> Counter[str]:
    report: Counter[str] = Counter()
    with Session(engine) as session:
        identities = set(session.scalars(select(Person.identity)))
        known_sources = set(
            session.execute(select(PersonSource.source, PersonSource.external_id))
        )
        for raw in batch:
            try:
                record = SeedRecord.model_validate(raw)
            except ValidationError:
                report["skipped_ineligible_or_invalid"] += 1
                continue
            if any((s.source, s.external_id) in known_sources for s in record.sources):
                report["skipped_already_imported"] += 1
                continue
            identity = person_identity(
                record.name, record.birth_date, record.death_date
            )
            if identity in identities:
                report["skipped_same_name_and_dates"] += 1
                continue
            person = Person(
                id=str(uuid4()),
                name=record.name,
                normalized_name=normalized_person_name(record.name),
                birth_date=record.birth_date,
                death_date=record.death_date,
                identity=identity,
                slug=unique_person_slug(session, record.name, record.birth_date),
            )
            person.sources = [PersonSource(**s.model_dump()) for s in record.sources]
            session.add(person)
            session.flush()
            identities.add(identity)
            known_sources.update((s.source, s.external_id) for s in record.sources)
            report["imported"] += 1
        if apply:
            session.commit()
        else:
            session.rollback()
    return report


def remove_batch(engine: Engine, batch: list[dict]) -> Counter[str]:
    """Remove the batch's people, keeping anyone who has a story by now."""
    report: Counter[str] = Counter()
    with Session(engine) as session:
        for raw in batch:
            first = raw["sources"][0]
            person = session.scalar(
                select(Person)
                .join(PersonSource)
                .where(
                    PersonSource.source == first["source"],
                    PersonSource.external_id == first["external_id"],
                )
            )
            if person is None:
                report["not_found"] += 1
            elif person.blog is not None:
                report["kept_has_a_story"] += 1
            else:
                session.delete(person)
                report["removed"] += 1
        session.commit()
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Import a batch of people")
    parser.add_argument("action", choices=("plan", "apply", "remove"))
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    engine = make_engine()
    batch = read_batch(args.file)
    report = (
        remove_batch(engine, batch)
        if args.action == "remove"
        else import_batch(engine, batch, apply=args.action == "apply")
    )
    print(json.dumps({"action": args.action, "lines": len(batch), **report}))


if __name__ == "__main__":  # pragma: no cover - entry point; tests call the functions
    main()
