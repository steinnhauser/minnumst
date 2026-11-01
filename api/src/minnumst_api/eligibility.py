"""Who the archive may hold: only people dead for more than five years.

Iceland's Act 90/2018 covers the dead for five years. A person qualifies through
a recorded date of death more than five years and two months ago, the two months
being a margin for inexact records, or, without one, through being born at least
128 years before the current year. Every way in (the API and the import) goes
through this one rule, and doubtful dates count against a person.
"""

import re
from calendar import monthrange
from datetime import UTC, date, datetime

PARTIAL_DATE = re.compile(r"[0-9]{4}(-[0-9]{2}-[0-9]{2})?")
MONTHS_DEAD = 5 * 12 + 2
YEARS_SINCE_BIRTH = 128


def valid_partial_date(value: str) -> bool:
    if not PARTIAL_DATE.fullmatch(value):
        return False
    try:
        date.fromisoformat(value if len(value) > 4 else f"{value}-01-01")
    except ValueError:
        return False
    return True


def _latest_day(value: str) -> date:
    """The last day a partial date could mean: a bare year may be December 31."""
    return date.fromisoformat(value if len(value) > 4 else f"{value}-12-31")


def _earliest_day(value: str) -> date:
    return date.fromisoformat(value if len(value) > 4 else f"{value}-01-01")


def dates_in_order(birth_date: str | None, death_date: str | None) -> bool:
    """False only when a death certainly came before the birth."""
    if not (birth_date and death_date):
        return True
    return _earliest_day(birth_date) <= _latest_day(death_date)


def _months_before(today: date, months: int) -> date:
    """The same day that many months earlier, or that month's last day if shorter."""
    year, month = divmod(today.year * 12 + today.month - 1 - months, 12)
    month += 1
    return date(year, month, min(today.day, monthrange(year, month)[1]))


def is_eligible(
    birth_date: str | None, death_date: str | None, today: date | None = None
) -> bool:
    today = today or datetime.now(UTC).date()
    if death_date:
        return _latest_day(death_date) < _months_before(today, MONTHS_DEAD)
    if birth_date:
        return int(birth_date[:4]) <= today.year - YEARS_SINCE_BIRTH
    return False


INELIGIBLE = (
    "The archive only holds people with a recorded death more than five years and "
    "two months ago "
    f"or, without one, born at least {YEARS_SINCE_BIRTH} years before this year"
)
