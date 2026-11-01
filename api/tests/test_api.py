import json
import logging
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta, timezone
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
from minnumst_api.models import Person, Story, UTCDateTime


def migrated_app() -> FastAPI:
    app = create_app(database_url="sqlite://")
    upgrade(app.state.engine)
    return app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(migrated_app()) as test_client:
        yield test_client


def create_person(client: TestClient, name: str = "Ásta Jónsdóttir") -> dict:
    response = client.post("/api/people", json={"name": name, "birth_date": "1850"})
    assert response.status_code == 201
    return response.json()


def test_people_search_and_duplicate_protection(client: TestClient) -> None:
    person = create_person(client)

    results = client.get("/api/people", params={"query": "asta"})
    duplicate = client.post(
        "/api/people", json={"name": "asta   jonsdottir", "birth_date": "1850"}
    )
    namesake = client.post(
        "/api/people", json={"name": "Ásta Jónsdóttir", "birth_date": "1790"}
    )

    assert results.status_code == 200
    assert results.json()["total"] == 1
    assert results.json()["items"][0]["id"] == person["id"]
    assert person["slug"] == "asta-jonsdottir"
    assert duplicate.status_code == 409
    assert namesake.status_code == 201
    assert namesake.json()["slug"] == "asta-jonsdottir-1790"


def test_search_folds_icelandic_letters_independently_of_the_database(
    client: TestClient,
) -> None:
    person = create_person(client, "Sólveig Þorgrímsdóttir")

    for query in ("solveig", "Þorgríms", "thorgrimsdottir", "SOLVEIG THORG"):
        page = client.get("/api/people", params={"query": query}).json()
        assert [item["id"] for item in page["items"]] == [person["id"]], query
    assert person["slug"] == "solveig-thorgrimsdottir"
    duplicate = client.post(
        "/api/people", json={"name": "Solveig Thorgrimsdottir", "birth_date": "1850"}
    )
    assert duplicate.status_code == 409


@pytest.mark.parametrize("query", ["%", "_", "a%a", "a_a"])
def test_search_treats_wildcards_as_plain_characters(
    client: TestClient, query: str
) -> None:
    create_person(client, "Anna")

    page = client.get("/api/people", params={"query": query}).json()

    assert page["total"] == 0


def test_lists_summarise_stories_without_loading_their_text(
    client: TestClient,
) -> None:
    person = create_person(client)
    client.put(f"/api/people/{person['id']}/story", json=STORY)
    statements: list[str] = []
    engine = client.app.state.engine

    def record(_: object, __: object, statement: str, *___: object) -> None:
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    page = client.get("/api/people").json()
    event.remove(engine, "before_cursor_execute", record)

    assert page["items"][0]["story"]["title"] == "Story"
    assert not any("content" in statement for statement in statements)


def test_person_slug_collisions_get_a_unique_suffix(client: TestClient) -> None:
    first = create_person(client, "Ada Lovelace")
    second = create_person(client, "Ada-Lovelace")
    third = create_person(client, "Ada, Lovelace")

    assert first["slug"] == "ada-lovelace"
    assert second["slug"] == "ada-lovelace-1850"
    assert third["slug"] == "ada-lovelace-1850-2"


