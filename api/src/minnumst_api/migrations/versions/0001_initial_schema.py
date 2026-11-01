"""Initial schema: people, sources, stories, revisions and suggestions.

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op

from minnumst_api.config import settings

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# What the API's runtime role may do. Revisions are append-only: the role can
# read and insert them but never update or delete them. Updating a story row is
# allowed only because saving a revision locks it with SELECT ... FOR UPDATE.
RUNTIME_PRIVILEGES = {
    "people": "SELECT, INSERT, UPDATE, DELETE",
    "blog_posts": "SELECT, INSERT, UPDATE",
    "blog_revisions": "SELECT, INSERT",
    "person_sources": "SELECT, INSERT, DELETE",
    "suggestions": "SELECT, INSERT, UPDATE, DELETE",
}


def upgrade() -> None:
    op.create_table(
        "people",
        sa.Column("id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("normalized_name", sa.String(length=255), nullable=False),
        sa.Column("birth_date", sa.String(length=10), nullable=True),
        sa.Column("death_date", sa.String(length=10), nullable=True),
        sa.Column("identity", sa.String(length=300), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_people")),
        sa.UniqueConstraint("identity", name=op.f("uq_people_identity")),
        sa.UniqueConstraint("slug", name=op.f("uq_people_slug")),
    )
    op.create_index(op.f("ix_people_name"), "people", ["name"])
    op.create_table(
        "person_sources",
        sa.Column("id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("person_id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.ForeignKeyConstraint(
            ["person_id"],
            ["people.id"],
            name=op.f("fk_person_sources_person_id_people"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_person_sources")),
        sa.UniqueConstraint(
            "source", "external_id", name=op.f("uq_person_sources_source")
        ),
    )
    op.create_index(
        op.f("ix_person_sources_person_id"), "person_sources", ["person_id"]
    )
    op.create_table(
        "blog_posts",
        sa.Column("id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("person_id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["person_id"],
            ["people.id"],
            name=op.f("fk_blog_posts_person_id_people"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_blog_posts")),
        sa.UniqueConstraint("person_id", name=op.f("uq_blog_posts_person_id")),
    )
    op.create_table(
        "blog_revisions",
        sa.Column("id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("blog_id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "revision_number >= 1",
            name=op.f("ck_blog_revisions_revision_number_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["blog_id"],
            ["blog_posts.id"],
            name=op.f("fk_blog_revisions_blog_id_blog_posts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_blog_revisions")),
        sa.UniqueConstraint(
            "blog_id", "revision_number", name=op.f("uq_blog_revisions_blog_id")
        ),
    )
    op.create_table(
        "suggestions",
        sa.Column("id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("person_id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("base_revision_number", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("excerpt", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.String(length=255), nullable=True),
        sa.Column("revision_id", sa.Uuid(as_uuid=False), nullable=True),
        sa.CheckConstraint(
            "kind IN ('edit', 'request')", name=op.f("ck_suggestions_kind_known")
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected')",
            name=op.f("ck_suggestions_status_known"),
        ),
        sa.ForeignKeyConstraint(
            ["person_id"],
            ["people.id"],
            name=op.f("fk_suggestions_person_id_people"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["revision_id"],
            ["blog_revisions.id"],
            name=op.f("fk_suggestions_revision_id_blog_revisions"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_suggestions")),
    )
    op.create_index(op.f("ix_suggestions_person_id"), "suggestions", ["person_id"])
    op.create_index(op.f("ix_suggestions_status"), "suggestions", ["status"])
    grant_runtime_privileges()


def downgrade() -> None:
    op.drop_table("suggestions")
    op.drop_table("blog_revisions")
    op.drop_table("blog_posts")
    op.drop_table("person_sources")
    op.drop_index(op.f("ix_people_name"), table_name="people")
    op.drop_table("people")


def grant_runtime_privileges() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql" or not settings.database_runtime_role:
        return
    role = bind.dialect.identifier_preparer.quote(settings.database_runtime_role)
    for table, privileges in RUNTIME_PRIVILEGES.items():
        op.execute(f"GRANT {privileges} ON {table} TO {role}")
