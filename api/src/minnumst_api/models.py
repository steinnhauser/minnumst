from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    MetaData,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

SuggestionKind = Literal["edit", "request"]
SuggestionStatus = Literal["pending", "accepted", "rejected"]


class UTCDateTime(TypeDecorator[datetime]):
    """A timestamp stored and returned in UTC on every backend.

    PostgreSQL's timestamptz returns aware values, but SQLite drops the zone,
    so naive values read back (or written) are taken to be UTC.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(
        self,
        value: datetime | None,
        dialect: Dialect,  # noqa: ARG002 - SQLAlchemy's signature
    ) -> datetime | None:
        return None if value is None else as_utc(value)

    def process_result_value(
        self,
        value: datetime | None,
        dialect: Dialect,  # noqa: ARG002 - SQLAlchemy's signature
    ) -> datetime | None:
        return None if value is None else as_utc(value)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class Base(DeclarativeBase):
    # Deterministic constraint names, so migrations can refer to them.
    metadata = MetaData(
        naming_convention={
            "pk": "pk_%(table_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ix": "ix_%(column_0_label)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
        }
    )


class Person(Base):
    __tablename__ = "people"
    __table_args__ = (UniqueConstraint("identity"),)

    id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    normalized_name: Mapped[str] = mapped_column(String(600), nullable=False)
    # What searches match against, and what lists sort by (names.py).
    search_name: Mapped[str] = mapped_column(String(600), nullable=False)
    sort_name: Mapped[str] = mapped_column(String(600), nullable=False, index=True)
    # Partial ISO 8601 dates, YYYY or YYYY-MM-DD: old records often give a year.
    birth_date: Mapped[str | None] = mapped_column(String(10))
    death_date: Mapped[str | None] = mapped_column(String(10))
    # Many people share a name, so the name and dates together identify a person.
    identity: Mapped[str] = mapped_column(String(630), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    # A hidden person is left out of everything the public can read.
    hidden_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    story: Mapped[Story | None] = relationship(back_populates="person", uselist=False)
    sources: Mapped[list[PersonSource]] = relationship(
        back_populates="person",
        cascade="all, delete-orphan",
        order_by="PersonSource.title",
    )
    suggestions: Mapped[list[Suggestion]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )


class PersonSource(Base):
    """A link to where a person's details came from; never copied source text."""

    __tablename__ = "person_sources"
    __table_args__ = (UniqueConstraint("source", "external_id"),)

    id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    person_id: Mapped[str] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)

    person: Mapped[Person] = relationship(back_populates="sources")


class Story(Base):
    __tablename__ = "stories"

    id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    person_id: Mapped[str] = mapped_column(
        ForeignKey("people.id", ondelete="RESTRICT"), nullable=False, unique=True
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(UTC), nullable=False
    )

    person: Mapped[Person] = relationship(back_populates="story")
    # Revisions are append-only: the ORM never cascades deletes to them, and
    # the database refuses to delete a story that has revisions.
    revisions: Mapped[list[StoryRevision]] = relationship(
        back_populates="story",
        cascade="save-update, merge",
        passive_deletes="all",
        order_by="StoryRevision.revision_number",
    )


class StoryRevision(Base):
    __tablename__ = "story_revisions"
    __table_args__ = (
        UniqueConstraint("story_id", "revision_number"),
        CheckConstraint("revision_number >= 1", name="revision_number_positive"),
    )

    id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="RESTRICT"), nullable=False
    )
    revision_number: Mapped[int] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(UTC), nullable=False
    )
    # For editors only: who saved this version, why, and what it was restored from.
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    change_note: Mapped[str | None] = mapped_column(String(500))
    restored_from: Mapped[int | None] = mapped_column()

    story: Mapped[Story] = relationship(back_populates="revisions")


class Suggestion(Base):
    """A visitor's proposed change, waiting for an editor's decision.

    Visitors are anonymous, so nothing here identifies them. A decision clears
    the proposed text: accepted text lives on as a revision, and rejected text
    may be exactly what shouldn't be kept. Only who decided, and when, remains.
    """

    __tablename__ = "suggestions"
    __table_args__ = (
        CheckConstraint("kind IN ('edit', 'request')", name="kind_known"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected')", name="status_known"
        ),
    )

    id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    person_id: Mapped[str] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[SuggestionKind] = mapped_column(String(10), nullable=False)
    status: Mapped[SuggestionStatus] = mapped_column(
        String(10), nullable=False, default="pending", index=True
    )
    # The revision the visitor was reading, so an editor can see if it has moved on.
    base_revision_number: Mapped[int | None] = mapped_column()
    title: Mapped[str | None] = mapped_column(String(255))
    excerpt: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(UTC), nullable=False
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    reviewed_by: Mapped[str | None] = mapped_column(String(255))
    revision_id: Mapped[str | None] = mapped_column(
        ForeignKey("story_revisions.id", ondelete="RESTRICT")
    )

    person: Mapped[Person] = relationship(back_populates="suggestions")
