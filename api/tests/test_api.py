import logging
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI, Response
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from minnumst_api.config import settings
from minnumst_api.logging_config import configure_logging
from minnumst_api.main import create_app
from minnumst_api.migrate import upgrade
from minnumst_api.models import BlogPost, Person


def migrated_app() -> FastAPI:
    app = create_app(database_url="sqlite://")
    upgrade(app.state.engine)
    return app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(migrated_app()) as test_client:
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


def test_search_folds_icelandic_letters_independently_of_the_database(
    client: TestClient,
) -> None:
    person = client.post("/api/people", json={"name": "Sólveig Þorgrímsdóttir"}).json()

    for query in ("solveig", "Þorgríms", "thorgrimsdottir", "SOLVEIG THORG"):
        page = client.get("/api/people", params={"query": query}).json()
        assert [item["id"] for item in page["items"]] == [person["id"]], query
    assert person["slug"] == "solveig-thorgrimsdottir"
    duplicate = client.post("/api/people", json={"name": "Solveig Thorgrimsdottir"})
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
    response = client.get("/api/people/00000000-0000-4000-8000-000000000000")

    assert response.status_code == 404


def test_malformed_person_id_is_rejected_before_lookup(client: TestClient) -> None:
    for path in ("/api/people/unknown", "/api/people/1%0Aforged/blog"):
        assert client.get(path).status_code == 422


def test_successful_health_checks_are_debug_level(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)

    response = client.get("/healthz")

    assert response.status_code == 200
    health_log = next(
        record
        for record in caplog.records
        if record.getMessage() == "Request completed"
        and getattr(record, "route", None) == "/healthz"
    )
    assert health_log.levelno == logging.DEBUG


def test_cors_allows_and_exposes_request_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "cors_origins", "https://public.example")
    app = migrated_app()

    with TestClient(app) as test_client:
        preflight = test_client.options(
            "/api/people",
            headers={
                "Origin": "https://public.example",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-request-id",
            },
        )
        response = test_client.get(
            "/api/people",
            headers={
                "Origin": "https://public.example",
                "X-Request-ID": "cors-request-123",
            },
        )

    assert preflight.status_code == 200
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://public.example"
    assert "x-request-id" in preflight.headers["access-control-allow-headers"].lower()
    assert response.headers["access-control-expose-headers"] == "X-Request-ID"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_cors_never_allows_unlisted_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "cors_origins", "https://admin.example")
    with TestClient(migrated_app()) as test_client:
        response = test_client.get(
            "/api/people", headers={"Origin": "https://attacker.example"}
        )
        preflight = test_client.options(
            "/api/people",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "POST",
            },
        )

    # Without an allow-origin header the browser withholds the response, and
    # with it any credentials, from the attacker's page.
    assert "access-control-allow-origin" not in response.headers
    assert preflight.status_code == 400


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
    configure_logging("DEBUG")

    response = client.get(
        "/api/people",
        params={"query": search_text},
        headers={"X-Request-ID": "test-request-123"},
    )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "test-request-123"
    request_log = next(
        record
        for record in caplog.records
        if record.getMessage() == "Request completed"
    )
    assert request_log.request_id == "test-request-123"
    assert request_log.method == "GET"
    assert request_log.route == "/api/people"
    assert request_log.status_code == 200
    assert any(
        record.name == "minnumst_api.api"
        and getattr(record, "request_id", None) == "test-request-123"
        for record in caplog.records
    )
    # The test client logs its own request URLs; the API must never log them.
    api_records = [r for r in caplog.records if r.name.startswith("minnumst_api")]
    assert all(search_text not in record.getMessage() for record in api_records)
    configure_logging("INFO")


STORY = {"title": "Story", "excerpt": "", "content": "Remembered"}
MISSING_ID = "00000000-0000-4000-8000-000000000000"


def completed_request_log(
    caplog: pytest.LogCaptureFixture, route: str
) -> logging.LogRecord:
    return next(
        record
        for record in caplog.records
        if record.getMessage() == "Request completed"
        and getattr(record, "route", None) == route
    )


