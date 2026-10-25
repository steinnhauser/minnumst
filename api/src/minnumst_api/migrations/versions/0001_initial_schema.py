"""Initial schema: people, their stories and append-only revisions.

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
}


def upgrade() -> None:
    op.create_table(
        "people",
        sa.Column("id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("normalized_name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_people")),
        sa.UniqueConstraint("normalized_name", name=op.f("uq_people_normalized_name")),
        sa.UniqueConstraint("slug", name=op.f("uq_people_slug")),
    )
    op.create_index(op.f("ix_people_name"), "people", ["name"])
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
    grant_runtime_privileges()


def downgrade() -> None:
    op.drop_table("blog_revisions")
    op.drop_table("blog_posts")
    op.drop_index(op.f("ix_people_name"), table_name="people")
    op.drop_table("people")


def grant_runtime_privileges() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql" or not settings.database_runtime_role:
        return
    role = bind.dialect.identifier_preparer.quote(settings.database_runtime_role)
    for table, privileges in RUNTIME_PRIVILEGES.items():
        op.execute(f"GRANT {privileges} ON {table} TO {role}")
