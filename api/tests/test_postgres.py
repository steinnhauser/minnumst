import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ProgrammingError
from testcontainers.community.postgres import PostgresContainer

from minnumst_api.config import settings
from minnumst_api.database import make_engine
from minnumst_api.main import create_app
from minnumst_api.migrate import downgrade, upgrade

RUNTIME_ROLE = "minnumst_runtime"
INSUFFICIENT_PRIVILEGE = "42501"


@pytest.fixture(scope="module")
def database_urls() -> Iterator[tuple[str, str]]:
    """The schema owner's URL (migrations) and the API runtime role's URL."""
    if os.getenv("RUN_POSTGRES_TESTS") != "1":
        pytest.skip("Run with `make test-postgres` to enable PostgreSQL tests")

    with PostgresContainer(
        image="postgres:18-alpine",
        username="minnumst",
        password="minnumst-test",
        dbname="minnumst",
        driver="psycopg",
    ) as database:
        owner_url = database.get_connection_url()
        owner = make_engine(owner_url)
        with owner.begin() as connection:
            connection.execute(
                text(f"CREATE ROLE {RUNTIME_ROLE} LOGIN PASSWORD 'runtime-test'")
            )
        owner.dispose()
        runtime_url = make_url(owner_url).set(
            username=RUNTIME_ROLE, password="runtime-test"
        )
        yield owner_url, runtime_url.render_as_string(hide_password=False)


@pytest.fixture
def postgres_client(
    database_urls: tuple[str, str], monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    owner_url, runtime_url = database_urls
    monkeypatch.setattr(settings, "database_runtime_role", RUNTIME_ROLE)
    owner = make_engine(owner_url)
    downgrade(owner)
    upgrade(owner)
    owner.dispose()
    with TestClient(create_app(database_url=runtime_url)) as test_client:
        yield test_client


def test_runtime_role_cannot_rewrite_history_or_the_schema(
    postgres_client: TestClient, database_urls: tuple[str, str]
) -> None:
    person = postgres_client.post("/api/people", json={"name": "Jón Jónsson"}).json()
    saved = postgres_client.put(
        f"/api/people/{person['id']}/blog",
        json={"title": "A story", "content": "The first version."},
    )
    assert saved.status_code == 200

    runtime = make_engine(database_urls[1])
    for statement in (
        "UPDATE blog_revisions SET content = 'rewritten'",
        "DELETE FROM blog_revisions",
        "DELETE FROM blog_posts",
        "DROP TABLE people",
        "CREATE TABLE intruder (id int)",
    ):
        with runtime.connect() as connection, pytest.raises(ProgrammingError) as error:
            connection.execute(text(statement))
        assert error.value.orig.sqlstate == INSUFFICIENT_PRIVILEGE, statement
    runtime.dispose()

    history = postgres_client.get(f"/api/people/{person['id']}/blog/revisions")
    assert [revision["content"] for revision in history.json()] == [
        "The first version."
    ]


def test_admin_writes_persist_and_public_reads_return_current_data(
    postgres_client: TestClient,
) -> None:
    created = postgres_client.post("/api/people", json={"name": "Sigríður Jónsdóttir"})
    assert created.status_code == 201
    person = created.json()

    first_save = postgres_client.put(
        f"/api/people/{person['id']}/blog",
        json={
            "title": "A life in Reykjavík",
            "excerpt": "An introduction",
            "content": "The first version of the story.",
        },
    )
    second_save = postgres_client.put(
        f"/api/people/{person['id']}/blog",
        json={
            "title": "A life in Reykjavík",
            "excerpt": "A revised introduction",
            "content": "The updated story, with more detail.",
        },
    )

    assert first_save.status_code == 200
    assert second_save.status_code == 200
    assert second_save.json()["revision_count"] == 2

    search = postgres_client.get("/api/people", params={"query": "sigridur"})
    public_page = postgres_client.get(f"/api/people/by-slug/{person['slug']}")
    history = postgres_client.get(f"/api/people/{person['id']}/blog/revisions")

    assert search.status_code == 200
    assert search.json()["total"] == 1
    assert search.json()["items"][0]["blog"]["title"] == "A life in Reykjavík"
    assert public_page.status_code == 200
    assert public_page.json()["current_blog"]["content"] == (
        "The updated story, with more detail."
    )
    assert [revision["content"] for revision in history.json()] == [
        "The updated story, with more detail.",
        "The first version of the story.",
    ]
    assert [revision["revision_number"] for revision in history.json()] == [2, 1]

    update = postgres_client.patch(
        f"/api/people/{person['id']}",
        json={"name": "Sigríður Jónsdóttir, 1920-2001"},
    )
    read_after_update = postgres_client.get(f"/api/people/{person['id']}")

    assert update.status_code == 200
    assert read_after_update.json()["name"] == "Sigríður Jónsdóttir, 1920-2001"