def test_people_are_listed_in_name_order_and_paged(client: TestClient) -> None:
    for name in ("Þóra Ólafsdóttir", "Bjarni Árnason", "Anna Jónsdóttir"):
        create_person(client, name)

    everyone = client.get("/api/people", params={"query": "  "}).json()
    second_page = client.get("/api/people", params={"offset": 1, "limit": 1}).json()

    assert [item["name"] for item in everyone["items"]] == [
        "Anna Jónsdóttir",
        "Bjarni Árnason",
        "Þóra Ólafsdóttir",
    ]
    assert everyone["total"] == 3
    assert second_page["items"][0]["name"] == "Bjarni Árnason"
    assert (second_page["total"], second_page["offset"], second_page["limit"]) == (
        3,
        1,
        1,
    )
    for params in ({"limit": 0}, {"limit": 101}, {"offset": -1}):
        assert client.get("/api/people", params=params).status_code == 422


def test_blank_names_are_rejected(client: TestClient) -> None:
    response = client.post("/api/people", json={"name": " \t "})

    assert response.status_code == 422
    assert "Name cannot be blank" in response.text


def test_person_reads_by_id_and_slug_include_the_current_story(
    client: TestClient,
) -> None:
    person = create_person(client)
    before = client.get(f"/api/people/{person['id']}").json()
    client.put(f"/api/people/{person['id']}/blog", json=STORY)

    by_id = client.get(f"/api/people/{person['id']}").json()
    by_slug = client.get(f"/api/people/by-slug/{person['slug']}").json()

    assert before["blog"] is None
    assert before["current_blog"] is None
    assert by_id == by_slug
    assert by_id["current_blog"]["content"] == "Remembered"
    assert by_id["blog"]["revision_count"] == 1


def test_unknown_slug_returns_not_found(client: TestClient) -> None:
    response = client.get("/api/people/by-slug/nobody")

    assert response.status_code == 404
    assert response.json() == {"detail": "Person not found"}


def test_blog_read_returns_the_current_revision(client: TestClient) -> None:
    person = create_person(client)
    client.put(f"/api/people/{person['id']}/blog", json=STORY)
    client.put(f"/api/people/{person['id']}/blog", json={**STORY, "content": "More"})

    blog = client.get(f"/api/people/{person['id']}/blog").json()

    assert blog["person_id"] == person["id"]
    assert blog["revision_count"] == 2
    assert blog["current_revision"]["revision_number"] == 2
    assert blog["current_revision"]["content"] == "More"


def test_blog_routes_return_not_found_without_a_story(client: TestClient) -> None:
    person = create_person(client)

    for path in ("blog", "blog/revisions"):
        response = client.get(f"/api/people/{person['id']}/{path}")
        assert response.status_code == 404
        assert response.json() == {"detail": "Blog not found"}
    assert client.get(f"/api/people/{MISSING_ID}/blog").status_code == 404
    assert client.put(f"/api/people/{MISSING_ID}/blog", json=STORY).status_code == 404


def test_a_story_without_revisions_is_treated_as_missing(client: TestClient) -> None:
    # The API always saves a story together with its first revision, but the
    # schema allows an empty story row, so reads must not fail on one.
    person = create_person(client)
    with client.app.state.session_factory() as session:
        session.add(BlogPost(person_id=person["id"]))
        session.commit()

    detail = client.get(f"/api/people/{person['id']}").json()
    blog = client.get(f"/api/people/{person['id']}/blog")

    assert detail["blog"] is None
    assert detail["current_blog"] is None
    assert blog.status_code == 404
    assert blog.json() == {"detail": "Blog has no revisions"}


def test_rename_to_an_existing_normalized_name_conflicts(client: TestClient) -> None:
    person = create_person(client)
    create_person(client, "Björn Sigurðsson")

    response = client.patch(
        f"/api/people/{person['id']}", json={"name": "bjorn sigurdsson"}
    )
    missing = client.patch(f"/api/people/{MISSING_ID}", json={"name": "Anyone"})

    assert response.status_code == 409
    assert missing.status_code == 404


