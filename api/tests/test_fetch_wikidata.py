import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "tools/scripts/fetch_wikidata.py"


@pytest.fixture
def fetcher() -> ModuleType:
    spec = importlib.util.spec_from_file_location("fetch_wikidata", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def row(qid: str, name: str, lang: str = "is", **fields: str) -> dict:
    result = {
        "person": {"value": f"http://www.wikidata.org/entity/{qid}"},
        "name": {"value": name, "xml:lang": lang},
    }
    for key in ("birth", "death"):
        if key in fields:
            result[key] = {"value": f"{fields[key]}T00:00:00Z"}
            result[f"{key}Precision"] = {"value": fields.get(f"{key}_precision", "11")}
    if "article" in fields:
        result["article"] = {"value": fields["article"]}
    return result


def names(fetcher: ModuleType, rows: list[dict]) -> list[str]:
    return [record["name"] for record in fetcher.to_records(rows)]


def test_living_people_never_reach_the_batch(fetcher: ModuleType) -> None:
    rows = [
        row("Q1", "Alive Today", birth="1977-08-22"),
        row("Q2", "Died Recently", birth="1950-01-01", death="2025-01-01"),
        row("Q3", "Long Gone", birth="1811-06-17", death="1879-12-07"),
        row("Q4", "Born Long Ago", birth="1850-01-01"),
    ]

    assert names(fetcher, rows) == ["Long Gone", "Born Long Ago"]


def test_vague_or_conflicting_dates_count_against_a_person(fetcher: ModuleType) -> None:
    rows = [
        # A death known only to the decade can't be placed, whatever the birth.
        row("Q1", "Vague", birth="1850-01-01", death="1900-01-01", death_precision="8"),
        # Of two recorded deaths, the recent one decides.
        row("Q2", "Conflict", death="1990-01-01"),
        row("Q2", "Conflict", death="2025-01-01"),
        row("Q3", "Before Our Era", birth="-0100-01-01"),
    ]

    assert names(fetcher, rows) == []


def test_records_keep_only_names_dates_and_links(fetcher: ModuleType) -> None:
    rows = [
        row("Q7", "English Name", "en", birth="1800-01-01", birth_precision="9"),
        row(
            "Q7",
            "Íslenskt Nafn (prestur)",
            birth="1800-01-01",
            birth_precision="9",
            death="1870-05-04",
            article="https://is.wikipedia.org/wiki/Nafn",
        ),
    ]

    [record] = fetcher.to_records(rows)

    assert set(record) == {"name", "birth_date", "death_date", "sources"}
    assert record["name"] == "Íslenskt Nafn"
    assert (record["birth_date"], record["death_date"]) == ("1800", "1870-05-04")
    assert [source["url"] for source in record["sources"]] == [
        "https://www.wikidata.org/wiki/Q7",
        "https://is.wikipedia.org/wiki/Nafn",
    ]
