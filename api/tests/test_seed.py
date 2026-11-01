import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from minnumst_api import seed
from minnumst_api.config import settings
from minnumst_api.database import make_engine
from minnumst_api.migrate import upgrade
from minnumst_api.models import BlogPost, Person, PersonSource
from minnumst_api.seed import import_batch, read_batch, remove_batch


def record(qid: str, name: str = "Jón Jónsson", **dates: str | None) -> dict:
    return {
        "name": name,
        "birth_date": dates.get("birth_date"),
        "death_date": dates.get("death_date"),
        "sources": [
            {
                "source": "wikidata",
                "external_id": qid,
                "title": "Wikidata",
                "url": f"https://www.wikidata.org/wiki/{qid}",
            }
        ],
    }


@pytest.fixture
def engine(tmp_path: Path) -> Iterator[Engine]:
    engine = make_engine(f"sqlite:///{tmp_path}/seed.db")
    upgrade(engine)
    yield engine
    engine.dispose()


def names(engine: Engine) -> list[str]:
    with Session(engine) as session:
        return sorted(session.scalars(select(Person.slug)))


BATCH = [
    record("Q1", birth_date="1811", death_date="1879"),
    record("Q2", birth_date="1790"),
    record("Q3", name="Recent", birth_date="1950", death_date="2025-01-01"),
    record("Q4", name="Too young", birth_date="1950"),
    record("Q5", name="No dates"),
    record("Q6", birth_date="1811", death_date="1879"),
]


def test_plan_reports_without_changing_anything(engine: Engine) -> None:
    report = import_batch(engine, BATCH, apply=False)

    assert report == {
        "imported": 2,
        "skipped_ineligible_or_invalid": 3,
        "skipped_same_name_and_dates": 1,
    }
    assert names(engine) == []


def test_apply_imports_the_eligible_and_can_be_repeated(engine: Engine) -> None:
    import_batch(engine, BATCH, apply=True)

    assert names(engine) == ["jon-jonsson", "jon-jonsson-1790"]
    with Session(engine) as session:
        assert session.scalar(select(PersonSource.url)).startswith("https://www.")

    again = import_batch(engine, BATCH, apply=True)

    assert again["imported"] == 0
    assert again["skipped_already_imported"] == 2
    assert names(engine) == ["jon-jonsson", "jon-jonsson-1790"]


def test_only_https_source_links_are_imported(engine: Engine) -> None:
    bad = record("Q9", birth_date="1800")
    bad["sources"][0]["url"] = "javascript:alert(1)"

    report = import_batch(engine, [bad], apply=True)

    assert report == {"skipped_ineligible_or_invalid": 1}


def test_remove_keeps_anyone_with_a_story(engine: Engine) -> None:
    import_batch(engine, BATCH, apply=True)
    with Session(engine) as session:
        person = session.scalar(select(Person).where(Person.slug == "jon-jonsson"))
        session.add(BlogPost(person_id=person.id))
        session.commit()

    report = remove_batch(engine, [*BATCH[:2], record("Q99")])

    assert report == {"kept_has_a_story": 1, "removed": 1, "not_found": 1}
    assert names(engine) == ["jon-jonsson"]


def test_a_batch_file_reads_as_json_lines(tmp_path: Path) -> None:
    path = tmp_path / "batch.jsonl"
    path.write_text(json.dumps(BATCH[0]) + "\n\n", encoding="utf-8")

    assert read_batch(path) == [BATCH[0]]


@pytest.mark.parametrize(
    ("action", "expected", "people"),
    [
        ("plan", '"imported": 1', 0),
        ("apply", '"imported": 1', 1),
        ("remove", '"not_found": 1', 0),
    ],
)
def test_the_command_reports_counts_only(
    engine: Engine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    action: str,
    expected: str,
    people: int,
) -> None:
    path = tmp_path / "batch.jsonl"
    path.write_text(json.dumps(BATCH[0]) + "\n", encoding="utf-8")
    monkeypatch.setattr(settings, "database_url", str(engine.url))
    monkeypatch.setattr("sys.argv", ["seed", action, str(path)])

    seed.main()

    output = capsys.readouterr().out
    assert expected in output
    assert "Jón" not in output
    assert len(names(engine)) == people
