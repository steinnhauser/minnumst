import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from minnumst_api import migrate
from minnumst_api.config import settings
from minnumst_api.database import make_engine
from minnumst_api.migrate import downgrade, upgrade
from minnumst_api.models import Base


@pytest.fixture
def engine() -> Iterator[Engine]:
    engine = make_engine("sqlite://")
    yield engine
    engine.dispose()


@pytest.fixture
def cli_engines(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[list[Engine]]:
    """Points the CLI at a file database and disposes the engines it creates."""
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path}/cli.db")
    engines: list[Engine] = []

    def tracked_engine(database_url: str | None = None) -> Engine:
        engines.append(make_engine(database_url))
        return engines[-1]

    monkeypatch.setattr(migrate, "make_engine", tracked_engine)
    yield engines
    for created in engines:
        created.dispose()


def run_cli(monkeypatch: pytest.MonkeyPatch, *args: str) -> None:
    monkeypatch.setattr("sys.argv", ["minnumst_api.migrate", *args])
    migrate.main()


def table_names(database_url: str) -> set[str]:
    engine = make_engine(database_url)
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_migrations_produce_exactly_the_models_schema(engine: Engine) -> None:
    upgrade(engine)

    with engine.connect() as connection:
        differences = compare_metadata(
            MigrationContext.configure(connection), Base.metadata
        )

    assert differences == []


def test_migrations_downgrade_to_an_empty_database_and_back(engine: Engine) -> None:
    upgrade(engine)
    downgrade(engine)

    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    upgrade(engine)
    assert {"people", "blog_posts", "blog_revisions"} <= set(
        inspect(engine).get_table_names()
    )


def test_cli_upgrades_by_default_and_downgrades_to_a_revision(
    cli_engines: list[Engine], monkeypatch: pytest.MonkeyPatch
) -> None:
    tables = {"people", "blog_posts", "blog_revisions"}

    run_cli(monkeypatch)
    assert tables <= table_names(settings.database_url)

    run_cli(monkeypatch, "downgrade", "base")
    assert not tables & table_names(settings.database_url)
    assert len(cli_engines) == 2


def test_cli_revision_writes_an_empty_migration_when_models_match_head(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    migrations = tmp_path / "migrations"
    shutil.copytree(
        migrate.MIGRATIONS, migrations, ignore=shutil.ignore_patterns("__pycache__")
    )
    monkeypatch.setattr(migrate, "MIGRATIONS", migrations)
    existing = set((migrations / "versions").glob("*.py"))

    run_cli(monkeypatch, "revision", "nothing changed")

    [generated] = set((migrations / "versions").glob("*.py")) - existing
    source = generated.read_text(encoding="utf-8")
    assert "nothing changed" in source
    assert "down_revision = '0001'" in source
    assert "op." not in source
