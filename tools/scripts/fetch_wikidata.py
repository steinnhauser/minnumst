#!/usr/bin/env python3
"""Write the people Wikidata (CC0) knows as Icelandic to a batch file for review.

Asks the public query service once and keeps only names, birth and death dates
and links, and only for people who pass the archive's rule: the answer includes
living people, who must never reach a file. The file stays out of Git and is read
before anything is imported, and the import checks every person again
(`minnumst_api.seed`). Run with `make import fetch`.
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from minnumst_api.eligibility import is_eligible

ENDPOINT = "https://query.wikidata.org/sparql"
USER_AGENT = "Minnumst/1.0 (https://minnumst.org; contact@minnumst.org)"
# Wikidata's precision codes: 9 is a year, 11 a day. Anything vaguer can't show
# that someone qualifies, so it counts as no date at all.
YEAR, DAY = 9, 11
QUERY = """
SELECT ?person ?name ?birth ?birthPrecision ?death ?deathPrecision ?article WHERE {
  ?person wdt:P31 wd:Q5; wdt:P27 wd:Q189.
  ?person rdfs:label ?name. FILTER(LANG(?name) = "is" || LANG(?name) = "en")
  OPTIONAL {
    ?person p:P569 ?birthStatement.
    ?birthStatement wikibase:rank ?birthRank; psv:P569 ?birthValue.
    ?birthValue wikibase:timeValue ?birth; wikibase:timePrecision ?birthPrecision.
    FILTER(?birthRank != wikibase:DeprecatedRank)
  }
  OPTIONAL {
    ?person p:P570 ?deathStatement.
    ?deathStatement wikibase:rank ?deathRank; psv:P570 ?deathValue.
    ?deathValue wikibase:timeValue ?death; wikibase:timePrecision ?deathPrecision.
    FILTER(?deathRank != wikibase:DeprecatedRank)
  }
  OPTIONAL {
    ?article schema:about ?person; schema:isPartOf <https://is.wikipedia.org/>.
  }
  FILTER(BOUND(?birth) || BOUND(?death))
}
"""


def partial_date(value: str, precision: str) -> str | None:
    """YYYY-MM-DD at day precision, YYYY at month or year, nothing vaguer or BCE."""
    if value.startswith("-") or int(precision) < YEAR:
        return None
    return value[:10] if int(precision) == DAY else value[:4]


def clean_name(label: str) -> str:
    """Drop the disambiguation some labels carry: Jón Helgason (biskup)."""
    return re.sub(r"\s*\([^)]*\)$", "", label).strip()


def fetch() -> list[dict]:
    request = Request(
        f"{ENDPOINT}?{urlencode({'query': QUERY})}",
        headers={"Accept": "application/sparql-results+json", "User-Agent": USER_AGENT},
    )
    with urlopen(request, timeout=120) as response:
        return json.load(response)["results"]["bindings"]


def to_records(rows: list[dict]) -> list[dict]:
    people: dict[str, dict] = defaultdict(
        lambda: {"names": {}, "births": set(), "deaths": set(), "article": None}
    )
    for row in rows:
        qid = row["person"]["value"].rsplit("/", 1)[1]
        person = people[qid]
        person["names"][row["name"]["xml:lang"]] = row["name"]["value"]
        if "birth" in row:
            person["births"].add(
                partial_date(row["birth"]["value"], row["birthPrecision"]["value"])
            )
        if "death" in row:
            person["deaths"].add(
                partial_date(row["death"]["value"], row["deathPrecision"]["value"])
            )
        if "article" in row:
            person["article"] = row["article"]["value"]

    records = []
    for qid, person in people.items():
        births = person["births"] - {None}
        deaths = person["deaths"] - {None}
        # A recorded death too vague to place leaves the person in doubt: exclude.
        if None in person["deaths"] and not deaths:
            continue
        # Of conflicting dates, the latest is the cautious one for the five-year rule.
        birth_date = max(births) if births else None
        death_date = max(deaths) if deaths else None
        if not is_eligible(birth_date, death_date):
            continue
        record = {
            "name": clean_name(person["names"].get("is") or person["names"]["en"]),
            "birth_date": birth_date,
            "death_date": death_date,
            "sources": [
                {
                    "source": "wikidata",
                    "external_id": qid,
                    "title": "Wikidata",
                    "url": f"https://www.wikidata.org/wiki/{quote(qid)}",
                }
            ],
        }
        if person["article"]:
            record["sources"].append(
                {
                    "source": "is.wikipedia",
                    "external_id": qid,
                    "title": "Wikipedia (íslenska)",
                    "url": person["article"],
                }
            )
        records.append(record)
    return sorted(records, key=lambda item: int(item["sources"][0]["external_id"][1:]))


def main() -> None:
    target = Path(sys.argv[1]) if sys.argv[1:] else None
    if target is None:
        raise SystemExit("Usage: fetch_wikidata.py <output.jsonl>")
    records = to_records(fetch())
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as output:
        for record in records:
            output.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
    print(f"{len(records)} people written on {datetime.now(UTC).date()}")


if __name__ == "__main__":
    main()
