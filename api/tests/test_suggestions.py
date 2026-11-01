from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from minnumst_api import api
from minnumst_api.main import create_app
from minnumst_api.migrate import upgrade

MISSING_ID = "00000000-0000-4000-8000-000000000000"
EDIT = {"kind": "edit", "title": "New title", "excerpt": "", "content": "New text."}
REQUEST = {"kind": "request", "note": "The year of death is wrong."}


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = create_app(database_url="sqlite://")
    upgrade(app.state.engine)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def person(client: TestClient) -> dict:
    return client.post(
        "/api/people", json={"name": "Ásta Jónsdóttir", "birth_date": "1850"}
    ).json()


def suggest(client: TestClient, person: dict, body: dict = EDIT) -> dict:
    response = client.post(f"/api/people/{person['id']}/suggestions", json=body)
    assert response.status_code == 201
    return response.json()


def queue(client: TestClient, **params: str) -> dict:
    return client.get("/api/admin/suggestions", params=params).json()


def test_a_suggestion_changes_nothing_until_an_editor_accepts_it(
    client: TestClient, person: dict
) -> None:
    receipt = suggest(client, person)

    assert receipt["status"] == "pending"
    assert set(receipt) == {"id", "status"}
    assert client.get(f"/api/people/{person['id']}").json()["current_story"] is None

    [item] = queue(client)["items"]
    assert (item["person_name"], item["content"]) == ("Ásta Jónsdóttir", "New text.")

    accepted = client.post(
        f"/api/admin/suggestions/{receipt['id']}/accept",
        json={},
        headers={"X-Authentik-Username": "editor"},
    )

    assert accepted.status_code == 200
    public = client.get(f"/api/people/{person['id']}").json()
    assert public["current_story"]["content"] == "New text."
    assert accepted.json()["status"] == "accepted"
    assert accepted.json()["reviewed_by"] == "editor"
    assert accepted.json()["content"] is None
    assert queue(client)["total"] == 0
    assert queue(client, status="accepted")["total"] == 1


def test_an_editor_can_change_the_text_before_accepting(
    client: TestClient, person: dict
) -> None:
    receipt = suggest(client, person)

    client.post(
        f"/api/admin/suggestions/{receipt['id']}/accept",
        json={"story": {"title": "Edited", "excerpt": "", "content": "Edited text."}},
    )

    public = client.get(f"/api/people/{person['id']}").json()
    assert public["current_story"]["content"] == "Edited text."


def test_an_accepted_edit_is_a_version_by_the_editor(
    client: TestClient, person: dict
) -> None:
    receipt = suggest(client, person)

    client.post(
        f"/api/admin/suggestions/{receipt['id']}/accept",
        json={},
        headers={"X-Authentik-Username": "editor"},
    )

    [version] = client.get(f"/api/admin/people/{person['id']}/story/revisions").json()
    assert version["created_by"] == "editor"
    assert version["change_note"] == "Accepted a visitor's suggestion"


def test_accepting_after_the_story_moved_on_is_refused_and_stays_pending(
    client: TestClient, person: dict
) -> None:
    receipt = suggest(client, person)
    client.put(
        f"/api/people/{person['id']}/story", json={"title": "T", "content": "New"}
    )

    response = client.post(
        f"/api/admin/suggestions/{receipt['id']}/accept",
        json={
            "story": {"title": "T", "content": "Old", "base_revision_number": 0},
        },
    )

    assert response.status_code == 409
    assert queue(client)["total"] == 1
    public = client.get(f"/api/people/{person['id']}").json()
    assert public["current_story"]["content"] == "New"


def test_rejecting_deletes_the_text_and_keeps_who_decided(
    client: TestClient, person: dict
) -> None:
    receipt = suggest(client, person, {**REQUEST, "source_url": "https://example.org"})

    rejected = client.post(
        f"/api/admin/suggestions/{receipt['id']}/reject",
        headers={"X-Authentik-Username": "editor"},
    ).json()

    assert rejected["status"] == "rejected"
    assert rejected["reviewed_by"] == "editor"
    assert rejected["reviewed_at"]
    assert (rejected["note"], rejected["source_url"]) == (None, None)
    assert client.get(f"/api/people/{person['id']}").json()["current_story"] is None


def test_accepting_a_request_marks_it_handled_without_a_revision(
    client: TestClient, person: dict
) -> None:
    receipt = suggest(client, person, REQUEST)

    accepted = client.post(f"/api/admin/suggestions/{receipt['id']}/accept", json={})

    assert accepted.json()["status"] == "accepted"
    assert accepted.json()["reviewed_by"] == "unknown"
    assert accepted.json()["current_revision"] is None


