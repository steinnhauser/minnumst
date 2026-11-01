from datetime import date

import pytest
from fastapi.testclient import TestClient

from minnumst_api.eligibility import is_eligible, valid_partial_date
from minnumst_api.main import create_app
from minnumst_api.migrate import upgrade

TODAY = date(2026, 11, 1)


@pytest.mark.parametrize(
    ("birth", "death", "expected"),
    [
        # A death on record decides, whatever the birth year.
        (None, "2021-10-31", True),
        (None, "2021-11-01", False),
        (None, "2021-11-02", False),
        ("1850", "2026-01-01", False),
        # A bare year may mean its last day.
        (None, "2020", True),
        (None, "2021", False),
        # Without a death, only the birth year: 2026 - 128 = 1898.
        ("1898", None, True),
        ("1898-12-31", None, True),
        ("1899", None, False),
        ("1899-01-01", None, False),
        (None, None, False),
    ],
)
def test_boundaries_of_the_rule(
    birth: str | None, death: str | None, expected: bool
) -> None:
    assert is_eligible(birth, death, TODAY) is expected


def test_a_leap_day_does_not_break_the_rule() -> None:
    leap_day = date(2028, 2, 29)

    assert is_eligible(None, "2023-02-27", leap_day)
    assert not is_eligible(None, "2023-02-28", leap_day)


@pytest.mark.parametrize(
    ("value", "valid"),
    [
        ("1850", True),
        ("1850-03-14", True),
        ("0874", True),
        ("850", False),
        ("1850-03", False),
        ("1850-13-01", False),
        ("1850-02-30", False),
        ("about 1850", False),
    ],
)
def test_date_formats(value: str, valid: bool) -> None:
    assert valid_partial_date(value) is valid


@pytest.mark.parametrize(
    "body",
    [
        {"name": "No dates"},
        {"name": "Recent death", "death_date": "2100-01-01"},
        {"name": "Too young", "birth_date": "1950"},
        {"name": "Wrong format", "birth_date": "1850-03"},
    ],
)
def test_the_api_refuses_anyone_who_fails_the_rule(body: dict) -> None:
    app = create_app(database_url="sqlite://")
    upgrade(app.state.engine)
    with TestClient(app) as client:
        created = client.post("/api/people", json=body)
        person = client.post(
            "/api/people", json={"name": "Valid", "birth_date": "1850"}
        ).json()
        updated = client.patch(f"/api/people/{person['id']}", json=body)

    assert (created.status_code, updated.status_code) == (422, 422)
