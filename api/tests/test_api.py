import logging
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from eftirmal_api.main import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = create_app(database_url="sqlite://", create_tables=True)
    with TestClient(app) as test_client:
        yield test_client


def create_person(client: TestClient, name: str = "Ásta Jónsdóttir") -> dict:
    response = client.post("/api/people", json={"name": name})
    assert response.status_code == 201
    return response.json()


def test_people_search_and_normalized_duplicate_protection(client: TestClient) -> None:
    person = create_person(client)

    results = client.get("/api/people", params={"query": "asta"})
    duplicate = client.post("/api/people", json={"name": "asta   jonsdottir"})

    assert results.status_code == 200
    assert results.json()["total"] == 1
    assert results.json()["items"][0]["id"] == person["id"]
    assert person["slug"] == "asta-jonsdottir"
    assert duplicate.status_code == 409


def test_person_slug_collisions_get_a_unique_suffix(client: TestClient) -> None:
    first = create_person(client, "Ada Lovelace")
    second = create_person(client, "Ada-Lovelace")

    assert first["slug"] == "ada-lovelace"
    assert second["slug"] == "ada-lovelace-2"


def test_blog_save_appends_history_and_slug_read_returns_current(
    client: TestClient,
) -> None:
    person = create_person(client)
    first = {
        "title": "A first story",
        "excerpt": "First introduction",
        "content": "First version",
    }
    second = {
        "title": "An updated story",
        "excerpt": "Updated introduction",
        "content": "Second version",
    }

    first_save = client.put(f"/api/people/{person['id']}/blog", json=first)
    second_save = client.put(f"/api/people/{person['id']}/blog", json=second)
    history = client.get(f"/api/people/{person['id']}/blog/revisions")
    public_page = client.get(f"/api/people/by-slug/{person['slug']}")

    assert first_save.status_code == 200
    assert second_save.status_code == 200
    assert second_save.json()["id"] == first_save.json()["id"]
    assert second_save.json()["revision_count"] == 2
    assert [item["content"] for item in history.json()] == [
        "Second version",
        "First version",
    ]
    assert [item["revision_number"] for item in history.json()] == [2, 1]
    assert public_page.json()["current_blog"]["content"] == "Second version"


def test_people_can_be_updated_but_blog_history_blocks_deletion(
    client: TestClient,
) -> None:
    person = create_person(client)
    updated = client.patch(
        f"/api/people/{person['id']}", json={"name": "Ásta Jónsdóttir, 1920-2001"}
    )
    client.put(
        f"/api/people/{person['id']}/blog",
        json={"title": "Story", "excerpt": "", "content": "Remembered"},
    )
    deleted = client.delete(f"/api/people/{person['id']}")

    assert updated.status_code == 200
    assert updated.json()["name"] == "Ásta Jónsdóttir, 1920-2001"
    assert deleted.status_code == 409
    assert "preserve revisions" in deleted.json()["detail"]


def test_missing_person_returns_not_found(client: TestClient) -> None:
    response = client.get("/api/people/unknown")

    assert response.status_code == 404


def test_person_without_blog_can_be_deleted(client: TestClient) -> None:
    person = create_person(client)

    deleted = client.delete(f"/api/people/{person['id']}")
    missing = client.get(f"/api/people/{person['id']}")

    assert deleted.status_code == 204
    assert missing.status_code == 404


def test_request_logs_route_and_status_without_logging_search_text(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    search_text = "private-person-search"
    caplog.set_level(logging.DEBUG)

    response = client.get("/api/people", params={"query": search_text})

    assert response.status_code == 200
    assert "Request completed method=GET route=/api/people status_code=200" in (
        caplog.text
    )
    assert "query_present=True" in caplog.text
    assert search_text not in caplog.text