@pytest.mark.parametrize("action", ["accept", "reject"])
def test_a_decision_is_final_and_needs_a_real_suggestion(
    client: TestClient, person: dict, action: str
) -> None:
    receipt = suggest(client, person)
    path = f"/api/admin/suggestions/{receipt['id']}"
    assert client.post(f"{path}/{action}", json={}).status_code == 200

    assert client.post(f"{path}/accept", json={}).status_code == 409
    assert client.post(f"{path}/reject").status_code == 409
    missing = f"/api/admin/suggestions/{MISSING_ID}/{action}"
    assert client.post(missing, json={}).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"kind": "edit", "title": "Only a title"},
        {"kind": "edit", "content": "Only text"},
        {"kind": "request"},
        {"kind": "request", "note": "   "},
        {"kind": "other", "note": "Unknown"},
        {**REQUEST, "source_url": "javascript:alert(1)"},
        {**REQUEST, "source_url": "not a link"},
        {**REQUEST, "note": "x" * 2001},
        {**EDIT, "content": "x" * 50001},
        {**EDIT, "base_revision_number": 2**31},
    ],
)
def test_incomplete_or_oversized_suggestions_are_rejected(
    client: TestClient, person: dict, body: dict
) -> None:
    response = client.post(f"/api/people/{person['id']}/suggestions", json=body)

    assert response.status_code == 422


def test_a_refused_suggestion_is_not_repeated_back(
    client: TestClient, person: dict
) -> None:
    body = {"kind": "request", "note": "Private text", "source_url": "not a link"}

    response = client.post(f"/api/people/{person['id']}/suggestions", json=body)

    assert response.status_code == 422
    assert "Private text" not in response.text
    assert "not a link" not in response.text
    assert response.json()["detail"][0]["msg"]


def test_an_empty_source_counts_as_none(client: TestClient, person: dict) -> None:
    suggest(client, person, {**REQUEST, "source_url": ""})

    assert queue(client)["items"][0]["source_url"] is None


def test_suggesting_needs_a_visible_person(client: TestClient, person: dict) -> None:
    missing = client.post(f"/api/people/{MISSING_ID}/suggestions", json=REQUEST)
    client.put(f"/api/admin/people/{person['id']}/visibility", json={"hidden": True})
    hidden = client.post(f"/api/people/{person['id']}/suggestions", json=REQUEST)

    assert (missing.status_code, hidden.status_code) == (404, 404)


def test_a_full_queue_refuses_more(
    client: TestClient, person: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(api, "MAX_PENDING_SUGGESTIONS", 1)
    suggest(client, person)

    response = client.post(f"/api/people/{person['id']}/suggestions", json=REQUEST)

    assert response.status_code == 429


def test_queue_pages_oldest_first_and_checks_its_filter(
    client: TestClient, person: dict
) -> None:
    first = suggest(client, person)
    suggest(client, person, REQUEST)

    page = queue(client, limit="1")

    assert page["total"] == 2
    assert [item["id"] for item in page["items"]] == [first["id"]]
    assert (
        client.get("/api/admin/suggestions", params={"status": "other"}).status_code
        == 422
    )


def test_hiding_a_person_removes_them_from_every_public_read(
    client: TestClient, person: dict
) -> None:
    client.put(
        f"/api/people/{person['id']}/story", json={"title": "T", "content": "Text"}
    )
    hide = f"/api/admin/people/{person['id']}/visibility"

    assert client.put(hide, json={"hidden": True}).status_code == 200

    assert client.get("/api/people").json()["total"] == 0
    for path in (
        f"/api/people/{person['id']}",
        f"/api/people/{person['id']}/story",
        f"/api/people/by-slug/{person['slug']}",
    ):
        assert client.get(path).status_code == 404, path
    [hidden] = client.get("/api/admin/people/hidden").json()
    assert hidden["id"] == person["id"]
    assert (
        client.get(f"/api/admin/people/{person['id']}/story/revisions").status_code
        == 200
    )

    client.put(hide, json={"hidden": False})

    assert client.get("/api/people").json()["total"] == 1
    assert client.get("/api/admin/people/hidden").json() == []
    assert (
        client.put(
            f"/api/admin/people/{MISSING_ID}/visibility", json={"hidden": True}
        ).status_code
        == 404
    )


def test_story_history_is_only_served_to_editors(client: TestClient) -> None:
    paths = [path for path in client.app.openapi()["paths"] if "revisions" in path]

    assert paths
    assert all(path.startswith("/api/admin/") for path in paths)


def test_deleting_a_person_takes_their_open_suggestions_along(
    client: TestClient, person: dict
) -> None:
    suggest(client, person)

    assert client.delete(f"/api/people/{person['id']}").status_code == 204
    assert queue(client)["total"] == 0
