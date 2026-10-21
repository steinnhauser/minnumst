import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from minnumst_api.models import Person


def normalized_person_name(name: str) -> str:
    decomposed = unicodedata.normalize("NFKD", name)
    unaccented = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(unaccented.strip().lower().split())


def person_slug(name: str) -> str:
    transliteration = str.maketrans({"þ": "th", "ð": "d", "æ": "ae", "ö": "o"})
    value = unicodedata.normalize("NFKD", name.lower().translate(transliteration))
    unaccented = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", unaccented))


def unique_person_slug(session: Session, name: str) -> str:
    base_slug = person_slug(name) or "person"
    slug = base_slug
    suffix = 2
    while session.scalar(select(Person.id).where(Person.slug == slug)) is not None:
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug
