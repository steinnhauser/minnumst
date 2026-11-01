import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from minnumst_api.models import Person

# Letters that are not accented variants, so Unicode decomposition keeps them.
TRANSLITERATION = str.maketrans({"þ": "th", "ð": "d", "æ": "ae", "ø": "o", "ß": "ss"})


def ascii_folded(value: str) -> str:
    """Lowercase, transliterate and strip accents: Sigríður -> sigridur."""
    decomposed = unicodedata.normalize("NFKD", value.lower().translate(TRANSLITERATION))
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def normalized_person_name(name: str) -> str:
    return " ".join(ascii_folded(name).split())


def person_slug(name: str) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", ascii_folded(name)))


def person_identity(name: str, birth_date: str | None, death_date: str | None) -> str:
    """What must be unique: many people share a name, but rarely with their dates."""
    return "|".join((normalized_person_name(name), birth_date or "", death_date or ""))


def unique_person_slug(
    session: Session, name: str, birth_date: str | None = None
) -> str:
    """The name's slug; if that's taken, with the birth year, then with a number."""

    def taken(slug: str) -> bool:
        return session.scalar(select(Person.id).where(Person.slug == slug)) is not None

    name_slug = person_slug(name) or "person"
    if not taken(name_slug):
        return name_slug
    base_slug = f"{name_slug}-{birth_date[:4]}" if birth_date else name_slug
    slug = base_slug
    suffix = 2
    while taken(slug):
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug


def new_person(
    session: Session, name: str, birth_date: str | None, death_date: str | None
) -> Person:
    """A person who passed validation, ready to add to the session."""
    return Person(
        name=name,
        normalized_name=normalized_person_name(name),
        birth_date=birth_date,
        death_date=death_date,
        identity=person_identity(name, birth_date, death_date),
        slug=unique_person_slug(session, name, birth_date),
    )