def test_story_save_appends_history_and_slug_read_returns_current(
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

    first_save = client.put(f"/api/people/{person['id']}/story", json=first)
    second_save = client.put(f"/api/people/{person['id']}/story", json=second)
    history = client.get(f"/api/admin/people/{person['id']}/story/revisions")
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
    assert public_page.json()["current_story"]["content"] == "Second version"


def timestamps(document: object) -> list[tuple[str, str]]:
    """Every (field, value) timestamp in a JSON document, however nested."""
    if isinstance(document, list):
        return [found for item in document for found in timestamps(item)]
    if isinstance(document, dict):
        return [
            found
            for key, value in document.items()
            for found in ([(key, value)] if key.endswith("_at") else timestamps(value))
        ]
    return []


def test_timestamps_read_back_from_the_database_are_explicitly_utc(
    client: TestClient,
) -> None:
    person = create_person(client)
    client.put(f"/api/people/{person['id']}/story", json=STORY)
    client.patch(
        f"/api/people/{person['id']}", json={"name": "Ásta Jóns", "birth_date": "1850"}
    )

    found = timestamps(
        [
            client.get("/api/people").json(),
            client.get(f"/api/people/{person['id']}").json(),
            client.get(f"/api/people/by-slug/{person['slug']}").json(),
            client.get(f"/api/people/{person['id']}/story").json(),
            client.get(f"/api/admin/people/{person['id']}/story/revisions").json(),
        ]
    )

    assert {field for field, _ in found} == {"created_at", "updated_at", "saved_at"}
    for field, value in found:
        assert value.endswith("Z"), (field, value)
        assert datetime.fromisoformat(value).utcoffset() == timedelta(0)


def test_utc_timestamps_are_normalised_on_write_and_read() -> None:
    column = UTCDateTime()
    naive = datetime(2026, 10, 27, 12, 0)  # noqa: DTZ001 - the case under test
    oslo = datetime(2026, 10, 27, 13, 0, tzinfo=timezone(timedelta(hours=1)))
    utc = datetime(2026, 10, 27, 12, 0, tzinfo=UTC)

    for convert in (column.process_bind_param, column.process_result_value):
        assert convert(None, None) is None  # type: ignore[arg-type]
        assert convert(naive, None) == utc  # type: ignore[arg-type]
        assert convert(oslo, None).tzinfo is UTC  # type: ignore[arg-type,union-attr]
        assert convert(oslo, None) == utc  # type: ignore[arg-type]


def test_people_can_be_updated_but_story_history_blocks_deletion(
    client: TestClient,
) -> None:
    person = create_person(client)
    updated = client.patch(
        f"/api/people/{person['id']}",
        json={"name": "Ásta Jónsdóttir, 1820-1901", "death_date": "1901"},
    )
    client.put(
        f"/api/people/{person['id']}/story",
        json={"title": "Story", "excerpt": "", "content": "Remembered"},
    )
    deleted = client.delete(f"/api/people/{person['id']}")

    assert updated.status_code == 200
    assert updated.json()["name"] == "Ásta Jónsdóttir, 1820-1901"
    assert updated.json()["birth_date"] is None
    assert updated.json()["death_date"] == "1901"
    assert deleted.status_code == 409
    assert "preserve revisions" in deleted.json()["detail"]


def test_missing_person_returns_not_found(client: TestClient) -> None:
    response = client.get("/api/people/00000000-0000-4000-8000-000000000000")

    assert response.status_code == 404


def test_malformed_person_id_is_rejected_before_lookup(client: TestClient) -> None:
    for path in ("/api/people/unknown", "/api/people/1%0Aforged/story"):
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


def test_person_without_story_can_be_deleted(client: TestClient) -> None:
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
    response = client.post("/api/people", json={"name": " \t ", "birth_date": "1850"})

    assert response.status_code == 422
    assert "Name cannot be blank" in response.text


def test_person_reads_by_id_and_slug_include_the_current_story(
    client: TestClient,
) -> None:
    person = create_person(client)
    before = client.get(f"/api/people/{person['id']}").json()
    client.put(f"/api/people/{person['id']}/story", json=STORY)

    by_id = client.get(f"/api/people/{person['id']}").json()
    by_slug = client.get(f"/api/people/by-slug/{person['slug']}").json()

    assert before["story"] is None
    assert before["current_story"] is None
    assert by_id == by_slug
    assert by_id["current_story"]["content"] == "Remembered"
    assert by_id["story"]["revision_count"] == 1


def test_unknown_slug_returns_not_found(client: TestClient) -> None:
    response = client.get("/api/people/by-slug/nobody")

    assert response.status_code == 404
    assert response.json() == {"detail": "Person not found"}


def test_story_read_returns_the_current_revision(client: TestClient) -> None:
    person = create_person(client)
    client.put(f"/api/people/{person['id']}/story", json=STORY)
    client.put(f"/api/people/{person['id']}/story", json={**STORY, "content": "More"})

    story = client.get(f"/api/people/{person['id']}/story").json()

    assert story["person_id"] == person["id"]
    assert story["revision_count"] == 2
    assert story["current_revision"]["revision_number"] == 2
    assert story["current_revision"]["content"] == "More"


def test_story_routes_return_not_found_without_a_story(client: TestClient) -> None:
    person = create_person(client)

    for path in (
        f"/api/people/{person['id']}/story",
        f"/api/admin/people/{person['id']}/story/revisions",
    ):
        response = client.get(path)
        assert response.status_code == 404
        assert response.json() == {"detail": "Story not found"}
    assert client.get(f"/api/people/{MISSING_ID}/story").status_code == 404
    assert client.put(f"/api/people/{MISSING_ID}/story", json=STORY).status_code == 404
    assert (
        client.get(f"/api/admin/people/{MISSING_ID}/story/revisions").status_code == 404
    )


def test_a_story_without_revisions_is_treated_as_missing(client: TestClient) -> None:
    # The API always saves a story together with its first revision, but the
    # schema allows an empty story row, so reads must not fail on one.
    person = create_person(client)
    with client.app.state.session_factory() as session:
        session.add(Story(person_id=person["id"]))
        session.commit()

    detail = client.get(f"/api/people/{person['id']}").json()
    story = client.get(f"/api/people/{person['id']}/story")

    assert detail["story"] is None
    assert detail["current_story"] is None
    assert story.status_code == 404
    assert story.json() == {"detail": "Story has no revisions"}


def test_rename_to_an_existing_identity_conflicts(client: TestClient) -> None:
    person = create_person(client)
    create_person(client, "Björn Sigurðsson")

    response = client.patch(
        f"/api/people/{person['id']}",
        json={"name": "bjorn sigurdsson", "birth_date": "1850"},
    )
    missing = client.patch(
        f"/api/people/{MISSING_ID}", json={"name": "Anyone", "birth_date": "1850"}
    )

    assert response.status_code == 409
    assert missing.status_code == 404


def test_rename_racing_a_concurrent_create_conflicts(client: TestClient) -> None:
    person = create_person(client)

    # Another request creates the same normalized name between the conflict
    # check and the commit; the unique constraint has the final say.
    @event.listens_for(client.app.state.session_factory, "before_flush", once=True)
    def concurrent_create(session: Session, *_: object) -> None:
        session.add(
            Person(
                name="Rival",
                normalized_name="bjorn sigurdsson",
                search_name="bjorn sigurdsson",
                sort_name="rival",
                identity="bjorn sigurdsson|1850|",
                slug="rival",
            )
        )

    response = client.patch(
        f"/api/people/{person['id']}",
        json={"name": "Björn Sigurðsson", "birth_date": "1850"},
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


@pytest.mark.parametrize("text", ["with\x00nul", "lone\ud800surrogate"])
def test_text_the_database_cant_hold_is_refused(client: TestClient, text: str) -> None:
    person = create_person(client)

    def send(method: str, path: str, body: dict) -> int:
        return client.request(
            method,
            path,
            content=json.dumps(body),
            headers={"Content-Type": "application/json"},
        ).status_code

    assert send("POST", "/api/people", {"name": text, "birth_date": "1850"}) == 422
    assert (
        send(
            "PUT",
            f"/api/people/{person['id']}/story",
            {"title": text, "content": "Text"},
        )
        == 422
    )
    assert (
        send(
            "POST",
            f"/api/people/{person['id']}/suggestions",
            {"kind": "request", "note": text},
        )
        == 422
    )


def test_a_nul_in_a_search_or_address_is_refused_not_a_server_error(
    client: TestClient,
) -> None:
    assert client.get("/api/people?query=a%00b").status_code == 422
    assert client.get("/api/people/by-slug/a%00b").status_code == 404
    assert client.get("/api/people", params={"offset": 2**40}).status_code == 422


def test_names_with_control_characters_or_extreme_length_are_refused(
    client: TestClient,
) -> None:
    def create(name: str) -> int:
        body = {"name": name, "birth_date": "1850"}
        return client.post("/api/people", json=body).status_code

    assert create("!!!") == 422
    assert create("1850") == 422
    # Each ligature folds to several letters, past what the column holds.
    assert create("\ufdfa" * 40) == 422
    # The longest allowed name still gets a slug that fits, even when it's taken.
    assert create("þ" * 240) == 201
    assert create("þ" * 241) == 201
    assert len(client.get("/api/people").json()["items"][1]["slug"]) <= 255


@pytest.mark.parametrize(
    "story",
    [
        {"title": "   ", "content": "Text"},
        {"title": "Title", "content": " \n "},
        {"title": "T" * 256, "content": "Text"},
        {"title": "Title", "content": "x" * 200001},
        {"title": "Title", "content": "Text", "base_revision_number": 2**31},
    ],
)
def test_blank_or_oversized_stories_are_refused(
    client: TestClient, story: dict
) -> None:
    person = create_person(client)

    response = client.put(f"/api/people/{person['id']}/story", json=story)

    assert response.status_code == 422


def test_death_before_birth_is_refused(client: TestClient) -> None:
    body = {"name": "Reversed", "birth_date": "1850", "death_date": "1800"}

    response = client.post("/api/people", json=body)

    assert response.status_code == 422
    assert "before the date of birth" in response.text
    assert (
        client.post(
            "/api/people",
            json={
                "name": "Same year",
                "birth_date": "1850-06-01",
                "death_date": "1850",
            },
        ).status_code
        == 201
    )


def test_a_save_from_an_old_version_is_refused(client: TestClient) -> None:
    person = create_person(client)
    path = f"/api/people/{person['id']}/story"

    first = client.put(path, json={**STORY, "base_revision_number": 0})
    stale = client.put(path, json={**STORY, "base_revision_number": 0})
    next_one = client.put(path, json={**STORY, "base_revision_number": 1})
    unchecked = client.put(path, json=STORY)

    assert first.status_code == 200
    assert stale.status_code == 409
    assert "has changed since you opened it" in stale.json()["detail"]
    assert next_one.json()["revision_count"] == 2
    assert unchecked.json()["revision_count"] == 3


def test_a_first_save_racing_another_is_refused(client: TestClient) -> None:
    person = create_person(client)

    # Another request saves the first story between the lookup and this flush;
    # the unique constraint has the final say.
    @event.listens_for(client.app.state.session_factory, "before_flush", once=True)
    def concurrent_save(session: Session, *_: object) -> None:
        session.add(Story(person_id=person["id"]))

    response = client.put(f"/api/people/{person['id']}/story", json=STORY)

    assert response.status_code == 409
    assert client.get(f"/api/people/{person['id']}").json()["current_story"] is None


def test_versions_record_who_and_why_for_editors_only(client: TestClient) -> None:
    person = create_person(client)
    saved = client.put(
        f"/api/people/{person['id']}/story",
        json={**STORY, "change_note": "  Added a source  "},
        headers={"X-Authentik-Username": "editor"},
    ).json()

    assert saved["current_revision"]["created_by"] == "editor"
    [version] = client.get(f"/api/admin/people/{person['id']}/story/revisions").json()
    assert version["created_by"] == "editor"
    assert version["change_note"] == "Added a source"

    public = client.get(f"/api/people/{person['id']}").json()["current_story"]
    story = client.get(f"/api/people/{person['id']}/story").json()["current_revision"]
    for document in (public, story):
        assert not {"created_by", "change_note", "restored_from"} & set(document)


def versions(client: TestClient, person: dict) -> list[dict]:
    return client.get(f"/api/admin/people/{person['id']}/story/revisions").json()


def test_restoring_publishes_an_old_version_as_a_new_one(client: TestClient) -> None:
    person = create_person(client)
    path = f"/api/people/{person['id']}/story"
    client.put(path, json={**STORY, "content": "First"})
    client.put(path, json={**STORY, "content": "Second"})

    restored = client.post(
        f"/api/admin/people/{person['id']}/story/revisions/1/restore",
        json={},
        headers={"X-Authentik-Username": "editor"},
    )

    assert restored.status_code == 200
    current = restored.json()["current_revision"]
    assert current["revision_number"] == 3
    assert current["restored_from"] == 1
    assert current["change_note"] == "Restored version 1"
    assert current["created_by"] == "editor"
    assert (
        client.get(f"/api/people/{person['id']}").json()["current_story"]["content"]
        == "First"
    )
    assert [item["content"] for item in versions(client, person)] == [
        "First",
        "Second",
        "First",
    ]


def test_restoring_takes_an_editors_note(client: TestClient) -> None:
    person = create_person(client)
    path = f"/api/people/{person['id']}/story"
    client.put(path, json={**STORY, "content": "First"})
    client.put(path, json={**STORY, "content": "Second"})

    restored = client.post(
        f"/api/admin/people/{person['id']}/story/revisions/1/restore",
        json={"change_note": "The family asked for this"},
    )

    assert restored.json()["current_revision"]["change_note"] == (
        "The family asked for this"
    )


def test_restoring_refuses_what_it_cant_do(client: TestClient) -> None:
    person = create_person(client)
    restore = f"/api/admin/people/{person['id']}/story/revisions"
    assert client.post(f"{restore}/1/restore", json={}).status_code == 404

    client.put(f"/api/people/{person['id']}/story", json=STORY)
    client.put(f"/api/people/{person['id']}/story", json=STORY)

    missing = client.post(f"{restore}/9/restore", json={})
    same_text = client.post(f"{restore}/1/restore", json={})
    client.put(
        f"/api/people/{person['id']}/story", json={**STORY, "content": "Changed"}
    )
    stale = client.post(f"{restore}/1/restore", json={"base_revision_number": 2})

    assert missing.status_code == 404
    assert same_text.status_code == 409
    assert "already has this text" in same_text.json()["detail"]
    assert stale.status_code == 409
    assert len(versions(client, person)) == 3
    assert client.post(f"{restore}/0/restore", json={}).status_code == 422
