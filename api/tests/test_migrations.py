from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from minnumst_api.database import make_engine
from minnumst_api.migrate import downgrade, upgrade
from minnumst_api.models import Base


def test_migrations_produce_exactly_the_models_schema() -> None:
    engine = make_engine("sqlite://")
    upgrade(engine)

    with engine.connect() as connection:
        differences = compare_metadata(
            MigrationContext.configure(connection), Base.metadata
        )

    assert differences == []


def test_migrations_downgrade_to_an_empty_database_and_back() -> None:
    engine = make_engine("sqlite://")
    upgrade(engine)
    downgrade(engine)

    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    upgrade(engine)
    assert {"people", "blog_posts", "blog_revisions"} <= set(
        inspect(engine).get_table_names()
    )