def test_rename_racing_a_concurrent_create_conflicts(client: TestClient) -> None:
    person = create_person(client)

    # Another request creates the same normalized name between the conflict
    # check and the commit; the unique constraint has the final say.
    @event.listens_for(client.app.state.session_factory, "before_flush", once=True)
    def concurrent_create(session: Session, *_: object) -> None:
        session.add(
            Person(name="Rival", normalized_name="bjorn sigurdsson", slug="rival")
        )

    response = client.patch(
        f"/api/people/{person['id']}", json={"name": "Björn Sigurðsson"}
    )
    unchanged = client.get(f"/api/people/{person['id']}").json()

    assert response.status_code == 409
    assert response.json()["detail"].endswith("already exists")
    assert unchanged["name"] == person["name"]


def test_deleting_a_missing_person_returns_not_found(client: TestClient) -> None:
    assert client.delete(f"/api/people/{MISSING_ID}").status_code == 404


def test_readiness_checks_the_database(client: TestClient) -> None:
    response = client.get("/readyz")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_unreachable_database_fails_readiness_with_a_logged_request_id(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    app = create_app(database_url=f"sqlite:///{tmp_path}/missing/minnumst.db")

    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.get("/readyz", headers={"X-Request-ID": "ready-1"})

    failure = next(
        record for record in caplog.records if record.getMessage() == "Request failed"
    )
    assert response.status_code == 500
    assert response.headers["X-Request-ID"] == "ready-1"
    assert response.json() == {"detail": "Internal Server Error"}
    assert "sqlite" not in response.text.lower()
    assert failure.levelno == logging.ERROR
    assert failure.route == "/readyz"
    assert failure.request_id == "ready-1"
    assert failure.exc_info is not None


def test_unhandled_errors_carry_the_generated_request_id(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    app = create_app(database_url=f"sqlite:///{tmp_path}/missing/minnumst.db")

    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.get("/readyz")

    failure = next(
        record for record in caplog.records if record.getMessage() == "Request failed"
    )
    assert response.status_code == 500
    assert len(response.headers["X-Request-ID"]) == 36
    assert response.headers["X-Request-ID"] == failure.request_id


def cors_headers(response: Response) -> dict[str, str]:
    return {
        key: value
        for key, value in response.headers.items()
        if key.startswith("access-control-") or key == "vary"
    }


@pytest.mark.parametrize(
    ("origin", "allow_origin"),
    [
        ("https://admin.example", "https://admin.example"),
        ("https://attacker.example", None),
        (None, None),
    ],
)
def test_unhandled_errors_get_the_same_cors_headers_as_other_responses(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    origin: str | None,
    allow_origin: str | None,
) -> None:
    monkeypatch.setattr(settings, "cors_origins", "https://admin.example")
    app = create_app(database_url=f"sqlite:///{tmp_path}/missing/minnumst.db")
    headers = {"Origin": origin} if origin else {}

    with TestClient(app, raise_server_exceptions=False) as test_client:
        failure = test_client.get("/readyz", headers=headers)
        success = test_client.get("/healthz", headers=headers)

    assert failure.status_code == 500
    assert failure.headers.get("access-control-allow-origin") == allow_origin
    assert cors_headers(failure) == cors_headers(success)
    if allow_origin:
        assert failure.headers["access-control-allow-credentials"] == "true"
        assert failure.headers["access-control-expose-headers"] == "X-Request-ID"
    assert len(failure.headers["X-Request-ID"]) == 36


def test_invalid_request_ids_are_replaced(client: TestClient) -> None:
    response = client.get("/healthz", headers={"X-Request-ID": "bad id\twith spaces"})

    assert response.headers["X-Request-ID"] != "bad id\twith spaces"
    assert len(response.headers["X-Request-ID"]) == 36


def test_responses_are_logged_at_a_level_matching_their_status(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    @client.app.get("/unavailable")
    def unavailable() -> Response:
        return Response(status_code=503)

    caplog.set_level(logging.DEBUG)
    client.get("/unavailable")
    client.get(f"/api/people/{MISSING_ID}")
    client.get("/api/people")

    assert completed_request_log(caplog, "/unavailable").levelno == logging.ERROR
    assert (
        completed_request_log(caplog, "/api/people/{person_id}").levelno
        == logging.WARNING
    )
    assert completed_request_log(caplog, "/api/people").levelno == logging.INFO
