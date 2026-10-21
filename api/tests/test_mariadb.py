import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from testcontainers.community.mysql import MySqlContainer

from minnumst_api.main import create_app
from minnumst_api.models import Base


@pytest.fixture(scope="module")
def mariadb_url() -> Iterator[str]:
    if os.getenv("RUN_MARIADB_TESTS") != "1":
        pytest.skip("Run with `make test-mariadb` to enable MariaDB integration tests")

    with MySqlContainer(
        image="mariadb:11.4",
        dialect="pymysql",
        username="minnumst",
        password="minnumst-test",
        dbname="minnumst",
    ) as database:
        yield database.get_connection_url()


@pytest.fixture
def mariadb_client(mariadb_url: str) -> Iterator[TestClient]:
    app = create_app(database_url=mariadb_url, create_tables=True)
    with TestClient(app) as test_client:
        engine = app.state.engine
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        yield test_client


def test_admin_writes_persist_and_public_reads_return_current_data(
    mariadb_client: TestClient,
) -> None:
    created = mariadb_client.post("/api/people", json={"name": "Sigríður Jónsdóttir"})
    assert created.status_code == 201
    person = created.json()

    first_save = mariadb_client.put(
        f"/api/people/{person['id']}/blog",
        json={
            "title": "A life in Reykjavík",
            "excerpt": "An introduction",
            "content": "The first version of the story.",
        },
    )
    second_save = mariadb_client.put(
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

    search = mariadb_client.get("/api/people", params={"query": "sigridur"})
    public_page = mariadb_client.get(f"/api/people/by-slug/{person['slug']}")
    history = mariadb_client.get(f"/api/people/{person['id']}/blog/revisions")

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

    update = mariadb_client.patch(
        f"/api/people/{person['id']}",
        json={"name": "Sigríður Jónsdóttir, 1920-2001"},
    )
    read_after_update = mariadb_client.get(f"/api/people/{person['id']}")

    assert update.status_code == 200
    assert read_after_update.json()["name"] == "Sigríður Jónsdóttir, 1920-2001"
