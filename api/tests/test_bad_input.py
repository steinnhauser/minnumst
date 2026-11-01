"""What people, and people up to no good, can type into every field."""

import unicodedata
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect

from minnumst_api.main import create_app
from minnumst_api.migrate import upgrade
from minnumst_api.names import search_key, sort_key

ICELANDIC = "ÁáÐðÉéÍíÓóÚúÝýÞþÆæÖö"
DECOMPOSED = unicodedata.normalize("NFD", "Sigríður Jónsdóttir")
SQL_INJECTIONS = [
    "' OR '1'='1",
    "'; DROP TABLE people; --",
    '" OR ""="',
    "%' OR 1=1 --",
    "\\'; DELETE FROM stories; --",
    "1; SELECT pg_sleep(5)",
]
SCRIPTS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
    "{{7*7}}",
    "${7*7}",
]


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = create_app(database_url="sqlite://")
    upgrade(app.state.engine)
    with TestClient(app) as test_client:
        yield test_client


def create(client: TestClient, name: str, birth: str = "1850") -> dict:
    response = client.post("/api/people", json={"name": name, "birth_date": birth})
    assert response.status_code == 201, response.text
    return response.json()


def names(client: TestClient, query: str) -> list[str]:
    page = client.get("/api/people", params={"query": query}).json()
    return [item["name"] for item in page["items"]]


@pytest.mark.parametrize("attack", SQL_INJECTIONS)
def test_sql_in_every_field_stays_plain_text(client: TestClient, attack: str) -> None:
    person = create(client, "Anna Jónsdóttir")
    story = {"title": attack, "excerpt": attack, "content": attack}

    # Either refused as too short, or searched for as plain text and not found.
    searched = client.get("/api/people", params={"query": attack})
    assert searched.status_code == 422 or searched.json()["total"] == 0
    assert client.get(f"/api/people/by-slug/{attack}").status_code in {404, 405}
    named = create(client, f"Anna {attack}")
    assert named["name"] == " ".join(f"Anna {attack}".split())
    saved = client.put(
        f"/api/people/{person['id']}/story", json={**story, "change_note": attack}
    )
    assert saved.json()["current_revision"]["content"] == attack
    assert saved.json()["current_revision"]["change_note"] == attack
    suggestion = client.post(
        f"/api/people/{person['id']}/suggestions",
        json={"kind": "edit", **story, "note": attack},
    )
    assert suggestion.status_code == 201
    [queued] = client.get("/api/admin/suggestions").json()["items"]
    assert (queued["content"], queued["note"]) == (attack, attack)

    tables = inspect(client.app.state.engine).get_table_names()
    assert {"people", "stories", "story_revisions", "suggestions"} <= set(tables)
    assert client.get("/api/people").json()["total"] == 2


@pytest.mark.parametrize("attack", SCRIPTS)
def test_markup_in_text_is_kept_as_written_for_the_page_to_escape(
    client: TestClient, attack: str
) -> None:
    person = create(client, "Anna")

    saved = client.put(
        f"/api/people/{person['id']}/story",
        json={"title": attack, "content": attack},
    )

    assert saved.json()["current_revision"]["content"] == attack
    assert saved.headers["content-type"] == "application/json"


@pytest.mark.parametrize(
    "name", ["<script>alert(1)</script>", "Anna <b>", "Anna {{7*7}}"]
)
def test_markup_is_refused_in_names(client: TestClient, name: str) -> None:
    body = {"name": name, "birth_date": "1850"}

    assert client.post("/api/people", json=body).status_code == 422


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "file:///etc/passwd",
        "//example.org",
        "https://exa mple.org",
        "https://example.org/a\nb",
    ],
)
def test_only_plain_web_addresses_are_accepted_as_sources(
    client: TestClient, url: str
) -> None:
    person = create(client, "Anna")

    response = client.post(
        f"/api/people/{person['id']}/suggestions",
        json={"kind": "request", "note": "A note", "source_url": url},
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {"name": 123, "birth_date": "1850"},
        {"name": ["Anna"], "birth_date": "1850"},
        {"name": None, "birth_date": "1850"},
        {"name": True, "birth_date": "1850"},
        {"name": "Anna", "birth_date": 1850},
        {"name": "Anna", "birth_date": "١٨٥٠"},
        {"name": "Anna", "birth_date": "1850\n"},
        {"birth_date": "1850"},
        {},
    ],
)
def test_wrong_types_are_refused(client: TestClient, body: dict) -> None:
    if body.get("birth_date") == "1850\n":
        # Surrounding whitespace is harmless and cleaned, unlike the others.
        assert client.post("/api/people", json=body).json()["birth_date"] == "1850"
        return
    assert client.post("/api/people", json=body).status_code == 422


