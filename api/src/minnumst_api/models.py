from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


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
    __table_args__ = (UniqueConstraint("normalized_name"),)

    id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    normalized_name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    blog: Mapped[BlogPost | None] = relationship(back_populates="person", uselist=False)


class BlogPost(Base):
    __tablename__ = "blog_posts"

    id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    person_id: Mapped[str] = mapped_column(
        ForeignKey("people.id", ondelete="RESTRICT"), nullable=False, unique=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    person: Mapped[Person] = relationship(back_populates="blog")
    # Revisions are append-only: the ORM never cascades deletes to them, and
    # the database refuses to delete a story that has revisions.
    revisions: Mapped[list[BlogRevision]] = relationship(
        back_populates="blog",
        cascade="save-update, merge",
        passive_deletes="all",
        order_by="BlogRevision.revision_number",
    )


class BlogRevision(Base):
    __tablename__ = "blog_revisions"
    __table_args__ = (
        UniqueConstraint("blog_id", "revision_number"),
        CheckConstraint("revision_number >= 1", name="revision_number_positive"),
    )

    id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    blog_id: Mapped[str] = mapped_column(
        ForeignKey("blog_posts.id", ondelete="RESTRICT"), nullable=False
    )
    revision_number: Mapped[int] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    blog: Mapped[BlogPost] = relationship(back_populates="revisions")