@pytest.mark.parametrize(
    "content",
    [b"not json", b"[[[[", b"[" * 100000, b'{"kind": "request", "note": "\xff"}', b""],
)
def test_malformed_bodies_are_refused_cleanly(
    client: TestClient, content: bytes
) -> None:
    person = create(client, "Anna")

    response = client.post(
        f"/api/people/{person['id']}/suggestions",
        content=content,
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code in {400, 422}
    assert client.get("/api/admin/suggestions").json()["total"] == 0


def test_a_suggestion_must_be_sent_as_json(client: TestClient) -> None:
    person = create(client, "Anna")

    response = client.post(
        f"/api/people/{person['id']}/suggestions",
        content=b'{"kind": "request", "note": "A note"}',
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 422


def test_icelandic_letters_come_back_exactly_as_sent(client: TestClient) -> None:
    person = create(client, f"Anna {ICELANDIC}")
    story = {"title": ICELANDIC, "excerpt": ICELANDIC, "content": ICELANDIC}

    client.put(f"/api/people/{person['id']}/story", json=story)

    assert person["name"] == f"Anna {ICELANDIC}"
    read = client.get(f"/api/people/{person['id']}").json()
    assert read["name"] == f"Anna {ICELANDIC}"
    assert read["current_story"]["title"] == ICELANDIC
    assert read["current_story"]["content"] == ICELANDIC


def test_letters_are_composed_however_they_were_typed(client: TestClient) -> None:
    person = create(client, DECOMPOSED)
    duplicate = client.post(
        "/api/people", json={"name": "Sigríður Jónsdóttir", "birth_date": "1850"}
    )

    assert DECOMPOSED != "Sigríður Jónsdóttir"
    assert person["name"] == "Sigríður Jónsdóttir"
    assert duplicate.status_code == 409
    assert person["slug"] == "sigridur-jonsdottir"
    assert names(client, unicodedata.normalize("NFD", "Sigríður")) == [person["name"]]

    saved = client.put(
        f"/api/people/{person['id']}/story",
        json={"title": DECOMPOSED, "content": DECOMPOSED},
    )
    assert saved.json()["current_revision"]["content"] == "Sigríður Jónsdóttir"


def test_invisible_characters_are_removed_from_names_and_text(
    client: TestClient,
) -> None:
    person = create(client, "J\u200bón\u00ad\ufeff Jónsson\x07")

    assert person["name"] == "Jón Jónsson"
    assert names(client, "J\u200bón") == ["Jón Jónsson"]
    saved = client.put(
        f"/api/people/{person['id']}/story",
        json={
            "title": "A\u202eB\nC",
            "content": "One\x0b\r\nTwo\rThree\tFour\u2066",
        },
    ).json()["current_revision"]
    assert saved["title"] == "AB C"
    assert saved["content"] == "One\nTwo\nThree\tFour"


def test_a_reversed_or_oversized_search_is_harmless(client: TestClient) -> None:
    create(client, "Anna")

    assert client.get("/api/people", params={"query": "a" * 256}).status_code == 422
    assert client.get("/api/people", params={"query": "\u0301"}).status_code == 422
    assert client.get("/api/people", params={"limit": "1; DROP"}).status_code == 422


@pytest.mark.parametrize(
    ("typed", "stored"),
    [
        ("sigurdur", "Sigurður Björnsson"),
        ("SIGURÐUR", "Sigurður Björnsson"),
        ("bjornsson", "Sigurður Björnsson"),
        ("björnsson sigurdur", "Sigurður Björnsson"),
        ("sig björn", "Sigurður Björnsson"),
        ("thora", "Þóra Ólafsdóttir"),
        ("tora", "Þóra Ólafsdóttir"),
        ("þora", "Þóra Ólafsdóttir"),
        ("olafsdottir", "Þóra Ólafsdóttir"),
        ("saemundur", "Sæmundur Fróði"),
        ("samundur", "Sæmundur Fróði"),
        ("sæmundur frodi", "Sæmundur Fróði"),
        ("yr isl", "Ýr Ísleifsdóttir"),
        ("ir isleifs", "Ýr Ísleifsdóttir"),
        ("guðrun", "Guðrún Ósvífursdóttir"),
        ("gudrun osvifurs", "Guðrún Ósvífursdóttir"),
    ],
)
def test_search_forgives_how_icelandic_letters_are_typed(
    client: TestClient, typed: str, stored: str
) -> None:
    for name in (
        "Sigurður Björnsson",
        "Þóra Ólafsdóttir",
        "Sæmundur Fróði",
        "Ýr Ísleifsdóttir",
        "Guðrún Ósvífursdóttir",
    ):
        create(client, name)

    assert names(client, typed) == [stored]


def test_search_requires_every_word(client: TestClient) -> None:
    create(client, "Sigurður Björnsson")

    assert names(client, "sigurdur jonsson") == []


def test_renaming_updates_what_search_and_sorting_use(client: TestClient) -> None:
    person = create(client, "Anna")

    client.patch(
        f"/api/people/{person['id']}", json={"name": "Þóra", "birth_date": "1850"}
    )

    assert names(client, "tora") == ["Þóra"]
    assert names(client, "anna") == []


def test_people_are_listed_in_icelandic_alphabetical_order(client: TestClient) -> None:
    alphabetical = [
        "Anna",
        "Ása",
        "Bára",
        "Davíð",
        "Ðuríður",
        "Elín",
        "Ína",
        "Jón",
        "Óli",
        "Unnur",
        "Úlfur",
        "Ýr",
        "Zóphanías",
        "Þóra",
        "Ægir",
        "Örn",
    ]
    for name in reversed(alphabetical):
        create(client, name)

    assert names(client, "") == alphabetical


def test_keys_cope_with_letters_outside_the_alphabet() -> None:
    assert sort_key("Müller") == sort_key("Muller")
    assert sort_key("Anna María") < sort_key("Annabella")
    assert sort_key("李") == ""
    assert search_key("  Þór   ÞÓR ") == "tor tor"
